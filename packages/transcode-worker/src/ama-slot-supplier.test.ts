import { AmaEncodeBudget } from '@letschurch/temporal/util/ama-budget';
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

describe('createAmaActivitySlotSupplier', () => {
  test('issues permits while under the concurrency cap', () => {
    const budget = new AmaEncodeBudget(6);
    const supplier = createAmaActivitySlotSupplier({
      budget,
      maxConcurrent: 3,
      minSlotBudget: 0.25,
    });

    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
    // 4th would exceed maxConcurrent.
    expect(supplier.tryReserveSlot(reserveCtx)).toBeNull();
  });

  test('releaseSlot frees a slot back under the cap', () => {
    const budget = new AmaEncodeBudget(6);
    const supplier = createAmaActivitySlotSupplier({
      budget,
      maxConcurrent: 1,
    });

    const permit = supplier.tryReserveSlot(reserveCtx);
    expect(permit).not.toBeNull();
    expect(supplier.tryReserveSlot(reserveCtx)).toBeNull();

    supplier.releaseSlot(releaseCtx);
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
  });

  test('releaseSlot never drives the counter negative', () => {
    const budget = new AmaEncodeBudget(6);
    const supplier = createAmaActivitySlotSupplier({
      budget,
      maxConcurrent: 2,
    });

    // Spurious releases (more than were issued) must not create phantom capacity.
    supplier.releaseSlot(releaseCtx);
    supplier.releaseSlot(releaseCtx);
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
    expect(supplier.tryReserveSlot(reserveCtx)).toBeNull();
  });

  test('stops issuing once free budget drops below minSlotBudget', async () => {
    const budget = new AmaEncodeBudget(6);
    const supplier = createAmaActivitySlotSupplier({
      budget,
      maxConcurrent: 10,
      minSlotBudget: 0.25,
    });

    const release = await budget.acquire(5.9); // free = 0.1 < 0.25
    expect(supplier.tryReserveSlot(reserveCtx)).toBeNull();

    release(); // free = 6
    expect(supplier.tryReserveSlot(reserveCtx)).not.toBeNull();
  });

  test('reserveSlot parks until budget frees, then issues', async () => {
    const budget = new AmaEncodeBudget(6);
    const supplier = createAmaActivitySlotSupplier({
      budget,
      maxConcurrent: 10,
      minSlotBudget: 0.25,
    });

    const release = await budget.acquire(6); // free = 0
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
    const budget = new AmaEncodeBudget(6);
    // maxConcurrent: 1 so a leaked increment would be observable below.
    const supplier = createAmaActivitySlotSupplier({
      budget,
      maxConcurrent: 1,
      minSlotBudget: 0.25,
    });

    const release = await budget.acquire(6); // free = 0 -> reserveSlot parks
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
