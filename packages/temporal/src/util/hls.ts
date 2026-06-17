// Minimal HLS playlist parsing for the storage audit's recursive integrity
// check. We do not need a full HLS implementation — only the set of object
// keys a playlist references so we can verify they exist in S3.

/**
 * Extract every referenced URI from one playlist body:
 * - plain (non-`#`) lines are segment or variant-playlist URIs;
 * - `#...:...,URI="..."` tags (EXT-X-MAP, EXT-X-MEDIA, EXT-X-I-FRAME-STREAM-INF,
 *   EXT-X-KEY, EXT-X-PART, ...) carry a URI attribute.
 */
export function extractHlsUris(playlist: string): Array<string> {
  const uris: Array<string> = [];
  for (const rawLine of playlist.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const match = line.match(/URI="([^"]+)"/i);
      if (match?.[1]) uris.push(match[1]);
      continue;
    }
    uris.push(line);
  }
  return uris;
}

// http(s):// and protocol-relative (//host/...) URIs point outside our bucket.
function isExternalUri(uri: string): boolean {
  return /^[a-z]+:\/\//i.test(uri) || uri.startsWith('//');
}

/**
 * Resolve a playlist-relative URI to an S3 object key, relative to the
 * directory of the playlist it appeared in. Handles `./` and `../` segments.
 */
export function resolveHlsKey(playlistKey: string, uri: string): string {
  const baseDir = playlistKey.includes('/')
    ? playlistKey.slice(0, playlistKey.lastIndexOf('/'))
    : '';
  const stripped = uri.replace(/^\.\//, '');
  const parts = (baseDir ? `${baseDir}/${stripped}` : stripped).split('/');
  const out: Array<string> = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

export type HlsReferenceResult = {
  // Every object key the HLS tree references (playlists, init segments, media
  // segments), resolved relative to the master playlist.
  referenced: Set<string>;
  // Playlists that were present but could not be read/parsed.
  broken: Array<string>;
};

/**
 * Walk an HLS tree starting at `masterKey`, following variant/audio playlists
 * recursively, and collect every referenced object key.
 *
 * `present` is the set of keys actually in the bucket under this prefix — we
 * only fetch playlists known to be present (a missing playlist is reported via
 * the `referenced \ present` diff by the caller, not fetched here), so
 * `fetchPlaylist` failures are genuine read errors → `broken`.
 */
export async function collectReferencedHlsKeys(
  masterKey: string,
  present: ReadonlySet<string>,
  fetchPlaylist: (key: string) => Promise<string>,
): Promise<HlsReferenceResult> {
  const referenced = new Set<string>([masterKey]);
  const broken: Array<string> = [];
  const visited = new Set<string>();
  const toVisit: Array<string> = [masterKey];

  while (toVisit.length > 0) {
    const playlistKey = toVisit.pop();
    if (!playlistKey || visited.has(playlistKey)) continue;
    visited.add(playlistKey);

    let body: string;
    try {
      body = await fetchPlaylist(playlistKey);
    } catch {
      broken.push(playlistKey);
      continue;
    }

    for (const uri of extractHlsUris(body)) {
      if (isExternalUri(uri)) continue;
      const key = resolveHlsKey(playlistKey, uri);
      referenced.add(key);
      // Recurse into nested playlists, but only if they actually exist —
      // a missing playlist surfaces through the referenced\present diff.
      if (key.endsWith('.m3u8') && present.has(key) && !visited.has(key)) {
        toVisit.push(key);
      }
    }
  }

  return { referenced, broken };
}
