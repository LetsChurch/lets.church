import { describe, expect, test } from 'vitest';
import { AmaEncodeBudget, Notifier } from './ama-budget';

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

describe('AmaEncodeBudget', () => {
  test('admits jobs while they fit and reports remaining budget', async () => {
    const budget = new AmaEncodeBudget(6);
    expect(budget.free()).toBe(6);

    const releaseA = await budget.acquire(4);
    expect(budget.free()).toBe(2);

    const releaseB = await budget.acquire(1.5);
    expect(budget.free()).toBeCloseTo(0.5);

    releaseA();
    releaseB();
    expect(budget.free()).toBe(6);
  });

  test('blocks an over-budget job until enough is released', async () => {
    const budget = new AmaEncodeBudget(6);
    const releaseFirst = await budget.acquire(5); // a 4K-ish ladder

    let secondAcquired = false;
    const second = budget.acquire(1.7).then((release) => {
      secondAcquired = true;
      return release;
    });

    await tick();
    expect(secondAcquired).toBe(false); // 5 + 1.7 > 6, must wait

    releaseFirst();
    const releaseSecond = await second;
    expect(secondAcquired).toBe(true);
    releaseSecond();
  });

  test('a single release can admit multiple waiters that now fit', async () => {
    const budget = new AmaEncodeBudget(6);
    const releaseFull = await budget.acquire(6); // fully consumed

    let aAcquired = false;
    let bAcquired = false;
    const a = budget.acquire(2).then((release) => {
      aAcquired = true;
      return release;
    });
    const b = budget.acquire(3).then((release) => {
      bAcquired = true;
      return release;
    });

    await tick();
    expect(aAcquired).toBe(false);
    expect(bAcquired).toBe(false);

    releaseFull(); // frees 6; both 2 and 3 now fit (5 <= 6)
    const [releaseA, releaseB] = await Promise.all([a, b]);
    expect(aAcquired).toBe(true);
    expect(bAcquired).toBe(true);
    expect(budget.used()).toBeCloseTo(5);

    releaseA();
    releaseB();
    expect(budget.free()).toBe(6);
  });

  test('runs a job larger than the whole budget alone rather than deadlocking', async () => {
    const budget = new AmaEncodeBudget(4);
    // A 4K ladder (~5.7 units) against a 4-unit device: must still run.
    const release = await budget.acquire(5.7);
    expect(budget.used()).toBeCloseTo(5.7);
    release();
    expect(budget.free()).toBe(4);
  });

  test('zero-cost jobs (audio-only) never block', async () => {
    const budget = new AmaEncodeBudget(6);
    await budget.acquire(6); // fully consumed
    const release = await budget.acquire(0); // resolves immediately
    expect(budget.free()).toBe(0);
    release(); // no-op
    expect(budget.free()).toBe(0);
  });

  test('release is idempotent', async () => {
    const budget = new AmaEncodeBudget(6);
    const release = await budget.acquire(3);
    release();
    release();
    expect(budget.free()).toBe(6);
  });

  test('aborting a waiting acquire rejects with AbortError and frees nothing', async () => {
    const budget = new AmaEncodeBudget(6);
    await budget.acquire(6);

    const controller = new AbortController();
    const pending = budget.acquire(2, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(budget.free()).toBe(0);
  });
});
