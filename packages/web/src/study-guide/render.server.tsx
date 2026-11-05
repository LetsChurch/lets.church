import hanken400 from '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-400-normal.woff?inline';
import hanken600 from '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-600-normal.woff?inline';
import hanken700 from '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-700-normal.woff?inline';
import hankenExt400 from '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-ext-400-normal.woff?inline';
import hankenExt600 from '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-ext-600-normal.woff?inline';
import hankenExt700 from '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-ext-700-normal.woff?inline';
import newsreader400Italic from '@fontsource/newsreader/files/newsreader-latin-400-italic.woff?inline';
import newsreader400 from '@fontsource/newsreader/files/newsreader-latin-400-normal.woff?inline';
import newsreader600 from '@fontsource/newsreader/files/newsreader-latin-600-normal.woff?inline';
import newsreaderExt400Italic from '@fontsource/newsreader/files/newsreader-latin-ext-400-italic.woff?inline';
import newsreaderExt400 from '@fontsource/newsreader/files/newsreader-latin-ext-400-normal.woff?inline';
import newsreaderExt600 from '@fontsource/newsreader/files/newsreader-latin-ext-600-normal.woff?inline';
import type { StudyGuideContent } from '@letschurch/temporal/util/study-guide';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';

import { FONT_FAMILIES, StudyGuideDocument } from './document';

// The fonts are inlined into the server bundle as data URLs (`?inline`), so
// rendering never reads node_modules at runtime (Nitro bundles the server).
Font.register({
  family: FONT_FAMILIES.serif,
  fonts: [
    { src: newsreader400, fontWeight: 400 },
    { src: newsreader400Italic, fontWeight: 400, fontStyle: 'italic' },
    { src: newsreader600, fontWeight: 600 },
  ],
});
Font.register({
  family: FONT_FAMILIES.serifExt,
  fonts: [
    { src: newsreaderExt400, fontWeight: 400 },
    { src: newsreaderExt400Italic, fontWeight: 400, fontStyle: 'italic' },
    { src: newsreaderExt600, fontWeight: 600 },
  ],
});
Font.register({
  family: FONT_FAMILIES.sans,
  fonts: [
    { src: hanken400, fontWeight: 400 },
    { src: hanken600, fontWeight: 600 },
    { src: hanken700, fontWeight: 700 },
  ],
});
Font.register({
  family: FONT_FAMILIES.sansExt,
  fonts: [
    { src: hankenExt400, fontWeight: 400 },
    { src: hankenExt600, fontWeight: 600 },
    { src: hankenExt700, fontWeight: 700 },
  ],
});
// Long words shouldn't be split with hyphens on a handout.
Font.registerHyphenationCallback((word) => [word]);

function qr(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 240,
  });
}

export async function renderStudyGuidePdf(args: {
  content: StudyGuideContent;
  channelName: string;
  publishedAt: Date | null;
  lengthSeconds: number | null;
  mediaUrl: string;
}): Promise<Buffer> {
  const [mediaQr, ...quoteQrs] = await Promise.all([
    qr(args.mediaUrl),
    ...args.content.quotes.map((q) =>
      qr(`${args.mediaUrl}#t=${Math.floor(q.startSec)}`),
    ),
  ]);
  return renderToBuffer(
    <StudyGuideDocument
      content={args.content}
      meta={{
        channelName: args.channelName,
        publishedAt: args.publishedAt,
        lengthSeconds: args.lengthSeconds,
        mediaUrl: args.mediaUrl,
        mediaQr: mediaQr as string,
        quoteQrs,
      }}
    />,
  );
}
