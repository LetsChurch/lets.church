// Path of a media page, keeping the playlist/series it's being watched from.
// For links that must point at the media no matter which page builds them
// (e.g. transcript timestamp links copied from the mini player).
export function mediaPagePath(shortId: string, listId?: string): string {
  const path = `/media/${shortId}`;
  return listId ? `${path}?list=${encodeURIComponent(listId)}` : path;
}
