import { CANON } from '@/lib/canon';

// Background "everything offline" pass — replaces the old manual download button.
// Once per (version, translation), at idle, fetch all of a translation's reading
// book assets + its search assets so the whole Bible + search work offline with no
// user action. Each fetch flows through the service worker, which caches it (see
// public/sw.js). Best-effort and silent; skipped on data-saver connections.

// Bump alongside the SW VERSION when the generated assets change.
const VERSION = 'v2';

type ConnectionNav = Navigator & { connection?: { saveData?: boolean } };
type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
};

function alreadyDone(translationId: string): boolean {
  try {
    return (
      localStorage.getItem(`lb-precache:${VERSION}:${translationId}`) === '1'
    );
  } catch {
    return false;
  }
}

function markDone(translationId: string): void {
  try {
    localStorage.setItem(`lb-precache:${VERSION}:${translationId}`, '1');
  } catch {
    // ignore (private mode / quota) — we'll just try again next session
  }
}

function dataSaver(): boolean {
  return !!(navigator as ConnectionNav).connection?.saveData;
}

// Fetch and fully drain one asset so the SW finishes caching it before the next
// (avoids firing 66+ downloads at once). Failures are ignored.
async function warm(url: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (res.ok) {
      await res.arrayBuffer();
    }
  } catch {
    // best-effort — offline / transient failure just leaves it for next time
  }
}

let running = false;

export function precacheTranslation(translationId: string): void {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    running ||
    alreadyDone(translationId) ||
    dataSaver()
  ) {
    return;
  }
  running = true;

  const run = async () => {
    await warm(`/search/${translationId}.verses.json`);
    await warm('/search/structure.json');
    for (const b of CANON) {
      await warm(`/reading/${translationId}/${b.slug}.json`);
    }
    markDone(translationId);
    running = false;
  };

  const start = () => {
    void run();
  };
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(start, { timeout: 10_000 });
  } else {
    setTimeout(start, 3_000);
  }
}
