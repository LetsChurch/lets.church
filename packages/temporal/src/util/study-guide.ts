// The stored shape of a printable study guide (study_guide.content). Written
// by the generateStudyGuide activity, read by the web app's PDF route. Keep it
// free of runtime dependencies beyond zod: the web SSR bundle imports it.

import { z } from 'zod';

/**
 * Bump when the content shape or the prompt changes enough that stored guides
 * should be regenerated; a guide below this version is rebuilt on its next
 * request.
 */
export const STUDY_GUIDE_VERSION = 1;

/**
 * The shortest upload offered a guide. A shorter talk can't fill the outline,
 * questions and quotes, so the model would pad them out.
 */
export const STUDY_GUIDE_MIN_SECONDS = 10 * 60;

export const StudyGuideRefSchema = z.object({
  book: z.string(),
  chapter: z.number().int().positive().optional(),
  verse: z.number().int().positive().optional(),
  endChapter: z.number().int().positive().optional(),
  endVerse: z.number().int().positive().optional(),
});
export type StudyGuideRef = z.infer<typeof StudyGuideRefSchema>;

export const StudyGuidePassageSchema = z.object({
  ref: StudyGuideRefSchema,
  translation: z.string(),
  verses: z.array(
    z.object({
      chapter: z.number().int(),
      verse: z.number().int(),
      text: z.string(),
    }),
  ),
});
export type StudyGuidePassage = z.infer<typeof StudyGuidePassageSchema>;

export const StudyGuideContentSchema = z.object({
  /** The recording's title without prefixes like "SERMON:". */
  title: z.string(),
  /** e.g. "Part 1 of the series", only when the metadata says so. */
  seriesLabel: z.string().nullable(),
  bigIdea: z.string(),
  /** A short lead-in: the question or tension the recording opens with. */
  opening: z.string().nullable(),
  keyPassage: StudyGuidePassageSchema.nullable(),
  outline: z.array(
    z.object({
      /** "Intro", "I.", "II.", …, "Apply". */
      marker: z.string(),
      /** Text before the blank, the blank's answer (null: no blank), and after. */
      before: z.string(),
      answer: z.string().nullable(),
      after: z.string(),
      startSec: z.number().nullable(),
    }),
  ),
  questions: z.object({
    observe: z.array(z.string()),
    interpret: z.array(z.string()),
    apply: z.array(z.string()),
  }),
  family: z
    .object({ intro: z.string(), prompts: z.array(z.string()) })
    .nullable(),
  memoryVerse: StudyGuidePassageSchema.nullable(),
  keyTerms: z.array(z.object({ term: z.string(), definition: z.string() })),
  /** Only for recordings with a real history thread. */
  timeline: z
    .object({
      heading: z.string(),
      items: z.array(z.object({ label: z.string(), text: z.string() })),
    })
    .nullable(),
  quotes: z.array(z.object({ text: z.string(), startSec: z.number() })),
  prayer: z.string(),
  /** References the recording makes, from its BIBLE annotations. */
  passages: z.array(StudyGuideRefSchema),
  /** Passages the recording echoes without citing, suggested by the generator. */
  echoes: z.array(StudyGuideRefSchema),
});
export type StudyGuideContent = z.infer<typeof StudyGuideContentSchema>;
