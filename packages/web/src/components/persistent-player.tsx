import { useStore } from '@nanostores/react';
import {
  IconArrowsDiagonal,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconRewindBackward15,
  IconRewindForward15,
  IconX,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { HlsVideoElement } from 'hls-video-element';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { LcTooltip } from '@/components/lc-tooltip';
import { Player } from '@/components/player';
import { flip } from '@/hooks/use-docked-player';
import { useBrowserSize } from '@/stores/browser-size';
import {
  $isNowPlayingPlaying,
  $nowPlaying,
  $playerPage,
  type NowPlaying,
  type NowPlayingMedia,
  type PlayerPagePresentation,
} from '@/stores/now-playing';
import { cn } from '@/util/cn';

/*
 * One player for the whole app shell, so playback survives leaving the media
 * page (YouTube-style mini player).
 *
 * The <Player> renders (through a portal) into a single container element that
 * is created once and then *moved* between slots — the media page's inline
 * slot, or the mini player's — rather than re-mounted. A synchronous DOM move
 * doesn't pause a media element, and neither custom-media-element nor
 * media-chrome's controller tear anything down on disconnect (they just
 * re-attach their listeners on reconnect), so the <hls-video> keeps playing,
 * buffered and all, through every move. Each move is FLIP-animated, like the
 * sidebar dock in useDockedPlayer.
 */

let container: HTMLDivElement | null = null;
let miniSlot: HTMLDivElement | null = null;
// Where the player was just before its latest move, for the next placement to
// animate from. Tagged with the media so a *different* media never flies in.
let lastRect: { mediaId: string; rect: DOMRect } | null = null;

function getContainer() {
  container ??= document.createElement('div');
  return container;
}

// The player while it's flying between slots (see placePlayer).
let flight: {
  layer: HTMLDivElement;
  spacer: HTMLDivElement;
  frame: number;
} | null = null;

// Put the player into its slot, ending any flight still under way.
function land(el: HTMLElement) {
  if (!flight) return;
  const { layer, spacer, frame } = flight;
  flight = null;
  cancelAnimationFrame(frame);
  if (spacer.isConnected) spacer.replaceWith(el);
  else miniSlot?.appendChild(el);
  layer.remove();
}

/**
 * Moves the player into `target` and animates it there from `from`.
 *
 * The flight happens in a fixed layer over the whole app rather than in place:
 * the page scrolls inside <main>, which would clip the player on its way in
 * and paint later page content (the transcript) over it. A spacer of the
 * player's size holds its spot in `target` until it lands, and the layer
 * follows that spot in case the page moves under it mid-flight.
 */
function placePlayer(
  el: HTMLElement,
  target: HTMLElement,
  from: DOMRect | null,
) {
  if (flight) {
    // Re-routed mid-flight: carry on from wherever it is now.
    from = el.getBoundingClientRect();
    land(el);
  }
  if (el.parentElement !== target) target.appendChild(el);
  if (!from) return;

  const to = el.getBoundingClientRect();
  if (!to.width || !to.height) return;
  const layer = document.createElement('div');
  layer.style.cssText = `position:fixed;z-index:40;pointer-events:none;top:${to.top}px;left:${to.left}px;width:${to.width}px`;
  const spacer = document.createElement('div');
  spacer.style.cssText = `width:${to.width}px;height:${to.height}px`;
  document.body.appendChild(layer);
  // Moved, never detached: the media keeps playing.
  layer.appendChild(el);
  target.appendChild(spacer);

  const current = { layer, spacer, frame: 0 };
  flight = current;
  const animation = flip(layer, from);
  if (!animation) {
    land(el);
    return;
  }
  const follow = () => {
    const rect = spacer.getBoundingClientRect();
    layer.style.top = `${rect.top}px`;
    layer.style.left = `${rect.left}px`;
    current.frame = requestAnimationFrame(follow);
  };
  current.frame = requestAnimationFrame(follow);
  void animation.finished.then(
    () => flight === current && land(el),
    () => {},
  );
}

function rememberPlayerRect() {
  const mediaId = $nowPlaying.get()?.media.id;
  if (!container?.isConnected || !mediaId) return;
  const rect = container.getBoundingClientRect();
  lastRect = rect.width && rect.height ? { mediaId, rect } : null;
}

type PlayerMode = 'page' | 'mini' | 'none';

function getPlayerMode(
  nowPlaying: NowPlaying | null,
  page: PlayerPagePresentation | null,
): PlayerMode {
  if (!nowPlaying) return 'none';
  if (page?.mediaId === nowPlaying.media.id) return 'page';
  return nowPlaying.started ? 'mini' : 'none';
}

export function useIsMiniPlayerOpen() {
  return getPlayerMode(useStore($nowPlaying), useStore($playerPage)) === 'mini';
}

// Fit `aspect` inside a w x h box.
function fit(w: number, h: number, aspect: number) {
  return w / h > aspect
    ? { width: Math.round(h * aspect), height: h }
    : { width: w, height: Math.round(w / aspect) };
}

type PlayerSlotProps = Omit<PlayerPagePresentation, 'slot' | 'mediaId'> & {
  media: NowPlayingMedia;
  viewHash: string;
};

/**
 * Where the media page shows the persistent player. Claims the player for
 * `media` (keeping the running playback if it's already the one playing, e.g.
 * when expanding the mini player) and hands it back to the mini player on
 * unmount.
 *
 * The player is client-only, so until it attaches (SSR, hydration) a poster of
 * the same size holds its place.
 */
export function PlayerSlot({
  media,
  viewHash,
  videoWidth,
  videoHeight,
  videoClassName,
  docked,
  initialTimestamp,
  onVideoEnded,
}: PlayerSlotProps) {
  const slotRef = useRef<HTMLDivElement>(null);

  // Declared before the claim below so the rect is taken while the store
  // still names whatever was playing before.
  useLayoutEffect(() => {
    const slot = slotRef.current;
    rememberPlayerRect();
    return () => {
      // Runs before React detaches this subtree: move the player out first so
      // it never leaves the document (which would pause it).
      rememberPlayerRect();
      if (container) land(container);
      if (container && slot?.contains(container) && miniSlot) {
        miniSlot.appendChild(container);
      }
      if ($playerPage.get()?.slot === slot) $playerPage.set(null);
    };
  }, []);

  useLayoutEffect(() => {
    const current = $nowPlaying.get();
    $nowPlaying.set(
      current?.media.id === media.id
        ? { ...current, media }
        : { media, viewHash, started: false },
    );
    // Only re-claim when the media changes; viewHash is synced on its own below.
  }, [media]);

  useLayoutEffect(() => {
    const current = $nowPlaying.get();
    if (
      current?.media.id === media.id &&
      viewHash &&
      current.viewHash !== viewHash
    ) {
      $nowPlaying.set({ ...current, viewHash });
    }
  }, [media.id, viewHash]);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    $playerPage.set({
      mediaId: media.id,
      slot,
      videoWidth,
      videoHeight,
      videoClassName,
      docked,
      initialTimestamp,
      onVideoEnded,
    });
  }, [
    media.id,
    videoWidth,
    videoHeight,
    videoClassName,
    docked,
    initialTimestamp,
    onVideoEnded,
  ]);

  return (
    <>
      <div ref={slotRef} className="peer" />
      <div className="hidden peer-empty:block">
        {media.mediaSource ? (
          <div
            className={cn(
              'overflow-hidden rounded-2xl bg-black',
              videoClassName,
            )}
            style={{ width: videoWidth, height: videoHeight }}
          >
            {media.posterThumbnailUrl ? (
              <img
                src={media.posterThumbnailUrl}
                alt=""
                className="size-full object-contain"
              />
            ) : null}
          </div>
        ) : (
          <div className="h-60" />
        )}
      </div>
    </>
  );
}

function useMediaElementState(el: HlsVideoElement | null) {
  const [state, setState] = useState({
    paused: true,
    currentTime: 0,
    duration: 0,
  });

  useEffect(() => {
    if (!el) return;
    const update = () =>
      setState({
        paused: el.paused,
        currentTime: el.currentTime,
        duration: Number.isFinite(el.duration) ? el.duration : 0,
      });
    update();
    const ac = new AbortController();
    for (const type of [
      'play',
      'pause',
      'ended',
      'emptied',
      'timeupdate',
      'durationchange',
    ]) {
      el.addEventListener(type, update, { signal: ac.signal });
    }
    return () => ac.abort();
  }, [el]);

  return state;
}

const MINI_DESKTOP_BOX = { width: 344, height: 194 };
const MINI_MOBILE_BOX = { width: 84, height: 48 };
const DISMISS_MS = 200;

/**
 * Owns the app's one <Player> (see the note at the top of this file) and the
 * mini player it shrinks into off the media page: a card in the bottom-right
 * corner on desktop, and a bar floating above the bottom tab bar on mobile
 * (Apple Podcasts-style). Render once, in the app shell.
 */
export function PersistentPlayerHost() {
  const nowPlaying = useStore($nowPlaying);
  const page = useStore($playerPage);
  const browserSize = useBrowserSize();
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const [mediaEl, setMediaEl] = useState<HlsVideoElement | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const miniSlotRef = useRef<HTMLDivElement>(null);

  const mode = getPlayerMode(nowPlaying, page);
  const media = nowPlaying?.media;
  const isOpen = mode === 'mini' && !dismissing;
  const { paused, currentTime, duration } = useMediaElementState(mediaEl);

  // Client-only: there's nothing to play during SSR, and portals don't SSR.
  useEffect(() => {
    setPortalTarget(getContainer());
  }, []);

  useLayoutEffect(() => {
    miniSlot = miniSlotRef.current;
    return () => {
      miniSlot = null;
    };
  }, []);

  useEffect(() => {
    $isNowPlayingPlaying.set(Boolean(mediaEl) && !paused);
  }, [mediaEl, paused]);

  // Left the media page before anything played: nothing to carry over. Layout
  // effect so the parked player never paints in the mini slot.
  useLayoutEffect(() => {
    if (mode === 'none' && nowPlaying) $nowPlaying.set(null);
  }, [mode, nowPlaying]);

  // Put the player where it belongs and animate it there from where it was.
  useLayoutEffect(() => {
    if (!portalTarget || !media || mode === 'none') return;
    const target = mode === 'page' ? page?.slot : miniSlotRef.current;
    if (!target) return;
    const from = lastRect?.mediaId === media.id ? lastRect.rect : null;
    lastRect = null;
    placePlayer(portalTarget, target, from);
  }, [portalTarget, mode, page?.slot, media]);

  // Lock screen / OS media controls show what's playing, which matters most
  // once the media page is gone.
  useEffect(() => {
    if (!media || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: media.title ?? 'Untitled',
      artist: media.channelName,
      artwork: media.posterThumbnailUrl
        ? [{ src: media.posterThumbnailUrl }]
        : [],
    });
    return () => {
      navigator.mediaSession.metadata = null;
    };
  }, [media]);

  const markStarted = useCallback(() => {
    const current = $nowPlaying.get();
    if (current && !current.started) {
      $nowPlaying.set({ ...current, started: true });
    }
  }, []);

  const dismiss = () => {
    mediaEl?.pause();
    setDismissing(true);
    const dismissedId = media?.id;
    window.setTimeout(() => {
      // Something else may have started playing during the fade.
      if ($nowPlaying.get()?.media.id === dismissedId) $nowPlaying.set(null);
      setDismissing(false);
    }, DISMISS_MS);
  };

  const togglePlay = () => {
    if (!mediaEl) return;
    if (mediaEl.paused) {
      mediaEl.play().catch(() => {});
    } else {
      mediaEl.pause();
    }
  };

  const seekBy = (seconds: number) => {
    if (!mediaEl) return;
    mediaEl.currentTime = Math.min(
      Math.max(0, mediaEl.currentTime + seconds),
      mediaEl.duration || Infinity,
    );
  };

  const isDesktop = browserSize.width >= 640;
  const aspect =
    media?.mediaSource && media.width && media.height
      ? media.width / media.height
      : 16 / 9;
  const miniBox = isDesktop ? MINI_DESKTOP_BOX : MINI_MOBILE_BOX;
  const miniSize = fit(miniBox.width, miniBox.height, aspect);

  const mediaLink = media
    ? ({
        to: '/media/$mediaId',
        params: { mediaId: media.shortId },
        search: media.listId ? { list: media.listId } : {},
      } as const)
    : null;
  const title = media?.title ?? 'Untitled';
  const progress =
    !media?.isLive && duration > 0 ? (currentTime / duration) * 100 : null;

  const controlButton = (
    label: string,
    icon: ReactElement,
    onClick: () => void,
    className?: string,
  ) => (
    <LcTooltip
      content={label}
      render={
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            'text-primary flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-white/10',
            className,
          )}
        />
      }
    >
      {icon}
    </LcTooltip>
  );

  return (
    <LcTooltip.Provider>
      <section
        aria-label="Now playing"
        inert={!isOpen}
        className={cn(
          'fixed inset-x-2 bottom-[calc(var(--bottom-tab-bar-height,0px)+0.5rem)] z-30 isolate flex items-center gap-3 p-2',
          'sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-90 sm:flex-col sm:items-stretch sm:gap-2',
          !isOpen && 'pointer-events-none',
        )}
      >
        {/* The card's surface fades on its own, so the player flying in or
            out (a child of this section) is never faded with it. */}
        <div
          aria-hidden
          className={cn(
            'absolute inset-0 -z-10 rounded-xl border border-zinc-200 bg-white/95 shadow-2xl backdrop-blur-md transition-[opacity,translate] duration-200 dark:border-zinc-800 dark:bg-zinc-900/95',
            isOpen ? 'opacity-100' : 'translate-y-2 opacity-0',
          )}
        />

        <div
          className={cn(
            'group relative flex h-12 w-21 shrink-0 items-center justify-center sm:h-auto sm:w-full sm:aspect-video',
            // Mid-hand-off (left the page before playback started) the player
            // is parked here for a moment; never show it.
            mode === 'none' && 'invisible',
            dismissing && 'opacity-0 transition-opacity duration-200',
          )}
        >
          <div
            ref={miniSlotRef}
            className="flex size-full items-center justify-center"
          />
          {mediaLink ? (
            // Pointer shortcut to expand; the title link is the accessible one.
            <Link
              {...mediaLink}
              aria-hidden
              tabIndex={-1}
              className="absolute inset-0 flex items-start rounded-lg p-1.5 opacity-0 transition-opacity group-hover:opacity-100 max-sm:hidden"
            >
              <span className="rounded-md bg-black/60 p-1 text-white">
                <IconArrowsDiagonal size={16} />
              </span>
            </Link>
          ) : null}
        </div>

        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1 transition-opacity duration-200 sm:px-1',
            isOpen ? 'opacity-100' : 'opacity-0',
          )}
        >
          {media && mediaLink ? (
            <>
              <div className="mr-1 min-w-0 flex-1">
                <Link
                  {...mediaLink}
                  className="text-primary block truncate text-sm font-semibold hover:underline focus-visible:underline"
                >
                  {title}
                </Link>
                <p className="text-secondary flex items-center gap-1.5 truncate text-xs">
                  {media.isLive ? (
                    <span className="rounded bg-red-600 px-1 text-[10px] font-semibold text-white uppercase">
                      Live
                    </span>
                  ) : null}
                  <span className="truncate">{media.channelName}</span>
                </p>
              </div>
              {media.isLive
                ? null
                : controlButton(
                    'Back 15 seconds',
                    <IconRewindBackward15 size={20} />,
                    () => seekBy(-15),
                    'max-sm:hidden',
                  )}
              {controlButton(
                paused ? 'Play' : 'Pause',
                paused ? (
                  <IconPlayerPlayFilled size={20} />
                ) : (
                  <IconPlayerPauseFilled size={20} />
                ),
                togglePlay,
              )}
              {media.isLive
                ? null
                : controlButton(
                    'Forward 15 seconds',
                    <IconRewindForward15 size={20} />,
                    () => seekBy(15),
                    'max-sm:hidden',
                  )}
              {controlButton('Close player', <IconX size={18} />, dismiss)}
            </>
          ) : null}
        </div>

        {progress !== null ? (
          <div
            aria-hidden
            className={cn(
              'absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full bg-zinc-200 transition-opacity duration-200 dark:bg-white/10',
              isOpen ? 'opacity-100' : 'opacity-0',
            )}
          >
            <div
              className="bg-brand h-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
      </section>

      {portalTarget && nowPlaying && media
        ? createPortal(
            <Player
              key={media.id}
              uploadRecordId={media.id}
              viewHash={nowPlaying.viewHash}
              mediaSource={media.mediaSource}
              audioSource={media.audioSource}
              posterThumbnailUrl={media.posterThumbnailUrl}
              peaksJsonUrl={media.peaksJsonUrl}
              lengthSeconds={media.lengthSeconds}
              isLive={media.isLive}
              videoWidth={
                mode === 'page' && page ? page.videoWidth : miniSize.width
              }
              videoHeight={
                mode === 'page' && page ? page.videoHeight : miniSize.height
              }
              videoClassName={mode === 'page' ? page?.videoClassName : null}
              docked={mode === 'page' && Boolean(page?.docked)}
              mini={mode !== 'page'}
              initialTimestamp={
                mode === 'page' ? page?.initialTimestamp : undefined
              }
              // Autoplay-next is the media page's business; in the mini
              // player, media just stops at the end.
              onVideoEnded={mode === 'page' ? page?.onVideoEnded : undefined}
              onPlaybackStart={markStarted}
              onMediaElement={setMediaEl}
            />,
            portalTarget,
          )
        : null}
    </LcTooltip.Provider>
  );
}
