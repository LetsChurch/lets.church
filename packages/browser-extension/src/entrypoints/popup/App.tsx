import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

import { Button } from '@/components/ui';
import { signInUrl } from '@/lib/config';
import { ACTIVE_STATUSES, watchJobs } from '@/lib/jobs';
import { describeApiError, lcApi } from '@/lib/lc-api';
import { send } from '@/lib/messages';
import type { LcContext, MirrorJob } from '@/lib/types';

const STUDIO_URL = 'https://studio.youtube.com/';

/**
 * Firefox treats MV3 host permissions as optional until the user grants them,
 * and without them the extension can't see Studio or reach Let's Church.
 */
function useHostPermissions() {
  const origins =
    browser.runtime.getManifest().host_permissions?.filter(Boolean) ?? [];
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    void browser.permissions.contains({ origins }).then(setGranted);
  }, []);

  return {
    granted,
    request: async () => {
      setGranted(await browser.permissions.request({ origins }));
    },
  };
}

export function App() {
  const permissions = useHostPermissions();
  const [context, setContext] = useState<LcContext | null | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Array<MirrorJob>>([]);

  useEffect(() => watchJobs(setJobs), []);
  useEffect(() => {
    if (!permissions.granted) {
      return;
    }
    lcApi
      .getContext()
      .then(setContext)
      .catch((err: unknown) => setError(describeApiError(err)));
  }, [permissions.granted]);

  const active = jobs.filter((j) => ACTIVE_STATUSES.has(j.status)).length;
  const failed = jobs.filter((j) => j.status === 'error').length;

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-base font-semibold">Let&apos;s Church Mirror</h1>

      {permissions.granted === false ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Allow access to YouTube Studio and Let&apos;s Church so the
            extension can mirror your videos.
          </p>
          <Button variant="primary" onClick={() => void permissions.request()}>
            Allow access
          </Button>
        </div>
      ) : error ? (
        <p className="text-danger text-sm">{error}</p>
      ) : context === undefined ? (
        <p className="text-muted text-sm">Checking your sign-in…</p>
      ) : context === null ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>You&apos;re not signed in to Let&apos;s Church.</p>
          <Button
            variant="primary"
            onClick={() => void browser.tabs.create({ url: signInUrl() })}
          >
            Sign in
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            Signed in as <span className="font-medium">{context.username}</span>
          </p>
          <p className="text-muted">
            {context.channels.length === 0
              ? 'No channels you can upload to yet.'
              : `Can mirror to ${context.channels.map((c) => c.name).join(', ')}.`}
          </p>
        </div>
      )}

      <p className="text-muted text-sm">
        {active > 0
          ? `${active} ${active === 1 ? 'video' : 'videos'} mirroring.`
          : 'Open YouTube Studio, then use “Mirror to Let’s Church” on a video or a selection of videos.'}
        {failed > 0 ? ` ${failed} failed.` : ''}
      </p>

      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => void browser.tabs.create({ url: STUDIO_URL })}
        >
          Open Studio
        </Button>
        <Button
          className="flex-1"
          onClick={() => void send({ type: 'queue:open' })}
        >
          Mirror queue
        </Button>
      </div>
    </main>
  );
}
