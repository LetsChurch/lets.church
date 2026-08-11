import { describe, expect, it } from 'vitest';

import {
  canExposeListWithoutDirectLink,
  canShowUploadInList,
  getListUploadVisibilities,
  isListDiscoverable,
} from './list-visibility-rules';

describe('list visibility', () => {
  it('only exposes public lists through discovery pages', () => {
    expect(isListDiscoverable('PUBLIC')).toBe(true);
    expect(isListDiscoverable('UNLISTED')).toBe(false);
  });

  it('does not infer an unlisted collection from a media link', () => {
    expect(canExposeListWithoutDirectLink('PUBLIC')).toBe(true);
    expect(canExposeListWithoutDirectLink('UNLISTED')).toBe(false);
  });

  it('only includes public uploads in public lists', () => {
    expect(getListUploadVisibilities('PUBLIC')).toEqual(['PUBLIC']);
    expect(canShowUploadInList('PUBLIC', 'PUBLIC')).toBe(true);
    expect(canShowUploadInList('PUBLIC', 'UNLISTED')).toBe(false);
    expect(canShowUploadInList('PUBLIC', 'PRIVATE')).toBe(false);
  });

  it('includes public and unlisted uploads in unlisted lists', () => {
    expect(getListUploadVisibilities('UNLISTED')).toEqual([
      'PUBLIC',
      'UNLISTED',
    ]);
    expect(canShowUploadInList('UNLISTED', 'PUBLIC')).toBe(true);
    expect(canShowUploadInList('UNLISTED', 'UNLISTED')).toBe(true);
    expect(canShowUploadInList('UNLISTED', 'PRIVATE')).toBe(false);
  });
});
