import type { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const { WEB_URL } = z.object({ WEB_URL: z.string() }).parse(process.env);

/**
 * How the server identifies itself in `initialize`. Clients show the title and
 * icon in their connector lists, and app directories (Claude Connectors,
 * ChatGPT Apps) read these when listing the server.
 *
 * Icons are the site's app icon: `public/app-icon.svg` (the brand mark in its
 * light-mode indigo on opaque white, padded to the maskable safe zone) and the
 * Android PNGs rendered from it by `pnpm run generate:icons`.
 */
export const serverInfo: Implementation = {
  name: 'lets-church',
  title: "Let's Church",
  version: '0.1.0',
  description:
    'Search sermons and teaching by meaning, read timestamped transcripts, ' +
    'and find churches on Let’s Church, a free, ad-free Christian media ' +
    'platform.',
  websiteUrl: `${WEB_URL}/about/mcp`,
  icons: [
    {
      src: `${WEB_URL}/app-icon.svg`,
      mimeType: 'image/svg+xml',
      sizes: ['any'],
    },
    {
      src: `${WEB_URL}/android-chrome-512x512.png`,
      mimeType: 'image/png',
      sizes: ['512x512'],
    },
    {
      src: `${WEB_URL}/android-chrome-192x192.png`,
      mimeType: 'image/png',
      sizes: ['192x192'],
    },
  ],
};

/**
 * Sent to clients that pass server instructions to the model (e.g. Claude):
 * the cross-tool habits that individual tool descriptions can't express.
 */
export const serverInstructions = [
  "Let's Church hosts sermons and Bible teaching from many churches and ministries.",
  'Speaker and channel filters on search_sermons are exact-match: resolve names with find_filter_values first, or reuse values from a previous result’s `refine` block.',
  'When you quote or summarize a sermon, cite the timestamped `url` of the passage so readers can hear it in context, and name the speaker or ministry.',
  'Read transcripts in windows with get_transcript (starting from a search match’s paragraph) rather than requesting whole sermons.',
  'Sermons express their speakers’ views; attribute positions to them rather than presenting them as Let’s Church’s.',
].join('\n');
