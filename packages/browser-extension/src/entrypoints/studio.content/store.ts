import { useSyncExternalStore } from 'react';

/**
 * Shared state between the separately mounted Studio UIs (the header button,
 * the bulk-bar action, and the overlay that owns the dialog). They're
 * different shadow roots but the same content-script module, so a module-level
 * store is enough.
 */
type State = {
  /** Video ids the mirror dialog is open for, or null when closed. */
  dialogIds: Array<string> | null;
};

let state: State = { dialogIds: null };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openMirrorDialog(videoIds: Array<string>) {
  if (videoIds.length > 0) {
    set({ dialogIds: videoIds });
  }
}

export function closeMirrorDialog() {
  set({ dialogIds: null });
}

export function useMirrorDialogIds() {
  return useSyncExternalStore(
    subscribe,
    () => state.dialogIds,
    () => null,
  );
}
