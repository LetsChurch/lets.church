import { atom } from 'nanostores';

// Lets the series sidebar (a separate React subtree from media-actions) open
// the media page's Share dialog with the series preselected. A counter so
// repeated requests re-fire; 0 means no request yet.
export const $shareSeriesRequest = atom<number>(0);

export function requestShareSeries(): void {
  $shareSeriesRequest.set($shareSeriesRequest.get() + 1);
}
