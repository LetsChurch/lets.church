import {
  Annotation,
  Channel,
  db,
  StudyGuide,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import { ApplicationFailure } from '@temporalio/activity';
import { and, asc, eq, sql } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import { z } from 'zod';

import {
  createChatCompletionTracked,
  SUMMARY_FALLBACK_MODEL,
  SUMMARY_MODEL,
} from '../../util/llm';
import logger from '../../util/logger';
import { compatible } from '../../util/scripture';
import { normalizeWords } from '../../util/scripture/quotes';
import { passageText } from '../../util/scripture/verse-text';
import {
  validateBibleRef,
  type BibleRef,
} from '../../util/scripture/versification';
import {
  STUDY_GUIDE_VERSION,
  StudyGuideContentSchema,
  type StudyGuideContent,
  type StudyGuidePassage,
} from '../../util/study-guide';
import { lockUploadAnnotations } from './annotation-lock';
import { loadOutlineSectionsForSummary } from './summarize-upload';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/generate-study-guide',
});

export const STUDY_GUIDE_MODEL = SUMMARY_MODEL;

// The guide is a printed two-page handout, so every list is capped: the
// renderer lays out a fixed page, and anything past these limits would
// overflow it.
const MAX_OUTLINE = 7;
const MAX_QUESTIONS = { observe: 2, interpret: 3, apply: 2 } as const;
const MAX_FAMILY_PROMPTS = 3;
const MAX_TERMS = 6;
const MAX_TIMELINE = 5;
const MAX_QUOTES = 2;
const MAX_PASSAGES = 16;
const MAX_ECHOES = 5;
const MAX_KEY_PASSAGE_VERSES = 6;
const MAX_MEMORY_VERSES = 3;
// A quote must share this share of its words, in order, with the paragraph
// it claims to come from (it may fix transcription slips, not invent).
const MIN_QUOTE_OVERLAP = 0.75;
const BLANK = '___';

const SYSTEM_PROMPT = `You write printable study guides for recordings on a Christian media platform: sermons, Bible lessons, talks, readings of a book chapter, and the like. A guide is a two-page handout a small group or family uses after hearing the recording. Everything in it must come from this recording; attribute positions to the speaker (or, for a reading, the author) rather than stating them as the platform's. Wherever a string refers to the recording, call it what it plainly is ("this sermon", "this lesson", "this chapter") or something neutral ("this teaching"); never call it a sermon unless it is one.

Return ONLY a JSON object (no code fences, no commentary) with this shape:

{
  "title": "<the recording's title, without prefixes like 'SERMON:' or the church name>",
  "seriesLabel": "<e.g. 'Part 1 of the series', ONLY if the title or description says so, else null>",
  "bigIdea": "<one sentence, at most 30 words: the recording's central claim>",
  "opening": "<1-2 sentences: the question or tension the recording opens with, or null>",
  "keyPassage": <the main passage taught, as a reference object (see below), at most ${MAX_KEY_PASSAGE_VERSES} verses, or null for a topical talk without one>,
  "outline": [ { "marker": "<'Intro', 'I.', 'II.', …, or 'Apply'>", "text": "<one or two sentences>", "answer": "<the word the blank hides, or null>", "paragraph": <P number where this point starts> } ],
  "questions": { "observe": ["…"], "interpret": ["…"], "apply": ["…"] },
  "family": { "intro": "<one sentence>", "prompts": ["…"] } or null,
  "memoryVerse": <a reference object, 1-${MAX_MEMORY_VERSES} verses, from the passages the recording uses>,
  "keyTerms": [ { "term": "…", "definition": "<at most 15 words>" } ],
  "timeline": { "heading": "…", "items": [ { "label": "<a year or short place>", "text": "<at most 12 words>" } ] } or null,
  "quotes": [ { "text": "<the speaker's words>", "paragraph": <P number> } ],
  "prayer": "<2 sentences prompting the reader's own prayer, drawn from the recording's application>",
  "echoes": [ <reference objects> ],
  "dropPassages": [ "<id from the Passages list>" ]
}

A reference object is {"book": "<OSIS id, e.g. 2Tim, Ps, Jude>", "chapter": n, "verse": n, "endChapter"?: n, "endVerse"?: n}. Single-chapter books use chapter 1.

Outline:
- Follow the speaker's own structure (the points they state or build the recording on), not the Sections list, which is finer-grained. 3 to ${MAX_OUTLINE - 2} main points marked I., II., …, plus an optional "Intro" first and an optional "Apply" last.
- Each main point's text contains exactly one ${BLANK} standing for one key word the listener hears in that point (e.g. "Scripture is ${BLANK} for all God requires"), and "answer" is that word. Intro and Apply have no blank: answer null.
- Cite the verses each point rests on, briefly, e.g. "(2 Tim 3:16)".

Questions: ${MAX_QUESTIONS.observe} observe (what the text says), ${MAX_QUESTIONS.interpret} interpret (what it means), ${MAX_QUESTIONS.apply} apply (what to do). Make them specific to this recording's passages and claims; prefer the speaker's own application questions where they ask them.

family: a box for parents to use with children, in plain words a child understands, ${MAX_FAMILY_PROMPTS} prompts. Null when the recording's subject doesn't suit children.

keyTerms: up to ${MAX_TERMS} terms the recording uses or defines that a listener might not know. The transcript is speech-to-text and often garbles names and foreign words: spell every term correctly, and write Greek and Hebrew words in their standard transliteration (e.g. "dōrean", not a sound-alike English word).

timeline: only when the recording tells a historical story with dates or stages (up to ${MAX_TIMELINE} items); otherwise null. Use only dates the recording states; never work a date out from phrases like "500 years ago".

quotes: up to ${MAX_QUOTES} memorable sentences, quoted as spoken (fix only obvious transcription errors and filler words), with the paragraph they come from.

echoes: up to ${MAX_ECHOES} passages the speaker quotes or alludes to without citing, which are NOT already in the Passages list (e.g. "your word is a lamp to my feet" → Psalm 119:105). Only clear echoes.

dropPassages: ids from the Passages list that are wrong for where they occur, e.g. a phrase matched to the wrong book ("sharp two-edged sword" linked to Revelation when the speaker means Hebrews 4:12). Usually empty.

Tone: plain, warm, concrete. Don't repeat the speaker's criticism of named people, churches or traditions; keep to the text and its claims. No markdown in any string.`;

// The transcript labels paragraphs "[P12]", and models sometimes echo the
// label instead of the bare number.
const ParagraphSchema = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? Number(value.trim().replace(/^\[?P?(\d+)\]?$/i, '$1'))
      : value,
  z.number().int(),
);

const RefOutSchema = z.object({
  book: z.string(),
  chapter: z.number().int().optional(),
  verse: z.number().int().optional(),
  endChapter: z.number().int().optional(),
  endVerse: z.number().int().optional(),
});

const ResponseSchema = z.object({
  title: z.string().min(1),
  seriesLabel: z.string().nullish(),
  bigIdea: z.string().min(1),
  opening: z.string().nullish(),
  keyPassage: RefOutSchema.nullish(),
  outline: z
    .array(
      z.object({
        marker: z.string(),
        text: z.string(),
        answer: z.string().nullish(),
        paragraph: ParagraphSchema.nullish().catch(null),
      }),
    )
    .min(1),
  questions: z.object({
    observe: z.array(z.string()).default([]),
    interpret: z.array(z.string()).default([]),
    apply: z.array(z.string()).default([]),
  }),
  family: z
    .object({ intro: z.string(), prompts: z.array(z.string()) })
    .nullish(),
  memoryVerse: RefOutSchema.nullish(),
  keyTerms: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .default([]),
  timeline: z
    .object({
      heading: z.string(),
      items: z.array(z.object({ label: z.string(), text: z.string() })),
    })
    .nullish(),
  quotes: z
    .array(
      z.object({
        text: z.string(),
        // A quote without a usable paragraph is dropped below.
        paragraph: ParagraphSchema.nullish().catch(null),
      }),
    )
    .default([]),
  prayer: z.string().min(1),
  echoes: z.array(RefOutSchema).default([]),
  dropPassages: z.array(z.string()).default([]),
});
type StudyGuideResponse = z.infer<typeof ResponseSchema>;

type Paragraph = { order: number; text: string; start: number };

/** A passage id the prompt lists and the model echoes back: "2Tim.3.14-17". */
function passageId(ref: BibleRef): string {
  let id = ref.book;
  if (ref.chapter !== undefined) id += `.${ref.chapter}`;
  if (ref.verse !== undefined) id += `.${ref.verse}`;
  if (ref.endChapter !== undefined && ref.endChapter !== ref.chapter) {
    id += `-${ref.endChapter}`;
    if (ref.endVerse !== undefined) id += `.${ref.endVerse}`;
  } else if (ref.endVerse !== undefined) {
    id += `-${ref.endVerse}`;
  }
  return id;
}

type CitedPassage = { ref: BibleRef; firstParagraph: number };

/**
 * The recording's references, in order of first mention: verses in the same
 * chapter collapse into contiguous ranges, and a chapter-level mention is kept
 * only when no verse of that chapter is cited.
 */
export function collectPassages(
  rows: ReadonlyArray<{ metadata: Record<string, unknown>; order: number }>,
): CitedPassage[] {
  type Chapter = {
    book: BibleRef['book'];
    chapter: number;
    /** Each cited verse and the paragraph that first cites it. */
    verses: Map<number, number>;
    first: number;
  };
  const chapters = new Map<string, Chapter>();
  const crossChapter = new Map<string, CitedPassage>();
  for (const row of rows) {
    const ref = validateBibleRef(row.metadata);
    if (!ref || ref.chapter === undefined) continue;
    if (ref.endChapter !== undefined && ref.endChapter !== ref.chapter) {
      const id = passageId(ref);
      if (!crossChapter.has(id)) {
        crossChapter.set(id, { ref, firstParagraph: row.order });
      }
      continue;
    }
    const key = `${ref.book}.${ref.chapter}`;
    let chapter = chapters.get(key);
    if (!chapter) {
      chapter = {
        book: ref.book,
        chapter: ref.chapter,
        verses: new Map(),
        first: row.order,
      };
      chapters.set(key, chapter);
    }
    if (ref.verse !== undefined) {
      for (let v = ref.verse; v <= (ref.endVerse ?? ref.verse); v += 1) {
        if (!chapter.verses.has(v)) chapter.verses.set(v, row.order);
      }
    }
  }

  const out: CitedPassage[] = [...crossChapter.values()];
  for (const c of chapters.values()) {
    if (c.verses.size === 0) {
      out.push({
        ref: { book: c.book, chapter: c.chapter },
        firstParagraph: c.first,
      });
      continue;
    }
    const sorted = [...c.verses.keys()].sort((a, b) => a - b);
    let start = sorted[0] as number;
    let prev = start;
    // A range is first mentioned where any of its verses is.
    let first = c.verses.get(start) as number;
    for (const v of [...sorted.slice(1), Number.POSITIVE_INFINITY]) {
      if (v === prev + 1) {
        prev = v;
        first = Math.min(first, c.verses.get(v) as number);
        continue;
      }
      out.push({
        ref: {
          book: c.book,
          chapter: c.chapter,
          verse: start,
          ...(prev !== start ? { endVerse: prev } : {}),
        },
        firstParagraph: first,
      });
      start = v;
      prev = v;
      first = c.verses.get(v) as number;
    }
  }
  return out.sort((a, b) => a.firstParagraph - b.firstParagraph);
}

function buildUserContent(args: {
  channelName: string;
  title: string | null;
  description: string | null;
  summary: string | null;
  sections: ReadonlyArray<{ title: string; firstParagraphOrder: number }>;
  passages: ReadonlyArray<CitedPassage>;
  paragraphs: ReadonlyArray<Paragraph>;
}): string {
  const lines = [
    `Channel: ${args.channelName}`,
    args.title ? `Title: ${args.title}` : null,
    args.description ? `Description: ${args.description}` : null,
    args.summary ? `Summary: ${args.summary}` : null,
    '',
    'Sections:',
    ...args.sections.map((s) => `- P${s.firstParagraphOrder}: ${s.title}`),
    '',
    'Passages (id: first mentioned at):',
    ...args.passages.map((p) => `- ${passageId(p.ref)}: P${p.firstParagraph}`),
    '',
    'Transcript:',
    '',
    ...args.paragraphs.map((p) => `[P${p.order}] ${p.text}`),
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

function toPassage(
  input: z.infer<typeof RefOutSchema> | null | undefined,
  maxVerses: number,
): StudyGuidePassage | null {
  if (!input) return null;
  const ref = validateBibleRef(input);
  if (!ref) return null;
  const verses = passageText(ref, { translation: 'BSB', maxVerses });
  if (!verses) return null;
  // A range longer than the page holds is printed (and labeled) as its first
  // `maxVerses` verses.
  const last = verses[verses.length - 1] as (typeof verses)[number];
  const first = verses[0] as (typeof verses)[number];
  const printed: BibleRef =
    last.chapter === first.chapter && last.verse === first.verse
      ? { book: ref.book, chapter: first.chapter, verse: first.verse }
      : {
          book: ref.book,
          chapter: first.chapter,
          verse: first.verse,
          ...(last.chapter !== first.chapter
            ? { endChapter: last.chapter }
            : {}),
          endVerse: last.verse,
        };
  return { ref: printed, translation: 'BSB', verses };
}

/** Longest common subsequence length of two word lists. */
function lcs(a: readonly string[], b: readonly string[]): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (const wa of a) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 0; j < b.length; j += 1) {
      row[j + 1] =
        wa === b[j]
          ? (prev[j] as number) + 1
          : Math.max(prev[j + 1] as number, row[j] as number);
    }
    prev = row;
  }
  return prev[b.length] as number;
}

/** Whether a quote is the paragraph's own words, give or take a few fixes. */
export function quoteMatches(quote: string, paragraph: string): boolean {
  const q = normalizeWords(quote);
  if (q.length === 0) return false;
  return lcs(q, normalizeWords(paragraph)) / q.length >= MIN_QUOTE_OVERLAP;
}

/** Split "Scripture is ___ for all" into the text around the blank. */
function splitBlank(text: string, answer: string | null | undefined) {
  // Models sometimes write the blank with more than three underscores.
  const blank = /_{3,}/.exec(text);
  if (!blank) {
    return { before: text.trim(), answer: null, after: '' };
  }
  return {
    before: text.slice(0, blank.index),
    // A blank whose answer the model left out still prints as a blank (the
    // answer key just skips it) rather than closing up the sentence.
    answer: answer?.trim() ?? '',
    after: text.slice(blank.index + blank[0].length),
  };
}

/**
 * Turn the model's response into stored content: resolve references and
 * their verse text, map paragraphs to timestamps, drop quotes that aren't the
 * speaker's words, and cap every list to what the printed page holds.
 */
export function buildContent(
  response: StudyGuideResponse,
  paragraphs: ReadonlyArray<Paragraph>,
  passages: ReadonlyArray<CitedPassage>,
): StudyGuideContent {
  const byOrder = new Map(paragraphs.map((p) => [p.order, p]));
  const startSec = (order: number | null | undefined) =>
    order == null ? null : (byOrder.get(order)?.start ?? null);

  const dropped = new Set(response.dropPassages);
  const kept = passages
    .filter((p) => !dropped.has(passageId(p.ref)))
    .slice(0, MAX_PASSAGES);
  const echoes: BibleRef[] = [];
  for (const echo of response.echoes) {
    const ref = validateBibleRef(echo);
    if (!ref || ref.verse === undefined) continue;
    const id = passageId(ref);
    // Not an echo if the recording cites it (or a range containing it), even a
    // citation past the printed list's cap.
    if (passages.some((p) => compatible(p.ref, ref))) continue;
    if (echoes.some((e) => passageId(e) === id)) continue;
    echoes.push(ref);
    if (echoes.length >= MAX_ECHOES) break;
  }

  const quotes = response.quotes
    .flatMap((q) => {
      const p = q.paragraph == null ? undefined : byOrder.get(q.paragraph);
      return p && quoteMatches(q.text, p.text)
        ? [{ text: q.text, startSec: p.start }]
        : [];
    })
    .slice(0, MAX_QUOTES);

  return StudyGuideContentSchema.parse({
    title: response.title,
    seriesLabel: response.seriesLabel ?? null,
    bigIdea: response.bigIdea,
    opening: response.opening ?? null,
    keyPassage: toPassage(response.keyPassage, MAX_KEY_PASSAGE_VERSES),
    outline: response.outline.slice(0, MAX_OUTLINE).map((o) => ({
      marker: o.marker,
      ...splitBlank(o.text, o.answer),
      startSec: startSec(o.paragraph),
    })),
    questions: {
      observe: response.questions.observe.slice(0, MAX_QUESTIONS.observe),
      interpret: response.questions.interpret.slice(0, MAX_QUESTIONS.interpret),
      apply: response.questions.apply.slice(0, MAX_QUESTIONS.apply),
    },
    family: response.family
      ? {
          intro: response.family.intro,
          prompts: response.family.prompts.slice(0, MAX_FAMILY_PROMPTS),
        }
      : null,
    memoryVerse: toPassage(response.memoryVerse, MAX_MEMORY_VERSES),
    keyTerms: response.keyTerms.slice(0, MAX_TERMS),
    timeline:
      response.timeline && response.timeline.items.length > 0
        ? {
            heading: response.timeline.heading,
            items: response.timeline.items.slice(0, MAX_TIMELINE),
          }
        : null,
    quotes,
    prayer: response.prayer,
    passages: kept.map((p) => p.ref),
    echoes,
  });
}

type Database = Pick<typeof db, 'select'>;

/**
 * What the guide was built from: the summary's timestamp (reset when the
 * transcript is replaced) and the annotations' count and newest write (a
 * rewrite inserts fresh rows; a backfill may only delete some). A change while the LLM call runs means the guide
 * describes data that's gone.
 */
async function sourceStamp(
  conn: Database,
  uploadRecordId: string,
): Promise<string> {
  const [row] = await conn
    .select({
      summarizedAt: UploadRecord.summarizedAt,
      // Raw names: inside a subquery Drizzle renders columns unqualified,
      // which is ambiguous across the joined tables.
      annotatedAt: sql<string | null>`(
        select count(*) || '@' || coalesce(max(a.updated_at)::text, '')
        from annotation a
        join transcript_paragraph p on p.id = a.paragraph_id
        where p.upload_record_id = ${uploadRecordId}
      )`,
    })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadRecordId));
  return JSON.stringify([
    row?.summarizedAt?.toISOString() ?? null,
    row?.annotatedAt ?? null,
  ]);
}

export function parseResponse(raw: string): StudyGuideResponse {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  return ResponseSchema.parse(JSON.parse(stripped));
}

/**
 * Generate and store the printable study guide for one upload. Skips when a
 * guide at the current STUDY_GUIDE_VERSION already exists, so a retried or
 * duplicate request doesn't pay for a second LLM call.
 */
export default async function generateStudyGuide(uploadRecordId: string) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'generateStudyGuide',
    context: { args: { uploadRecordId } },
  });

  const existing = await db.query.StudyGuide.findFirst({
    columns: { version: true },
    where: (t, { eq: equals }) => equals(t.uploadRecordId, uploadRecordId),
  });
  if (existing && existing.version >= STUDY_GUIDE_VERSION) {
    activityLogger.info('Study guide already current; skipping');
    return { generated: false };
  }

  const stamp = await sourceStamp(db, uploadRecordId);
  if (JSON.parse(stamp)[0] === null) {
    // Requested before a reprocess reset the summary: the transcript or its
    // annotations are being rebuilt, and a guide now would describe neither.
    throw ApplicationFailure.nonRetryable(
      `Upload ${uploadRecordId} is being reprocessed`,
      'StudyGuideNotReady',
    );
  }
  const upload = await db
    .select({
      title: UploadRecord.title,
      description: UploadRecord.description,
      summary: UploadRecord.summary,
      channelName: Channel.name,
    })
    .from(UploadRecord)
    .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
    .where(eq(UploadRecord.id, uploadRecordId))
    .then((r) => r[0]);
  invariant(upload, `Upload record ${uploadRecordId} not found`);

  const paragraphs = await db
    .select({
      order: TranscriptParagraph.order,
      text: TranscriptParagraph.text,
      start: TranscriptParagraph.start,
    })
    .from(TranscriptParagraph)
    .where(eq(TranscriptParagraph.uploadRecordId, uploadRecordId))
    .orderBy(asc(TranscriptParagraph.order));
  if (paragraphs.length === 0) {
    // Retrying can't help: a silent or music-only upload has nothing to study.
    throw ApplicationFailure.nonRetryable(
      `Upload ${uploadRecordId} has no transcript paragraphs`,
      'StudyGuideNoTranscript',
    );
  }

  const bibleRows = await db
    .select({ metadata: Annotation.metadata, order: TranscriptParagraph.order })
    .from(Annotation)
    .innerJoin(
      TranscriptParagraph,
      eq(TranscriptParagraph.id, Annotation.paragraphId),
    )
    .where(
      and(
        eq(TranscriptParagraph.uploadRecordId, uploadRecordId),
        eq(Annotation.kind, 'BIBLE'),
      ),
    )
    .orderBy(asc(TranscriptParagraph.order), asc(Annotation.startWord));
  const passages = collectPassages(bibleRows);
  const sections = await loadOutlineSectionsForSummary(uploadRecordId);

  const userContent = buildUserContent({
    ...upload,
    sections,
    passages,
    paragraphs,
  });
  activityLogger.info(
    `Generating study guide from ${paragraphs.length} paragraphs, ${passages.length} passages with ${STUDY_GUIDE_MODEL}`,
  );

  const completion = await createChatCompletionTracked({
    tracking: { activity: 'generateStudyGuide', uploadRecordId },
    model: STUDY_GUIDE_MODEL,
    reasoning_effort: 'medium',
    fallbackModel: SUMMARY_FALLBACK_MODEL,
    response_format: { type: 'json_object' },
    // Reasoning tokens count against this cap; the guide itself is ~2K.
    max_completion_tokens: 16_000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });
  const raw = completion.choices[0]?.message.content;
  invariant(raw, 'Model returned no content');

  const content = buildContent(parseResponse(raw), paragraphs, passages);
  const now = new Date();
  // Under the annotation lock, so a rewrite (which deletes the guide in the
  // same lock) can't land between the check and the save.
  const saved = await db.transaction(async (tx) => {
    await lockUploadAnnotations(tx, uploadRecordId);
    if ((await sourceStamp(tx, uploadRecordId)) !== stamp) return false;
    await tx
      .insert(StudyGuide)
      .values({
        uploadRecordId,
        content,
        version: STUDY_GUIDE_VERSION,
        model: completion.model,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: StudyGuide.uploadRecordId,
        set: {
          content,
          version: STUDY_GUIDE_VERSION,
          model: completion.model,
          updatedAt: now,
        },
      });
    return true;
  });
  if (!saved) {
    // The next request generates from the new data.
    activityLogger.warn(
      'Transcript or annotations changed during generation; discarding guide',
    );
    return { generated: false };
  }

  activityLogger.info(
    `Saved study guide: ${content.outline.length} outline points, ${content.passages.length} passages, ${content.echoes.length} echoes, ${content.quotes.length} quotes`,
  );
  return { generated: true };
}
