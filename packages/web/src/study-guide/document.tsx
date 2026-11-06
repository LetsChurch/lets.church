import type {
  StudyGuideContent,
  StudyGuidePassage,
  StudyGuideRef,
} from '@letschurch/temporal/util/study-guide';
import {
  Canvas,
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { ReactNode } from 'react';

import { formatBibleRef, formatBibleRefShort } from '@/util/bible-url';
import { formatTime } from '@/util/format';

// Two US Letter pages (612×792pt): the front follows along with the recording
// (passage, fill-in outline, notes), the back is for afterwards (questions,
// terms, quotes, further reading). Sizes are in points.

// Each face is registered twice: its Latin subset, then its Latin Extended
// subset as a per-glyph fallback (for words like "dōrean").
export const FONT_FAMILIES = {
  serif: 'Newsreader',
  serifExt: 'Newsreader Ext',
  sans: 'Hanken Grotesk',
  sansExt: 'Hanken Grotesk Ext',
} as const;
const SERIF = [FONT_FAMILIES.serif, FONT_FAMILIES.serifExt];
const SANS = [FONT_FAMILIES.sans, FONT_FAMILIES.sansExt];

const INK = '#1b1b1b';
const MUTED = '#3d3d3d';
const RULE = '#9a9a9a';
const ACCENT = '#1d4a66';
const TINT = '#eef2f5';
const NOTE_LINE = 22;
// Letter is 612pt wide; the page's side padding leaves 524pt for content.
const FOOTER_RIGHT_WIDTH = 240;
const FOOTER_LEFT_WIDTH = 524 - FOOTER_RIGHT_WIDTH - 12;
// The footer sits in a band below the content area, so content that runs
// long moves to another page instead of under the footer.
const FOOTER_BOTTOM = 24;
const FOOTER_BAND = 42;

const s = StyleSheet.create({
  page: {
    paddingTop: 38,
    paddingBottom: FOOTER_BOTTOM + FOOTER_BAND,
    paddingHorizontal: 44,
    fontFamily: SANS,
    fontSize: 10.5,
    lineHeight: 1.45,
    color: INK,
  },
  kicker: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: ACCENT,
  },
  h2: { fontFamily: SERIF, fontWeight: 600, fontSize: 15, lineHeight: 1.2 },
  muted: { fontSize: 9, color: MUTED },
  footer: {
    position: 'absolute',
    bottom: FOOTER_BOTTOM,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.75,
    borderTopColor: RULE,
    paddingTop: 5,
    fontSize: 8,
    color: MUTED,
  },
});

export type StudyGuideMeta = {
  channelName: string;
  publishedAt: Date | null;
  lengthSeconds: number | null;
  /** Absolute link to the media page, printed in the footer. */
  mediaUrl: string;
  /** QR code images (PNG data URLs): the media page, then one per quote. */
  mediaQr: string;
  quoteQrs: string[];
};

function refLabel(ref: StudyGuideRef): string {
  return formatBibleRef(ref);
}

/** "2 Timothy 1:5; 3:14-17 · Jude 3": consecutive refs to one book share its name. */
export function groupRefs(refs: readonly StudyGuideRef[]): string {
  const groups: string[] = [];
  let book: string | null = null;
  for (const ref of refs) {
    if (ref.book === book && groups.length > 0) {
      const short = formatBibleRefShort(ref);
      groups[groups.length - 1] += short ? `; ${short}` : '';
    } else {
      groups.push(refLabel(ref));
      book = ref.book;
    }
  }
  return groups.join('  ·  ');
}

function dateLabel(date: Date | null): string | null {
  return date
    ? date.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;
}

function Kicker({ children }: { children: ReactNode }) {
  return <Text style={s.kicker}>{children}</Text>;
}

function PassageText({
  passage,
  fontSize,
}: {
  passage: StudyGuidePassage;
  fontSize: number;
}) {
  const crossesChapters = passage.verses.some(
    (v) => v.chapter !== passage.verses[0]?.chapter,
  );
  return (
    <Text style={{ fontFamily: SERIF, fontSize, lineHeight: 1.45 }}>
      {passage.verses.map((v) => (
        <Text key={`${v.chapter}:${v.verse}`}>
          <Text
            style={{
              fontFamily: SANS,
              fontSize: fontSize * 0.6,
              fontWeight: 700,
              color: ACCENT,
            }}
          >
            {crossesChapters ? `${v.chapter}:${v.verse}` : v.verse}{' '}
          </Text>
          {v.text}{' '}
        </Text>
      ))}
    </Text>
  );
}

// Page numbers come from the renderer, so a guide that still runs long (see
// fitStep) numbers correctly.
function Footer({ left, right }: { left: string; right: string }) {
  return (
    <View style={s.footer} fixed>
      {/* Two fixed columns, so a long outline-answers line wraps instead of
          running under the page number. */}
      <Text style={{ width: FOOTER_LEFT_WIDTH }}>{left}</Text>
      <Text
        style={{
          position: 'absolute',
          right: 0,
          top: 5,
          width: FOOTER_RIGHT_WIDTH,
          textAlign: 'right',
        }}
        fixed
        render={({ pageNumber, totalPages }) =>
          `${right}  ·  ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

function Front({
  content,
  meta,
}: {
  content: StudyGuideContent;
  meta: StudyGuideMeta;
}) {
  const byline = [
    meta.channelName,
    dateLabel(meta.publishedAt),
    meta.lengthSeconds
      ? `${Math.round(meta.lengthSeconds / 60)} minutes`
      : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Page size="LETTER" style={s.page}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          borderBottomWidth: 1.5,
          borderBottomColor: INK,
          paddingBottom: 10,
          gap: 18,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Kicker>
            Study guide
            {content.seriesLabel ? `  ·  ${content.seriesLabel}` : ''}
          </Kicker>
          <Text
            style={{
              fontFamily: SERIF,
              fontWeight: 600,
              fontSize: content.title.length > 40 ? 26 : 36,
              lineHeight: 1.05,
            }}
          >
            {content.title}
          </Text>
          <Text style={{ fontSize: 10, color: MUTED }}>{byline}</Text>
        </View>
        <View style={{ alignItems: 'center', gap: 3 }}>
          <Image src={meta.mediaQr} style={{ width: 58, height: 58 }} />
          <Text style={s.muted}>Watch or listen</Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: 18,
          marginTop: 16,
          alignItems: 'flex-start',
        }}
      >
        <View style={{ flex: 2, gap: 5 }}>
          <Kicker>The big idea</Kicker>
          <Text style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.3 }}>
            {content.bigIdea}
          </Text>
          {content.opening ? (
            <>
              <View style={{ marginTop: 8 }}>
                <Kicker>Before you begin</Kicker>
              </View>
              <Text style={{ fontSize: 10, color: MUTED }}>
                {content.opening}
              </Text>
            </>
          ) : null}
        </View>
        {content.keyPassage ? (
          <View
            style={{
              flex: 3,
              borderWidth: 1,
              borderColor: INK,
              paddingVertical: 11,
              paddingHorizontal: 14,
              gap: 5,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
              }}
            >
              <Text
                style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 13 }}
              >
                {refLabel(content.keyPassage.ref)}
              </Text>
              <Text style={s.muted}>{content.keyPassage.translation}</Text>
            </View>
            <PassageText passage={content.keyPassage} fontSize={11.5} />
          </View>
        ) : null}
      </View>

      <View style={{ marginTop: 16, gap: 7 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <Text style={s.h2}>Outline</Text>
          <Text style={s.muted}>
            Fill in the blanks as you listen · times are in the video
          </Text>
        </View>
        {content.outline.map((point) => {
          // Main points (I., II., …) get large numerals; Intro and Apply a label.
          const roman = /^[IVXLC]+\.$/.test(point.marker);
          return (
            <View
              key={`${point.marker}-${point.before}`}
              style={{ flexDirection: 'row', gap: 9 }}
              wrap={false}
            >
              <Text
                style={
                  roman
                    ? {
                        width: 34,
                        fontFamily: SERIF,
                        fontWeight: 600,
                        fontSize: 14,
                        lineHeight: 1.1,
                        color: ACCENT,
                      }
                    : {
                        width: 34,
                        fontSize: 9,
                        fontWeight: 700,
                        color: ACCENT,
                      }
                }
              >
                {point.marker}
              </Text>
              <Text style={{ flex: 1 }}>
                {point.before}
                {point.answer !== null ? (
                  <Text style={{ color: RULE }}>
                    {'_'.repeat(Math.max(12, point.answer.length + 6))}
                  </Text>
                ) : null}
                {point.after}
              </Text>
              <Text style={{ width: 34, textAlign: 'right', ...s.muted }}>
                {point.startSec !== null
                  ? formatTime(point.startSec * 1000)
                  : ''}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Lines fill whatever height the page has left: a Canvas is laid out
          first and painted with its final size, so the notes never spill
          onto another page. */}
      <View style={{ flexGrow: 1, marginTop: 14 }}>
        <Text style={s.h2}>Notes</Text>
        <Canvas
          style={{ flexGrow: 1 }}
          paint={(painter, width, height) => {
            for (let y = NOTE_LINE; y <= height; y += NOTE_LINE) {
              painter
                .moveTo(0, y)
                .lineTo(width, y)
                .lineWidth(0.6)
                .strokeColor(RULE)
                .stroke();
            }
            return null;
          }}
        />
      </View>

      <Footer
        left={meta.mediaUrl.replace(/^https?:\/\//, '')}
        right="Scripture: Berean Standard Bible (public domain)"
      />
    </Page>
  );
}

// Kept whole, so a heading never ends a page without its content.
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 4 }} wrap={false}>
      <Text style={s.h2}>{title}</Text>
      {children}
    </View>
  );
}

function Numbered({ items, start }: { items: string[]; start: number }) {
  return (
    <View style={{ gap: 3 }}>
      {items.map((item, i) => (
        <View key={item} style={{ flexDirection: 'row', gap: 6 }} wrap={false}>
          <Text style={{ width: 12, fontWeight: 700 }}>{start + i}</Text>
          <Text style={{ flex: 1 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Back({
  content,
  meta,
  prayLeft,
}: {
  content: StudyGuideContent;
  meta: StudyGuideMeta;
  prayLeft: boolean;
}) {
  const pray = (
    <Section title="Pray">
      <Text>{content.prayer}</Text>
    </Section>
  );
  const { observe, interpret, apply } = content.questions;
  const tiers = [
    { label: 'Observe', items: observe },
    { label: 'Interpret', items: interpret },
    { label: 'Apply', items: apply },
  ].filter((t) => t.items.length > 0);
  let number = 1;
  // Each answer carries its point's marker, so a blank left without an
  // answer can't shift the rest onto the wrong points.
  const answers = content.outline.flatMap((o) =>
    o.answer ? [`${o.marker} ${o.answer}`] : [],
  );

  return (
    <Page size="LETTER" style={s.page}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          borderBottomWidth: 1.5,
          borderBottomColor: INK,
          paddingBottom: 7,
        }}
      >
        <Text style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 16 }}>
          {content.title} · Going further
        </Text>
        <Text style={s.muted}>{meta.channelName}</Text>
      </View>

      <View
        style={{ flexDirection: 'row', gap: 20, marginTop: 13, flexGrow: 1 }}
      >
        <View style={{ flex: 7, gap: 13 }}>
          <Section title="Discussion questions">
            {tiers.map((tier) => {
              const start = number;
              number += tier.items.length;
              return (
                <View key={tier.label} style={{ gap: 3, marginTop: 2 }}>
                  <Kicker>{tier.label}</Kicker>
                  <Numbered items={tier.items} start={start} />
                </View>
              );
            })}
          </Section>

          {content.family ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: INK,
                paddingVertical: 9,
                paddingHorizontal: 12,
                gap: 4,
              }}
              wrap={false}
            >
              <Text
                style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 13 }}
              >
                Talk about it at home
              </Text>
              <Text>{content.family.intro}</Text>
              {content.family.prompts.map((prompt) => (
                <View key={prompt} style={{ flexDirection: 'row', gap: 5 }}>
                  <Text>•</Text>
                  <Text style={{ flex: 1 }}>{prompt}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {content.quotes.length > 0 ? (
            <Section title="Worth repeating">
              <View style={{ gap: 8 }}>
                {content.quotes.map((quote, i) => (
                  <View
                    key={quote.text}
                    style={{
                      flexDirection: 'row',
                      gap: 10,
                      alignItems: 'center',
                    }}
                    wrap={false}
                  >
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: SERIF,
                        fontStyle: 'italic',
                        fontSize: 11.5,
                      }}
                    >
                      “{quote.text}”{' '}
                      <Text
                        style={{
                          fontFamily: SANS,
                          fontStyle: 'normal',
                          ...s.muted,
                        }}
                      >
                        {formatTime(quote.startSec * 1000)}
                      </Text>
                    </Text>
                    {meta.quoteQrs[i] ? (
                      <Image
                        src={meta.quoteQrs[i]}
                        style={{ width: 36, height: 36 }}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            </Section>
          ) : null}
          {prayLeft ? pray : null}
        </View>

        <View style={{ flex: 5, gap: 13 }}>
          {content.memoryVerse ? (
            <View
              style={{
                backgroundColor: TINT,
                paddingVertical: 10,
                paddingHorizontal: 12,
                gap: 3,
              }}
              wrap={false}
            >
              <Kicker>Memory verse</Kicker>
              <PassageText passage={content.memoryVerse} fontSize={11.5} />
              <Text style={{ fontSize: 9.5, fontWeight: 600 }}>
                {refLabel(content.memoryVerse.ref)}
              </Text>
            </View>
          ) : null}

          {content.keyTerms.length > 0 ? (
            <Section title="Key terms">
              {content.keyTerms.map((t) => (
                <Text key={t.term}>
                  <Text style={{ fontWeight: 700 }}>{t.term}</Text>:{' '}
                  {t.definition}
                </Text>
              ))}
            </Section>
          ) : null}

          {content.timeline ? (
            <Section title={content.timeline.heading}>
              {content.timeline.items.map((item) => (
                <View
                  key={`${item.label}-${item.text}`}
                  style={{ flexDirection: 'row', gap: 7, fontSize: 9.5 }}
                >
                  <Text style={{ width: 44, fontWeight: 700, color: ACCENT }}>
                    {item.label}
                  </Text>
                  <Text style={{ flex: 1 }}>{item.text}</Text>
                </View>
              ))}
            </Section>
          ) : null}

          {prayLeft ? null : pray}

          {content.passages.length > 0 || content.echoes.length > 0 ? (
            <Section title="Go deeper">
              {content.passages.length > 0 ? (
                <>
                  <Text style={{ ...s.kicker, color: MUTED }}>
                    Passages cited
                  </Text>
                  <Text style={{ fontSize: 9.5 }}>
                    {groupRefs(content.passages)}
                  </Text>
                </>
              ) : null}
              {content.echoes.length > 0 ? (
                <>
                  <Text style={{ ...s.kicker, color: MUTED, marginTop: 3 }}>
                    Also echoed
                  </Text>
                  <Text style={{ fontSize: 9.5 }}>
                    {groupRefs(content.echoes)}
                  </Text>
                </>
              ) : null}
              <Text style={{ fontSize: 9.5, marginTop: 3 }}>
                Read these passages, with commentaries, at lets.bible.
              </Text>
            </Section>
          ) : null}
        </View>
      </View>

      <Footer
        left={
          answers.length > 0 ? `Outline answers: ${answers.join(' · ')}` : ''
        }
        right="Prepared from the recording by Let's Church"
      />
    </Page>
  );
}

function firstVerse(
  passage: StudyGuidePassage | null,
): StudyGuidePassage | null {
  const first = passage?.verses[0];
  if (!passage || !first) return passage;
  return {
    ...passage,
    ref: { book: passage.ref.book, chapter: first.chapter, verse: first.verse },
    verses: [first],
  };
}

export type StudyGuideLayout = {
  content: StudyGuideContent;
  /** Put "Pray" under the left column instead of the right. */
  prayLeft: boolean;
};

/**
 * The guide is meant to fit two pages, but how much text the model writes
 * varies. Steps alternate between Pray's two places (the right column, then
 * the left) and, each time round, drop or shorten one more part the guide
 * can best do without. The renderer tries them in order until the guide
 * fits; null once there's nothing left to try.
 */
export function fitStep(
  content: StudyGuideContent,
  step: number,
): StudyGuideLayout | null {
  const trims: ((c: StudyGuideContent) => StudyGuideContent)[] = [
    (c) => ({ ...c, timeline: null }),
    (c) => ({ ...c, memoryVerse: firstVerse(c.memoryVerse) }),
    (c) => ({ ...c, keyTerms: c.keyTerms.slice(0, 4) }),
    (c) => ({ ...c, family: null }),
    (c) => ({ ...c, quotes: c.quotes.slice(0, 1) }),
  ];
  const trimCount = Math.floor(step / 2);
  if (trimCount > trims.length) return null;
  return {
    content: trims.slice(0, trimCount).reduce((c, trim) => trim(c), content),
    prayLeft: step % 2 === 1,
  };
}

export function StudyGuideDocument({
  content,
  meta,
  prayLeft = false,
}: {
  content: StudyGuideContent;
  meta: StudyGuideMeta;
  prayLeft?: boolean;
}) {
  return (
    <Document
      title={`${content.title}: study guide`}
      author={meta.channelName}
      creator="Let's Church"
    >
      <Front content={content} meta={meta} />
      <Back content={content} meta={meta} prayLeft={prayLeft} />
    </Document>
  );
}
