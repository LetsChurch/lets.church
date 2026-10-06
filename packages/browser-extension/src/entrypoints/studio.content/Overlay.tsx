import { useEffect, useState } from 'react';

import { MirrorDialog } from '@/components/MirrorDialog';
import { PortalContainerProvider } from '@/components/ui';
import { ACTIVE_STATUSES, watchJobs } from '@/lib/jobs';
import { send } from '@/lib/messages';

import { closeMirrorDialog, useMirrorDialogIds } from './store';

/**
 * Bottom-left status like Studio's own snackbars, shown only while videos are
 * being mirrored.
 */
function QueueSnackbar() {
  const [active, setActive] = useState(0);
  useEffect(
    () =>
      watchJobs((jobs) =>
        setActive(jobs.filter((j) => ACTIVE_STATUSES.has(j.status)).length),
      ),
    [],
  );

  if (active === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed bottom-6 left-6 z-[2147483000] flex items-center gap-4 rounded-lg bg-[var(--ytcp-background-inverse,#0f0f0f)] py-3 pr-2 pl-4 text-sm text-[var(--ytcp-text-primary-inverse,#fff)] shadow-lg"
    >
      <span>
        Mirroring {active} {active === 1 ? 'video' : 'videos'} to Let&apos;s
        Church
      </span>
      <button
        type="button"
        className="rounded-control cursor-pointer px-3 py-1.5 font-medium text-[#3ea6ff] hover:bg-white/10"
        onClick={() => void send({ type: 'queue:open' })}
      >
        View
      </button>
    </div>
  );
}

export function Overlay({ portalContainer }: { portalContainer: HTMLElement }) {
  const dialogIds = useMirrorDialogIds();

  return (
    <PortalContainerProvider value={portalContainer}>
      <QueueSnackbar />
      <MirrorDialog
        videoIds={dialogIds ?? []}
        open={dialogIds !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeMirrorDialog();
          }
        }}
      />
    </PortalContainerProvider>
  );
}
