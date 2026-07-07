import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';

import { LcModal } from '@/components/lc-modal';

import type { LcColor } from './_colors';
import { Button } from './button';

// Imperative modal manager replacing @mantine/modals. Call `modals.open(...)`
// or `modals.openConfirmModal(...)` from anywhere; render <ModalsProvider />
// once near the root so they appear.

type ModalSize = 'sm' | 'md' | 'lg';

type BaseModal = {
  id: string;
  title?: ReactNode;
  children?: ReactNode;
  size?: ModalSize;
  onClose?: () => void;
};

type ContentModal = BaseModal & { kind: 'content' };

type ConfirmModal = BaseModal & {
  kind: 'confirm';
  labels?: { confirm?: ReactNode; cancel?: ReactNode };
  confirmProps?: { color?: string };
  cancelProps?: { color?: string };
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
};

type ModalDef = ContentModal | ConfirmModal;

let stack: ModalDef[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  stack = [...stack];
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return stack;
}

function nextId() {
  counter += 1;
  return `modal-${counter}`;
}

function close(id: string) {
  const modal = stack.find((m) => m.id === id);
  stack = stack.filter((m) => m.id !== id);
  emit();
  modal?.onClose?.();
}

export const modals = {
  open(def: Omit<ContentModal, 'id' | 'kind'>): string {
    const id = nextId();
    stack = [...stack, { ...def, id, kind: 'content' }];
    emit();
    return id;
  },
  openConfirmModal(def: Omit<ConfirmModal, 'id' | 'kind'>): string {
    const id = nextId();
    stack = [...stack, { ...def, id, kind: 'confirm' }];
    emit();
    return id;
  },
  close,
  closeAll() {
    const current = stack;
    stack = [];
    emit();
    for (const m of current) m.onClose?.();
  },
};

function ModalView({ modal }: { modal: ModalDef }) {
  const onOpenChange = (open: boolean) => {
    if (!open) close(modal.id);
  };

  return (
    <LcModal.Root open onOpenChange={onOpenChange}>
      <LcModal.Portal>
        <LcModal.Backdrop />
        <LcModal.Popup size={modal.size ?? 'sm'}>
          {modal.title ? (
            <div className="mb-3">
              <LcModal.Title>{modal.title}</LcModal.Title>
            </div>
          ) : null}
          <div className="text-primary text-sm">{modal.children}</div>
          {modal.kind === 'confirm' ? (
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="default"
                onClick={() => {
                  modal.onCancel?.();
                  close(modal.id);
                }}
              >
                {modal.labels?.cancel ?? 'Cancel'}
              </Button>
              <Button
                color={(modal.confirmProps?.color as LcColor) ?? 'brand'}
                onClick={async () => {
                  await modal.onConfirm?.();
                  close(modal.id);
                }}
              >
                {modal.labels?.confirm ?? 'Confirm'}
              </Button>
            </div>
          ) : null}
        </LcModal.Popup>
      </LcModal.Portal>
    </LcModal.Root>
  );
}

export function ModalsProvider({ children }: { children?: ReactNode }) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return (
    <>
      {children}
      {current.map((modal) => (
        <ModalView key={modal.id} modal={modal} />
      ))}
    </>
  );
}
