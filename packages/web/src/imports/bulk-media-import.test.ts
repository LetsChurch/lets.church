import { describe, expect, it } from 'vitest';

import {
  MAX_BULK_MEDIA_IMPORT_BYTES,
  parseBulkMediaImportCsv,
} from './bulk-media-import';

describe('bulk media CSV import', () => {
  it('prepares required and optional media fields', () => {
    const csv = [
      '\uFEFFMedia URL,Title,Summary,Published Date',
      'https://example.com/sermon.mp4,"Grace, Clearly",A description,2026-08-03 12:30:00',
      'https://example.com/second.mp3,Second sermon,,',
    ].join('\n');

    expect(parseBulkMediaImportCsv(csv)).toEqual([
      {
        url: 'https://example.com/sermon.mp4',
        title: 'Grace, Clearly',
        description: 'A description',
        publishedAt: '2026-08-03T12:30:00.000Z',
      },
      {
        url: 'https://example.com/second.mp3',
        title: 'Second sermon',
      },
    ]);
  });

  it('requires URL and title columns', () => {
    expect(() =>
      parseBulkMediaImportCsv('description\nNo media fields'),
    ).toThrow(/missing required columns: url, title/);
  });

  it('reports the CSV row for missing values', () => {
    expect(() =>
      parseBulkMediaImportCsv(
        'url,title\nhttps://example.com/first.mp4,First\n,Second',
      ),
    ).toThrow(/Row 3 needs a URL/);
  });

  it('only accepts HTTP media URLs', () => {
    expect(() =>
      parseBulkMediaImportCsv('url,title\nfile:///tmp/media.mp4,Local file'),
    ).toThrow(/HTTP or HTTPS/);
  });

  it('rejects ambiguous or invalid publication dates', () => {
    expect(() =>
      parseBulkMediaImportCsv(
        'url,title,publishedAt\nhttps://example.com/media.mp4,Sermon,08/03/2026',
      ),
    ).toThrow(/Row 2 has an invalid publishedAt/);
  });

  it('accepts more than 500 rows in one upload', () => {
    const row = 'https://example.com/media.mp4,Sermon';
    expect(
      parseBulkMediaImportCsv(
        ['url,title', ...Array(501).fill(row)].join('\n'),
      ),
    ).toHaveLength(501);
  });

  it('keeps a bounded upload size above the former chunk size', () => {
    expect(MAX_BULK_MEDIA_IMPORT_BYTES).toBe(64 * 1024 * 1024);
  });
});
