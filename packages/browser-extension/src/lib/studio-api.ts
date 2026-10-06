/**
 * Read video metadata (and the owner's download link) from YouTube Studio's
 * own internal API, from inside a Studio tab.
 *
 * This is the same `creator/get_creator_videos` request Studio makes for its
 * Content list and edit page. It's undocumented, so everything that knows its
 * shape lives here. Verified against Studio in October 2026:
 * - config comes from the `ytcfg.set({...})` inline script (API key, client
 *   context, session index, and for brand accounts the delegated session id);
 * - auth is the standard `SAPISIDHASH` header derived from the SAPISID cookie;
 * - without `delegationContext`, Studio answers 200 with every field empty.
 *
 * Nothing here leaves the Studio origin: the cookie-derived header is only sent
 * back to studio.youtube.com.
 */
import type { StudioVideo } from './types';

const VIDEO_MASK = {
  videoId: true,
  channelId: true,
  title: true,
  description: true,
  lengthSeconds: true,
  timePublishedSeconds: true,
  timeCreatedSeconds: true,
  privacy: true,
  originalFilename: true,
  downloadUrl: true,
} as const;

const MAX_IDS_PER_REQUEST = 50;

type StudioConfig = {
  INNERTUBE_API_KEY?: string;
  INNERTUBE_CONTEXT?: { user?: Record<string, unknown> } & Record<
    string,
    unknown
  >;
  SESSION_INDEX?: number | string;
  DELEGATED_SESSION_ID?: string;
  CHANNEL_ID?: string;
};

type RawVideo = {
  videoId?: string;
  channelId?: string;
  title?: string;
  description?: string;
  lengthSeconds?: string | number;
  timePublishedSeconds?: string | number;
  timeCreatedSeconds?: string | number;
  privacy?: string;
  originalFilename?: string;
  downloadUrl?: string;
};

/** Merge every `ytcfg.set({...})` object literal found in the given scripts. */
export function parseStudioConfig(scriptTexts: Iterable<string>): StudioConfig {
  const config: Record<string, unknown> = {};
  const marker = 'ytcfg.set({';

  for (const text of scriptTexts) {
    let start = text.indexOf(marker);
    while (start >= 0) {
      const open = start + marker.length - 1;
      let depth = 0;
      let inString: string | null = null;
      let end = -1;
      for (let i = open; i < text.length; i++) {
        const c = text[i];
        if (inString) {
          if (c === '\\') {
            i++;
          } else if (c === inString) {
            inString = null;
          }
        } else if (c === '"' || c === "'") {
          inString = c;
        } else if (c === '{') {
          depth++;
        } else if (c === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end < 0) {
        break;
      }
      try {
        Object.assign(config, JSON.parse(text.slice(open, end + 1)));
      } catch {
        // Not every ytcfg.set call is plain JSON; skip those.
      }
      start = text.indexOf(marker, end);
    }
  }

  return config as StudioConfig;
}

function toNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toPrivacy(value: string | undefined): StudioVideo['privacy'] {
  switch (value) {
    case 'VIDEO_PRIVACY_PUBLIC':
      return 'public';
    case 'VIDEO_PRIVACY_UNLISTED':
      return 'unlisted';
    case 'VIDEO_PRIVACY_PRIVATE':
      return 'private';
    default:
      return 'unknown';
  }
}

export function toStudioVideo(raw: RawVideo): StudioVideo | null {
  if (!raw.videoId) {
    return null;
  }
  const published = toNumber(raw.timePublishedSeconds);
  const created = toNumber(raw.timeCreatedSeconds);
  // Never-published videos report timePublishedSeconds "0".
  const seconds = published && published > 0 ? published : (created ?? 0);

  return {
    videoId: raw.videoId,
    title: raw.title ?? '',
    description: raw.description ?? '',
    lengthSeconds: toNumber(raw.lengthSeconds),
    publishedAt: seconds * 1000,
    privacy: toPrivacy(raw.privacy),
    originalFileName: raw.originalFilename || null,
    downloadUrl: raw.downloadUrl
      ? new URL(raw.downloadUrl, 'https://www.youtube.com').toString()
      : null,
    youtubeChannelId: raw.channelId ?? null,
  };
}

async function sapisidHash(sapisid: string, origin: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(`${timestamp} ${sapisid} ${origin}`),
  );
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `SAPISIDHASH ${timestamp}_${hex}`;
}

function readCookie(name: string) {
  for (const part of document.cookie.split('; ')) {
    const eq = part.indexOf('=');
    if (part.slice(0, eq) === name) {
      return part.slice(eq + 1);
    }
  }
  return null;
}

// Firefox content-script `fetch` runs with the extension's principal; the
// page's own `content.fetch` sends the request as Studio would.
function pageFetch(): typeof fetch {
  const content = (globalThis as { content?: { fetch?: typeof fetch } })
    .content;
  return content?.fetch ? content.fetch.bind(content) : fetch;
}

export class StudioApiError extends Error {
  override name = 'StudioApiError';
}

/** Fetch metadata + download links for videos on the signed-in Studio channel. */
export async function getStudioVideos(
  videoIds: ReadonlyArray<string>,
): Promise<Array<StudioVideo>> {
  const config = parseStudioConfig(
    [...document.scripts].map((s) => s.textContent ?? ''),
  );
  const sapisid = readCookie('SAPISID') ?? readCookie('__Secure-3PAPISID');
  if (!config.INNERTUBE_API_KEY || !config.INNERTUBE_CONTEXT || !sapisid) {
    throw new StudioApiError(
      'Could not read YouTube Studio session. Reload Studio and try again.',
    );
  }

  const origin = location.origin;
  const context = structuredClone(config.INNERTUBE_CONTEXT);
  context.user = {
    ...context.user,
    ...(config.DELEGATED_SESSION_ID
      ? { onBehalfOfUser: config.DELEGATED_SESSION_ID }
      : {}),
    ...(config.CHANNEL_ID
      ? {
          delegationContext: {
            externalChannelId: config.CHANNEL_ID,
            roleType: { channelRoleType: 'CREATOR_CHANNEL_ROLE_TYPE_OWNER' },
          },
        }
      : {}),
  };

  const videos: Array<StudioVideo> = [];
  for (let i = 0; i < videoIds.length; i += MAX_IDS_PER_REQUEST) {
    const batch = videoIds.slice(i, i + MAX_IDS_PER_REQUEST);
    const res = await pageFetch()(
      `/youtubei/v1/creator/get_creator_videos?alt=json&key=${encodeURIComponent(config.INNERTUBE_API_KEY)}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          authorization: await sapisidHash(sapisid, origin),
          'x-origin': origin,
          'x-goog-authuser': String(config.SESSION_INDEX ?? 0),
          ...(config.DELEGATED_SESSION_ID
            ? { 'x-goog-pageid': config.DELEGATED_SESSION_ID }
            : {}),
        },
        body: JSON.stringify({
          context,
          failOnError: true,
          videoIds: batch,
          mask: VIDEO_MASK,
          criticalRead: false,
        }),
      },
    );
    if (!res.ok) {
      throw new StudioApiError(`YouTube Studio returned ${res.status}`);
    }
    const json = (await res.json()) as { videos?: Array<RawVideo> };
    for (const raw of json.videos ?? []) {
      const video = toStudioVideo(raw);
      if (video) {
        videos.push(video);
      }
    }
  }

  const missing = videos.filter((v) => !v.title && !v.downloadUrl);
  if (missing.length > 0) {
    throw new StudioApiError(
      'YouTube Studio did not return video details. Make sure you are signed in as an owner of this channel.',
    );
  }

  return videos;
}
