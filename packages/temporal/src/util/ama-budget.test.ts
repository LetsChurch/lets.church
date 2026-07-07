import { describe, expect, test } from 'vitest';

import { AmaDeviceBudget, Notifier } from './ama-budget';

// Lets a microtask-scheduled acquire settle so we can assert on ordering.
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('Notifier', () => {
  test('notify wakes every waiter parked at the time', async () => {
    const notifier = new Notifier();
    let aWoke = false;
    let bWoke = false;
    const a = notifier.wait().then(() => {
      aWoke = true;
    });
    const b = notifier.wait().then(() => {
      bWoke = true;
    });

    await tick();
    expect(aWoke).toBe(false);
    expect(bWoke).toBe(false);

    notifier.notify();
    await Promise.all([a, b]);
    expect(aWoke).toBe(true);
    expect(bWoke).toBe(true);
  });

  test('is edge-triggered: a waiter parked after notify keeps waiting', async () => {
    const notifier = new Notifier();
    notifier.notify(); // no waiters yet

    let woke = false;
    const pending = notifier.wait().then(() => {
      woke = true;
    });
    await tick();
    expect(woke).toBe(false); // the earlier notify did nothing for this waiter

    notifier.notify();
    await pending;
    expect(woke).toBe(true);
  });

  test('a pre-aborted signal rejects immediately', async () => {
    const notifier = new Notifier();
    const controller = new AbortController();
    controller.abort();
    await expect(notifier.wait(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  test('aborting a parked waiter rejects it and removes it (later notify is a no-op)', async () => {
    const notifier = new Notifier();
    const controller = new AbortController();
    const settled: string[] = [];
    const waiter = notifier.wait(controller.signal).then(
      () => settled.push('resolved'),
      (err: Error) => settled.push(`rejected:${err.name}`),
    );

    await tick();
    controller.abort();
    await waiter;
    expect(settled).toEqual(['rejected:AbortError']);

    // The aborted waiter must have been removed, so notify() neither throws nor
    // re-settles it.
    expect(() => notifier.notify()).not.toThrow();
    await tick();
    expect(settled).toEqual(['rejected:AbortError']);
  });
});

describe('AmaDeviceBudget', () => {
  const make = (sessions: number, pixels: number) =>
    new AmaDeviceBudget({ sessions, pixels });

  test('admits while both dimensions fit; reports free in each', async () => {
    const b = make(4, 6);
    expect(b.freeSessions()).toBe(4);
    expect(b.freePixels()).toBe(6);

    const release = await b.acquire({ sessions: 2, pixels: 3 });
    expect(b.freeSessions()).toBe(2);
    expect(b.freePixels()).toBe(3);

    release();
    expect(b.freeSessions()).toBe(4);
    expect(b.freePixels()).toBe(6);
  });

  test('blocks when the SESSION dimension is full even if pixels fit (the incident)', async () => {
    // 4 sessions, generous pixels. A 3-session ladder runs; a 2-session job
    // would need 5 sessions -> blocks, despite ample pixel headroom. This is
    // exactly the case the pixel-only budget missed.
    const b = make(4, 100);
    const first = await b.acquire({ sessions: 3, pixels: 1 });

    let secondGot = false;
    const second = b.acquire({ sessions: 2, pixels: 1 }).then((r) => {
      secondGot = true;
      return r;
    });

    await tick();
    expect(secondGot).toBe(false); // 3 + 2 > 4 sessions

    first();
    const release = await second;
    expect(secondGot).toBe(true);
    release();
  });

  test('blocks when the PIXEL dimension is full even if sessions fit', async () => {
    const b = make(100, 6);
    const first = await b.acquire({ sessions: 1, pixels: 5 });

    let secondGot = false;
    const second = b.acquire({ sessions: 1, pixels: 2 }).then((r) => {
      secondGot = true;
      return r;
    });

    await tick();
    expect(secondGot).toBe(false); // 5 + 2 > 6 pixels

    first();
    const release = await second;
    expect(secondGot).toBe(true);
    release();
  });

  test('runs an oversized job alone rather than deadlocking', async () => {
    const b = make(4, 6);
    // Exceeds both dimensions; must still run when the device is idle.
    const release = await b.acquire({ sessions: 6, pixels: 9 });
    expect(b.usedSessions()).toBe(6);
    expect(b.usedPixels()).toBe(9);
    release();
    expect(b.freeSessions()).toBe(4);
    expect(b.freePixels()).toBe(6);
  });

  test('snaps used back to exactly 0 when nothing is in flight (no float drift)', async () => {
    const b = make(4, 6);
    // Fractional pixel costs across cycles would otherwise leave used.pixels at
    // +/-1e-16; the snap keeps it exactly 0 so the run-alone check stays valid.
    for (const px of [0.1, 0.7, 1.69, 0.4444, 0.85]) {
      const r = await b.acquire({ sessions: 1, pixels: px });
      r();
    }
    expect(b.usedPixels()).toBe(0); // exactly 0, not -0.00
    expect(b.usedSessions()).toBe(0);
    expect(b.freePixels()).toBe(6);
  });

  test('an oversized job still runs alone AFTER prior acquire/release cycles (drift regression)', async () => {
    const b = make(4, 6);
    // Reproduces the 2026-06-25 wedge: cycles leave a near-zero residual, then
    // an oversized-pixel job (18.52 > 6, the malformed-probe case) must still be
    // admitted on the now-empty device instead of queueing forever.
    for (let i = 0; i < 10; i++) {
      const r = await b.acquire({ sessions: 0, pixels: 0.123 });
      r();
    }
    let admitted = false;
    const pending = b.acquire({ sessions: 0, pixels: 18.52 }).then((r) => {
      admitted = true;
      return r;
    });
    await tick();
    expect(admitted).toBe(true); // ran alone, not wedged
    (await pending)();
  });

  test('oversized job waits for a running job, then runs alone', async () => {
    const b = make(4, 6);
    const releaseFirst = await b.acquire({ sessions: 2, pixels: 2 });

    let admitted = false;
    const pending = b.acquire({ sessions: 0, pixels: 18.52 }).then((r) => {
      admitted = true;
      return r;
    });
    await tick();
    expect(admitted).toBe(false); // device not empty -> oversized must wait

    releaseFirst(); // now empty -> oversized runs alone
    (await pending)();
    expect(admitted).toBe(true);
  });

  test('zero-cost jobs (audio-only) never block', async () => {
    const b = make(4, 6);
    await b.acquire({ sessions: 4, pixels: 6 }); // fully consumed
    const release = await b.acquire({ sessions: 0, pixels: 0 }); // immediate
    expect(b.freeSessions()).toBe(0);
    release(); // no-op
    expect(b.freeSessions()).toBe(0);
  });

  test('release is idempotent', async () => {
    const b = make(4, 6);
    const release = await b.acquire({ sessions: 2, pixels: 3 });
    release();
    release();
    expect(b.freeSessions()).toBe(4);
    expect(b.freePixels()).toBe(6);
  });

  test('a single release can admit multiple waiters that now fit', async () => {
    const b = make(4, 6);
    const full = await b.acquire({ sessions: 4, pixels: 6 });

    let aGot = false;
    let bGot = false;
    const a = b.acquire({ sessions: 1, pixels: 2 }).then((r) => {
      aGot = true;
      return r;
    });
    const second = b.acquire({ sessions: 2, pixels: 3 }).then((r) => {
      bGot = true;
      return r;
    });

    await tick();
    expect(aGot).toBe(false);
    expect(bGot).toBe(false);

    full(); // frees 4 sessions / 6 pixels; both (1,2) and (2,3) now fit
    const [releaseA, releaseB] = await Promise.all([a, second]);
    expect(aGot).toBe(true);
    expect(bGot).toBe(true);
    expect(b.usedSessions()).toBe(3);
    expect(b.usedPixels()).toBeCloseTo(5);

    releaseA();
    releaseB();
    expect(b.freeSessions()).toBe(4);
  });

  test('aborting a waiting acquire rejects with AbortError and frees nothing', async () => {
    const b = make(4, 6);
    await b.acquire({ sessions: 4, pixels: 6 });

    const controller = new AbortController();
    const pending = b.acquire({ sessions: 1, pixels: 1 }, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(b.freeSessions()).toBe(0);
    expect(b.freePixels()).toBe(0);
  });
});
