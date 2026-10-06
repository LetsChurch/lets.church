import { currentStudioPage, selectedVideoIds } from '@/lib/studio-dom';

import { openMirrorDialog } from './store';

const LABEL = "Mirror to Let's Church";

/**
 * Sits first in the video edit page's header (beside "Undo changes" / "Save"),
 * styled like Studio's tonal pill buttons. Studio's header row doesn't wrap,
 * so on narrower windows the full label would push Studio's own ⋮ menu off
 * screen; there it shortens to "Mirror" (the accessible name stays full).
 */
export function EditPageButton() {
  return (
    <button
      type="button"
      aria-label={LABEL}
      title={LABEL}
      className="bg-tonal text-ink hover:bg-tonal-hover focus-visible:outline-focus rounded-control flex h-9 shrink-0 cursor-pointer items-center px-4 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
      onClick={() => {
        const page = currentStudioPage();
        if (page.kind === 'video') {
          openMirrorDialog([page.videoId]);
        }
      }}
    >
      <span className="hidden min-[1280px]:inline">{LABEL}</span>
      <span className="min-[1280px]:hidden">Mirror</span>
    </button>
  );
}

/**
 * An extra action in the Content list's selection bar ("N selected · Edit ·
 * Add to playlist · More actions"), matching its white-on-dark text items.
 */
export function BulkActionButton() {
  return (
    <button
      type="button"
      className="mx-3 mt-2 mb-2 flex h-12 cursor-pointer items-center rounded px-1 pb-1 text-base whitespace-nowrap text-[var(--ytcp-text-primary-inverse,#fff)] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[var(--ytcp-focus-inverse,#fff)]"
      onClick={() => openMirrorDialog(selectedVideoIds())}
    >
      {LABEL}
    </button>
  );
}
