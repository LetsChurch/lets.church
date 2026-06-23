import { Dialog } from '@base-ui/react/dialog';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import {
  clearLocalData,
  hasLocalData,
  localDataCounts,
  mergeOnSignIn,
  pullServer,
  pushDirty,
  setSyncSignedIn,
} from '@/local/sync';
import { useTRPC } from '@/trpc/react';

// Drives local-first server sync + the sign-in reconcile prompt. Mounted once,
// app-wide (inside the tRPC provider). All IndexedDB/localStorage access happens
// in effects, so this is SSR-safe.
//
// Flow: when signed in, if there's local (anonymous) data that hasn't been
// reconciled this session, prompt to Merge or Use-account-data; otherwise just
// pull the server copy. Re-syncs on reconnect.
const MERGED_KEY = 'lb-merged';
// Set while signed in; its presence on a signed-OUT load means we just signed
// out (vs. a never-signed-in visitor), which triggers the local-data wipe.
const AUTH_FLAG = 'lb-was-signed-in';

export function LocalSync({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const { data: signedIn } = useQuery(
    trpc.common.hasValidSession.queryOptions(),
  );
  const [prompt, setPrompt] = useState(false);
  const [counts, setCounts] = useState({ highlights: 0, notes: 0 });
  const [busy, setBusy] = useState(false);

  // React to auth state.
  useEffect(() => {
    if (signedIn === undefined) {
      return;
    }
    setSyncSignedIn(signedIn);
    if (!signedIn) {
      // If we were signed in on a previous load, this is a sign-out (the logout
      // route cleared the session, or it expired) — wipe ALL on-device data so
      // the account's library can't leak to the next anonymous user on a shared
      // device. A never-signed-in visitor has no AUTH_FLAG, so their own local
      // data is left intact.
      try {
        if (localStorage.getItem(AUTH_FLAG) === '1') {
          clearLocalData();
          localStorage.removeItem(AUTH_FLAG);
          // Also drop the service worker's per-user caches (SSR'd pages with
          // notes/highlights, user-specific tRPC) so they can't be served to the
          // next user on a shared device. clearLocalData only handles
          // localStorage/IndexedDB, not Cache Storage.
          try {
            navigator.serviceWorker?.controller?.postMessage({
              type: 'lb-clear-private',
            });
          } catch {
            // service worker not controlling / unavailable — ignore
          }
        }
        // Next sign-in should re-evaluate whether to prompt.
        localStorage.removeItem(MERGED_KEY);
      } catch {
        // ignore storage errors
      }
      return;
    }
    try {
      localStorage.setItem(AUTH_FLAG, '1');
    } catch {
      // ignore storage errors
    }
    let merged = false;
    try {
      merged = localStorage.getItem(MERGED_KEY) === '1';
    } catch {
      // ignore
    }
    if (merged) {
      void pullServer().then(() => pushDirty());
      return;
    }
    if (hasLocalData()) {
      const c = localDataCounts();
      setCounts({ highlights: c.highlights, notes: c.notes });
      setPrompt(true);
    } else {
      void pullServer();
      try {
        localStorage.setItem(MERGED_KEY, '1');
      } catch {
        // ignore
      }
    }
  }, [signedIn]);

  // Re-sync when connectivity returns.
  useEffect(() => {
    const onOnline = () => {
      void pushDirty().then(() => pullServer());
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  async function choose(mode: 'merge' | 'discard') {
    setBusy(true);
    try {
      await mergeOnSignIn(mode);
      try {
        localStorage.setItem(MERGED_KEY, '1');
      } catch {
        // ignore
      }
      setPrompt(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {children}
      {/* Controlled, with no onOpenChange — a forced choice (merge / replace /
          keep). Esc and outside-press have nowhere to route, so it can't be
          dismissed except via its buttons. */}
      <Dialog.Root open={prompt}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]" />
          <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-32px))] rounded-2xl border border-line-strong bg-paper-raised p-6 shadow-[0_30px_60px_-24px_rgba(40,34,18,0.5)] outline-none">
            <Dialog.Title className="font-serif text-[21px] text-ink-strong">
              Sync your library
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-[14px] text-muted leading-relaxed">
              You have {counts.highlights} highlight
              {counts.highlights === 1 ? '' : 's'} and {counts.notes} note
              {counts.notes === 1 ? '' : 's'} saved on this device. Merge them
              with your account, or replace them with your account’s saved data.
            </Dialog.Description>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => choose('merge')}
                className="rounded-[10px] bg-ink-strong px-4 py-2.5 font-semibold text-[14px] text-white disabled:opacity-50 dark:text-paper"
              >
                Merge with my account
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => choose('discard')}
                className="rounded-[10px] border border-line-strong px-4 py-2.5 font-semibold text-[14px] text-muted hover:bg-paper-soft disabled:opacity-50"
              >
                Use my account’s data instead
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
