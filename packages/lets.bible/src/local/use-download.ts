import { useCallback, useEffect, useRef, useState } from 'react';
import {
  downloadTranslation,
  isDownloaded,
  removeDownload,
} from './chapter-cache';

// Shared offline-download state for a translation, used by both the Settings
// "Offline" list and the reader's translation picker. Keeps the UI in step with
// the IndexedDB cache: checks whether the translation is already downloaded on
// mount, runs the bulk download with progress, and removes it.
//
// The download keeps running even if the component unmounts mid-flight (e.g. the
// picker popover closes) — it just stops touching React state via `activeRef`,
// and a later mount re-reads `isDownloaded` and shows the result.
export type DownloadState =
  | { phase: 'idle' }
  | { phase: 'downloading'; done: number; total: number }
  | { phase: 'downloaded' };

export function useTranslationDownload(id: string) {
  const [state, setState] = useState<DownloadState>({ phase: 'idle' });
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    // Reset when the id changes so a previous translation's "downloaded" state
    // doesn't carry over before the async check resolves.
    setState({ phase: 'idle' });
    isDownloaded(id).then((yes) => {
      if (activeRef.current && yes) {
        setState({ phase: 'downloaded' });
      }
    });
    return () => {
      activeRef.current = false;
    };
  }, [id]);

  const download = useCallback(async () => {
    setState({ phase: 'downloading', done: 0, total: 66 });
    try {
      await downloadTranslation(id, (done, total) => {
        if (activeRef.current) {
          setState({ phase: 'downloading', done, total });
        }
      });
      if (activeRef.current) {
        setState({ phase: 'downloaded' });
      }
    } catch {
      if (activeRef.current) {
        setState({ phase: 'idle' });
      }
    }
  }, [id]);

  const remove = useCallback(async () => {
    try {
      await removeDownload(id);
      if (activeRef.current) {
        setState({ phase: 'idle' });
      }
    } catch {
      // Removal failed — the data is still cached, so keep the "downloaded"
      // state rather than misreporting it as removed.
    }
  }, [id]);

  return { state, download, remove };
}
