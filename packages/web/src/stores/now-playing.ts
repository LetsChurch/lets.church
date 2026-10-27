import { atom } from 'nanostores';

// What the persistent player (components/persistent-player.tsx) is playing.
// Set by the media page; outlives it so playback can continue in the mini
// player while the user browses elsewhere.
export type NowPlayingMedia = {
  // Full UUID (what the player reports watch time against).
  id: string;
  // Canonical short id, for linking back to the media page.
  shortId: string;
  listId?: string;
  title: string | null;
  channelName: string;
  mediaSource: string | null;
  audioSource: string | null;
  posterThumbnailUrl: string | null;
  peaksJsonUrl: string | null;
  lengthSeconds: number | null;
  width: number | null;
  height: number | null;
  isLive: boolean;
  // Whether the media page would show a transcript (and so "Ask") for this
  // media, and whether it's still being generated. Drives the mini player's
  // transcript/ask panel.
  hasTranscript: boolean;
  isTranscriptProcessing: boolean;
};

export type NowPlaying = {
  media: NowPlayingMedia;
  viewHash: string;
  // Playback has begun at least once. Only then does leaving the media page
  // hand off to the mini player; media that never played just stops.
  started: boolean;
};

export const $nowPlaying = atom<NowPlaying | null>(null);

// How the media page wants the player shown while it's on screen. Null when
// no media page is mounted, which is what sends the player to the mini player.
export type PlayerPagePresentation = {
  mediaId: string;
  slot: HTMLElement;
  videoWidth: number;
  videoHeight: number;
  videoClassName: string | null;
  docked: boolean;
  initialTimestamp: number | undefined;
  onVideoEnded: (() => void) | undefined;
};

export const $playerPage = atom<PlayerPagePresentation | null>(null);

// True while the persistent player is actually playing (not paused/ended), so
// other audio sources (e.g. hover previews) can stay quiet instead of talking
// over it.
export const $isNowPlayingPlaying = atom(false);
