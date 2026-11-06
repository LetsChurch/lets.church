import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  showFailure,
  showInfo,
  toastManager,
} from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';

const POLL_MS = 4_000;
// Generation is one LLM call, usually under a minute; past this something is
// stuck and the viewer should hear about it rather than wait forever.
const GIVE_UP_MS = 5 * 60_000;

function download(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.append(a);
  a.click();
  a.remove();
}

/**
 * Download an upload's study guide, generating it first when it doesn't exist
 * yet: shows a toast while it's prepared, then downloads it.
 */
export function useStudyGuideDownload(mediaId: string | undefined) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Stop polling once the page goes away. Set on every mount, not just the
  // first: StrictMode's mount/unmount/mount would otherwise leave it false.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const request = useMutation(trpc.studyGuide.request.mutationOptions());
  // Which upload is being prepared, so moving to another media page (the
  // route component stays mounted) doesn't leave its button disabled. The
  // earlier guide still downloads when it's ready: the viewer asked for it.
  const [preparingFor, setPreparingFor] = useState<string | null>(null);
  const preparing = mediaId !== undefined && preparingFor === mediaId;
  // Set only once the server says the guide has to be generated (when the
  // toast appears), so a cached guide's quick download doesn't flash it.
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const generating = mediaId !== undefined && generatingFor === mediaId;

  const start = useCallback(async () => {
    if (!mediaId || preparing) return;
    setPreparingFor(mediaId);
    // One restart if a run finishes without a guide (it was discarded because
    // the upload changed while generating).
    let restarts = 1;
    let toastId: string | null = null;
    try {
      let result = await request.mutateAsync({ mediaId });
      const deadline = Date.now() + GIVE_UP_MS;
      if (result.status === 'pending') {
        setGeneratingFor(mediaId);
        toastId = showInfo({
          title: 'Preparing your study guide',
          message:
            'This usually takes about a minute. It will download when it’s ready.',
          autoClose: false,
        });
      }
      while (result.status === 'pending' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (!mounted.current) return;
        result = await queryClient.fetchQuery({
          ...trpc.studyGuide.status.queryOptions({ mediaId }),
          staleTime: 0,
        });
        if (result.status === 'none' && restarts > 0) {
          restarts -= 1;
          result = await request.mutateAsync({ mediaId });
        }
      }
      if (result.status !== 'ready') {
        throw new Error(`Study guide ${result.status}`);
      }
      download(result.url);
    } catch (error) {
      showFailure({
        title: 'Couldn’t prepare the study guide',
        message:
          error instanceof Error && error.message.startsWith('Too many')
            ? error.message
            : 'Please try again in a few minutes.',
      });
    } finally {
      if (toastId) toastManager.close(toastId);
      setPreparingFor((current) => (current === mediaId ? null : current));
      setGeneratingFor((current) => (current === mediaId ? null : current));
    }
  }, [mediaId, preparing, request, queryClient, trpc]);

  return { start, preparing, generating };
}
