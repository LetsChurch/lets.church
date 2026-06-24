import { AmaDeviceBudget } from '@letschurch/temporal/util/ama-budget';
import type {
  ActivitySlotInfo,
  SlotReleaseContext,
  SlotReserveContext,
} from '@temporalio/worker';
import { describe, expect, test } from 'vitest';
import { createAmaActivitySlotSupplier } from './ama-slot-supplier';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

// The supplier ignores the reserve/release context entirely (it gates on the
// budget singleton + an internal counter), so a minimal stub is sufficient.
const reserveCtx: SlotReserveContext = {
  slotType: 'activity',
  taskQueue: 'transcode',
  workerIdentity: 'test',
  workerBuildId: '',
  isSticky: false,
};
const releaseCtx: SlotReleaseContext<ActivitySlotInfo> = { permit: {} };

const budget = (sessions: number, pixels: number) =>
  new AmaDeviceBudget({ sessions, pixels });

describe('createAmaActivitySlotSupplier', () => {
  test('issues permits while under the concurrency cap', () => {
    const supplier = createAmaActivitySlotSupplier({
      budget: budget(100, 100),
      maxConcurrent: 3,
      minSessions: 1,
      minPixels: 0.25,
    });

    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
    // 4th would exceed maxConcurrent.
    expect(supplier.tryReserveSlot(reserveCtx)).toBeNull();
  });

  test('releaseSlot frees a slot back under the cap', () => {
    const supplier = createAmaActivitySlotSupplier({
      budget: budget(100, 100),
      maxConcurrent: 1,
    });

    const permit = supplier.tryReserveSlot(reserveCtx);
    expect(permit).not.toBeNull();
    expect(supplier.tryReserveSlot(reserveCtx)).toBeNull();

    supplier.releaseSlot(releaseCtx);
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
  });

  test('releaseSlot never drives the counter negative', () => {
    const supplier = createAmaActivitySlotSupplier({
      budget: budget(100, 100),
      maxConcurrent: 2,
    });

    // Spurious releases (more than were issued) must not create phantom capacity.
    supplier.releaseSlot(releaseCtx);
    supplier.releaseSlot(releaseCtx);
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
    expect(supplier.tryReserveSlot(reserveCtx)).toBeNull();
  });

  test('stops issuing once free SESSIONS drop below minSessions', async () => {
    const b = budget(2, 100); // session-limited
    const supplier = createAmaActivitySlotSupplier({
      budget: b,
      maxConcurrent: 10,
      minSessions: 1,
      minPixels: 0.25,
    });

    const release = await b.acquire({ sessions: 2, pixels: 1 }); // 0 sessions free
    expect(supplier.tryReserveSlot(reserveCtx)).toBeNull();

    release(); // sessions free again
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
  });

  test('stops issuing once free PIXELS drop below minPixels', async () => {
    const b = budget(100, 6); // pixel-limited
    const supplier = createAmaActivitySlotSupplier({
      budget: b,
      maxConcurrent: 10,
      minSessions: 1,
      minPixels: 0.25,
    });

    const release = await b.acquire({ sessions: 0, pixels: 5.9 }); // 0.1 px free
    expect(supplier.tryReserveSlot(reserveCtx)).toBeNull();

    release();
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
  });

  test('reserveSlot parks until budget frees, then issues', async () => {
    const b = budget(2, 100);
    const supplier = createAmaActivitySlotSupplier({
      budget: b,
      maxConcurrent: 10,
      minSessions: 1,
      minPixels: 0.25,
    });

    const release = await b.acquire({ sessions: 2, pixels: 1 }); // sessions full
    let issued = false;
    const pending = supplier
      .reserveSlot(reserveCtx, new AbortController().signal)
      .then((permit) => {
        issued = true;
        return permit;
      });

    await tick();
    expect(issued).toBe(false);

    release(); // notifies the shared budgetChanges signal
    await pending;
    expect(issued).toBe(true);
  });

  test('reserveSlot rejects with AbortError when aborted and issues no slot', async () => {
    const b = budget(2, 100);
    // maxConcurrent: 1 so a leaked increment would be observable below.
    const supplier = createAmaActivitySlotSupplier({
      budget: b,
      maxConcurrent: 1,
      minSessions: 1,
      minPixels: 0.25,
    });

    const release = await b.acquire({ sessions: 2, pixels: 1 }); // sessions full
    const controller = new AbortController();
    const pending = supplier.reserveSlot(reserveCtx, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    // The aborted reservation must not have consumed the single slot: once
    // budget frees, a fresh reservation succeeds.
    release();
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
  });
});
