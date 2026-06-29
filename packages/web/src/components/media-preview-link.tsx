import { PreviewCard } from '@base-ui/react/preview-card';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ComponentProps, ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MiniPlayer } from '@/components/mini-player';
import { useTRPC } from '@/trpc/react';

type Side = ComponentProps<typeof PreviewCard.Positioner>['side'];

const OPEN_DELAY = 500;
const CLOSE_DELAY = 100;
// After the last preview in a group closes, stay "warm" briefly so moving to a
// nearby reference re-opens instantly instead of waiting the full open delay.
const GROUP_WARM_WINDOW = 400;

// --- Delay group ----------------------------------------------------------

type PreviewGroup = {
  /** True while a preview is open (or one closed within the warm window). */
  warm: boolean;
  onOpen: () => void;
  onClose: () => void;
};

const PreviewGroupContext = createContext<PreviewGroup | null>(null);

/**
 * Shares an open-delay across all `MediaPreviewScope`s inside it. Base UI's
 * PreviewCard has no delay group (unlike Tooltip.Provider), so we track it: the
 * first hover waits the full delay, but once any preview is open — and for a
 * short window after the last one closes — moving to another reference or result
 * opens its preview instantly. Wrap the answer + results region in one of these.
 */
export function MediaPreviewGroup({ children }: { children: ReactNode }) {
  const [warm, setWarm] = useState(false);
  const openCountRef = useRef(0);
  const coolTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onOpen = useCallback(() => {
    openCountRef.current += 1;
    if (coolTimerRef.current) {
      clearTimeout(coolTimerRef.current);
      coolTimerRef.current = null;
    }
    setWarm(true);
  }, []);

  const onClose = useCallback(() => {
    openCountRef.current = Math.max(0, openCountRef.current - 1);
    if (openCountRef.current === 0) {
      if (coolTimerRef.current) clearTimeout(coolTimerRef.current);
      coolTimerRef.current = setTimeout(() => {
        setWarm(false);
        coolTimerRef.current = null;
      }, GROUP_WARM_WINDOW);
    }
  }, []);

  useEffect(
    () => () => {
      if (coolTimerRef.current) clearTimeout(coolTimerRef.current);
    },
    [],
  );

  const value = useMemo(
    () => ({ warm, onOpen, onClose }),
    [warm, onOpen, onClose],
  );

  return (
    <PreviewGroupContext.Provider value={value}>
      {children}
    </PreviewGroupContext.Provider>
  );
}

// --- Scope (one PreviewCard.Root shared by many targets) ------------------

type TargetData = {
  /** Outgoing (base58) upload id. */
  mediaId: string;
  startSeconds: number;
  thumbnailUrl: string | null;
  /** Optional caption shown beneath the preview player (answer footnotes pass
   * the cited media's title; other previews leave it undefined). */
  title?: string | null;
  /** The element the preview should point at. */
  anchor: HTMLElement;
  onPreviewOpen?: () => void;
};

type ScopeValue = {
  enter: (data: TargetData) => void;
  leave: () => void;
  /**
   * Resolve a click: `seconds` is where to navigate (the scrubbed position when
   * this target's preview is showing, otherwise its start), `previewing` says
   * whether the live preview should drive the jump.
   */
  activate: (
    mediaId: string,
    startSeconds: number,
  ) => { seconds: number; previewing: boolean };
};

const ScopeContext = createContext<ScopeValue | null>(null);

/**
 * Owns a single Base UI PreviewCard for a region (one search-result row, or the
 * whole AI answer). Every `MediaPreviewTarget` inside drives this one card: the
 * card re-anchors and swaps content as you move between targets, so transitions
 * within the region are instant and the player isn't torn down/rebuilt (for a
 * same-media row it just re-seeks). Place one per row / per answer; wrap the
 * whole region in a `MediaPreviewGroup` for instant cross-region transitions.
 */
export function MediaPreviewScope({
  children,
  side = 'top',
  sideOffset = 8,
}: {
  children: ReactNode;
  side?: Side;
  sideOffset?: number;
}) {
  const trpc = useTRPC();
  const group = useContext(PreviewGroupContext);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<TargetData | null>(null);
  const currentTimeRef = useRef(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openRef = useRef(open);
  openRef.current = open;
  const activeRef = useRef(active);
  activeRef.current = active;

  const { data: sources } = useQuery({
    ...trpc.media.getMediaSources.queryOptions({
      mediaId: active?.mediaId ?? '',
    }),
    enabled: open && active != null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const clearOpenTimer = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);
  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const enter = useCallback(
    (data: TargetData) => {
      clearCloseTimer();
      // Already open in this region: re-anchor + swap media/time instantly.
      if (openRef.current) {
        setActive(data);
        currentTimeRef.current = data.startSeconds;
        data.onPreviewOpen?.();
        return;
      }
      clearOpenTimer();
      const run = () => {
        openTimer.current = null;
        setActive(data);
        currentTimeRef.current = data.startSeconds;
        setOpen(true);
        data.onPreviewOpen?.();
      };
      // Instant once the group is warm (another preview is/was just open).
      if (group?.warm) {
        run();
      } else {
        openTimer.current = setTimeout(run, OPEN_DELAY);
      }
    },
    [group, clearOpenTimer, clearCloseTimer],
  );

  const leave = useCallback(() => {
    clearOpenTimer();
    if (!openRef.current) return;
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, CLOSE_DELAY);
  }, [clearOpenTimer, clearCloseTimer]);

  const activate = useCallback((mediaId: string, startSeconds: number) => {
    const previewing =
      openRef.current &&
      activeRef.current?.mediaId === mediaId &&
      sourcesRef.current != null;
    return {
      seconds: previewing ? currentTimeRef.current : startSeconds,
      previewing,
    };
  }, []);

  // Report open/close to the warm group so cross-region moves are instant.
  useEffect(() => {
    if (!group || !open) return;
    group.onOpen();
    return () => group.onClose();
  }, [group, open]);

  useEffect(
    () => () => {
      clearOpenTimer();
      clearCloseTimer();
    },
    [clearOpenTimer, clearCloseTimer],
  );

  const value = useMemo(
    () => ({ enter, leave, activate }),
    [enter, leave, activate],
  );

  return (
    <ScopeContext.Provider value={value}>
      {children}
      <PreviewCard.Root
        open={open}
        // We drive hover open/close ourselves (one card, many anchors), so only
        // honor Base UI's escape/outside-press closes.
        onOpenChange={(next, details) => {
          if (
            !next &&
            (details.reason === 'escape-key' ||
              details.reason === 'outside-press')
          ) {
            clearOpenTimer();
            clearCloseTimer();
            setOpen(false);
          }
        }}
      >
        <PreviewCard.Portal>
          <PreviewCard.Positioner
            anchor={active?.anchor ?? null}
            side={side}
            sideOffset={sideOffset}
            className="z-[9999]"
          >
            <PreviewCard.Popup
              // Keep the card open while the pointer is over the player.
              onMouseEnter={clearCloseTimer}
              onMouseLeave={leave}
            >
              {active && sources ? (
                <MiniPlayer
                  // Same media (e.g. moving between a row's segments) keeps the
                  // player mounted and just re-seeks; a different media remounts.
                  key={active.mediaId}
                  mediaSource={sources.mediaSource}
                  audioSource={sources.audioSource}
                  thumbnailUrl={active.thumbnailUrl}
                  initialTimestamp={active.startSeconds}
                  currentTimeRef={currentTimeRef}
                  title={active.title}
                />
              ) : (
                <div className="h-24 w-80 animate-pulse rounded-xl bg-white/10" />
              )}
            </PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      </PreviewCard.Root>
    </ScopeContext.Provider>
  );
}

// --- Target (a link that drives its enclosing scope) ----------------------

type MediaPreviewTargetProps = {
  /** Outgoing (base58) upload id. */
  mediaId: string;
  /** Deep-link / preview start time, in seconds. */
  startSeconds: number;
  thumbnailUrl?: string | null;
  /** Optional caption shown beneath the preview player (e.g. the cited media's
   * title for answer footnotes). Omit where no label is wanted. */
  title?: string | null;
  children: ReactNode;
  className?: string;
  /** Fired when the hover preview opens (e.g. analytics). */
  onPreviewOpen?: () => void;
  /**
   * Fired right before navigating on click. `usedPreview` is true when the
   * preview was open (so we jump to wherever the user scrubbed to).
   */
  onActivate?: (seconds: number, usedPreview: boolean) => void;
};

/**
 * A link that opens its enclosing `MediaPreviewScope`'s shared hover preview,
 * anchored to itself and scrubbed to `startSeconds`. Sources are fetched by the
 * scope only while open; clicking jumps to the scrubbed position when previewing
 * this media, otherwise to `startSeconds`.
 */
export function MediaPreviewTarget({
  mediaId,
  startSeconds,
  thumbnailUrl = null,
  title,
  children,
  className,
  onPreviewOpen,
  onActivate,
}: MediaPreviewTargetProps) {
  const scope = useContext(ScopeContext);
  const navigate = useNavigate();

  const handleEnter = (
    e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>,
  ) => {
    scope?.enter({
      mediaId,
      startSeconds,
      thumbnailUrl,
      title,
      anchor: e.currentTarget,
      onPreviewOpen,
    });
  };

  const handleClick = (e: React.MouseEvent) => {
    const { seconds, previewing } = scope?.activate(mediaId, startSeconds) ?? {
      seconds: startSeconds,
      previewing: false,
    };
    onActivate?.(seconds, previewing);
    if (previewing) {
      e.preventDefault();
      navigate({
        to: '/media/$mediaId',
        params: { mediaId },
        hash: `t=${seconds}`,
      });
    }
  };

  return (
    <Link
      to="/media/$mediaId"
      params={{ mediaId }}
      hash={`t=${startSeconds}`}
      className={className}
      onMouseEnter={handleEnter}
      onMouseLeave={() => scope?.leave()}
      onFocus={handleEnter}
      onBlur={() => scope?.leave()}
      onClick={handleClick}
    >
      {children}
    </Link>
  );
}
