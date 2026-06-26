import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  absoluteWebUrl,
  dashboardPaths,
  mdLink,
  staticMeta,
  trimTrailingSlash,
  uploadDashboardLinks,
} from './dashboard-links';

const BASE = 'https://lets.church';

describe('trimTrailingSlash', () => {
  test('strips trailing slashes, leaves the rest intact', () => {
    expect(trimTrailingSlash('https://lets.church/')).toBe(
      'https://lets.church',
    );
    expect(trimTrailingSlash('https://lets.church///')).toBe(
      'https://lets.church',
    );
    expect(trimTrailingSlash('https://lets.church')).toBe(
      'https://lets.church',
    );
  });
});

describe('absoluteWebUrl', () => {
  test('passes absolute http(s) hrefs through unchanged', () => {
    expect(absoluteWebUrl('http://example.com/x', BASE)).toBe(
      'http://example.com/x',
    );
    expect(absoluteWebUrl('https://example.com/x', BASE)).toBe(
      'https://example.com/x',
    );
  });

  test('resolves a relative path against the base, trimming the base slash', () => {
    expect(absoluteWebUrl('/dashboard', BASE)).toBe(
      'https://lets.church/dashboard',
    );
    expect(absoluteWebUrl('/dashboard', 'https://lets.church/')).toBe(
      'https://lets.church/dashboard',
    );
  });

  test('returns null for a relative path with no base URL', () => {
    // An empty base unambiguously exercises the no-base branch regardless of
    // whether the ambient WEB_URL happens to be set (passing `undefined`
    // would fall back to the `process.env.WEB_URL` default parameter).
    expect(absoluteWebUrl('/dashboard', '')).toBeNull();
  });

  describe('with process.env.WEB_URL as the default base', () => {
    const original = process.env.WEB_URL;
    beforeEach(() => {
      process.env.WEB_URL = BASE;
    });
    afterEach(() => {
      if (original === undefined) {
        delete process.env.WEB_URL;
      } else {
        process.env.WEB_URL = original;
      }
    });

    test('uses WEB_URL when no base argument is passed', () => {
      expect(absoluteWebUrl('/dashboard')).toBe(
        'https://lets.church/dashboard',
      );
    });

    test('returns null when WEB_URL is unset and no base is passed', () => {
      delete process.env.WEB_URL;
      expect(absoluteWebUrl('/dashboard')).toBeNull();
    });
  });
});

describe('mdLink', () => {
  test('renders a markdown link', () => {
    expect(mdLink({ href: 'https://x.test', text: 'X' })).toBe(
      '[X](https://x.test)',
    );
  });
});

describe('staticMeta', () => {
  test('summary only omits staticDetails entirely', () => {
    expect(staticMeta({ summary: 'Hello' })).toEqual({
      staticSummary: 'Hello',
    });
  });

  test('empty links and detailLines still omit staticDetails', () => {
    expect(
      staticMeta({ summary: 'Hello', links: [], detailLines: [] }),
    ).toEqual({ staticSummary: 'Hello' });
  });

  test('renders links as a markdown bullet list', () => {
    expect(
      staticMeta({
        summary: 'S',
        links: [
          { href: 'https://a.test', text: 'A' },
          { href: 'https://b.test', text: 'B' },
        ],
      }),
    ).toEqual({
      staticSummary: 'S',
      staticDetails: '- [A](https://a.test)\n- [B](https://b.test)',
    });
  });

  test('joins links and detailLines into separate blocks', () => {
    expect(
      staticMeta({
        summary: 'S',
        links: [{ href: 'https://a.test', text: 'A' }],
        detailLines: ['line 1', 'line 2'],
      }),
    ).toEqual({
      staticSummary: 'S',
      staticDetails: '- [A](https://a.test)\n\nline 1\nline 2',
    });
  });
});

describe('uploadDashboardLinks', () => {
  test('returns the upload and channel links when channelId and base are present', () => {
    expect(uploadDashboardLinks('chan-1', 'up-1', BASE)).toEqual([
      {
        href: 'https://lets.church/dashboard/channels/chan-1/uploads/up-1',
        text: "Let's Church dashboard",
      },
      {
        href: 'https://lets.church/dashboard/channels/chan-1',
        text: 'Channel dashboard',
      },
    ]);
  });

  test('returns no links when channelId is null/undefined', () => {
    expect(uploadDashboardLinks(null, 'up-1', BASE)).toEqual([]);
    expect(uploadDashboardLinks(undefined, 'up-1', BASE)).toEqual([]);
  });

  test('returns no links when the base URL cannot be resolved', () => {
    // Empty base → no-base branch (see absoluteWebUrl note above).
    expect(uploadDashboardLinks('chan-1', 'up-1', '')).toEqual([]);
  });

  test('builds paths via dashboardPaths', () => {
    expect(dashboardPaths.upload('chan-1', 'up-1')).toBe(
      '/dashboard/channels/chan-1/uploads/up-1',
    );
    expect(dashboardPaths.channel('chan-1')).toBe('/dashboard/channels/chan-1');
  });
});
