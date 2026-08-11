export type ListVisibility = 'PUBLIC' | 'UNLISTED';
export type ListUploadVisibility = 'PUBLIC' | 'PRIVATE' | 'UNLISTED';

/** Lists shown on a channel page must be explicitly public. */
export function isListDiscoverable(visibility: ListVisibility): boolean {
  return visibility === 'PUBLIC';
}

/** Only public lists may be inferred from a media URL alone. */
export function canExposeListWithoutDirectLink(
  visibility: ListVisibility,
): boolean {
  return visibility === 'PUBLIC';
}

/**
 * A public list contains only public uploads. An unlisted list acts as a
 * shareable direct-link collection and may also reveal unlisted uploads.
 * Private uploads always retain their stronger access boundary.
 */
export function getListUploadVisibilities(
  visibility: ListVisibility,
): Array<'PUBLIC' | 'UNLISTED'> {
  return visibility === 'UNLISTED' ? ['PUBLIC', 'UNLISTED'] : ['PUBLIC'];
}

export function canShowUploadInList(
  listVisibility: ListVisibility,
  uploadVisibility: ListUploadVisibility,
): boolean {
  return (
    uploadVisibility === 'PUBLIC' ||
    (listVisibility === 'UNLISTED' && uploadVisibility === 'UNLISTED')
  );
}
