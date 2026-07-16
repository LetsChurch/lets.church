import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useDebounce } from 'use-debounce';

import { useTRPC } from '@/trpc/react';

/**
 * Speculatively warm the query embedding while the user is still typing, so the
 * ~226 ms embed is off the critical path on submit. Debounced to a real typing
 * pause (longer than the palette's 150 ms — we only want to pay for a query the
 * user has settled on), and fired at most once per distinct query. The server
 * side (`search.warmEmbed`) gates on natural-language-ish queries and never
 * throws. See docs/agentic-search-overview.md (Lane 1 — progressive/warm embed).
 */
export function useWarmQueryEmbed(query: string, enabled: boolean): void {
  const trpc = useTRPC();
  const warm = useMutation(trpc.search.warmEmbed.mutationOptions());
  const [debounced] = useDebounce(query.trim(), 400);
  const lastWarmed = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || debounced.length === 0) return;
    if (lastWarmed.current === debounced) return;
    lastWarmed.current = debounced;
    warm.mutate({ q: debounced });
    // `warm` is a stable mutation handle; excluding it keeps this from re-firing
    // on every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, enabled]);
}
