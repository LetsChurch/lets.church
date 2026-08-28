import {
  Annotation,
  Channel,
  db,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import { z } from 'zod';

import {
  createChatCompletionTracked,
  SUMMARY_FALLBACK_MODEL,
  SUMMARY_MODEL,
} from '../../util/llm';
import { resolveCostUsd } from '../../util/llm-pricing';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/summarize-upload',
});

// Anti-trope guidance is deliberate. Without it, models default to their
// training-set summarizer template ("The conversation introduces…", "The
// speaker reflects on…") even when a real name is sitting in the metadata.
// Forbidding those openers + requiring named subjects when available pushes
// the model toward concrete prose anchored to the actual content.
const SYSTEM_PROMPT = `You summarize sermons, lectures, and talks for a Christian media platform.

Output: return ONLY a JSON object (no markdown code fences, no commentary) with this exact shape:

{
  "summary": "<150-250 words of well-organized prose for the Summary tab>",
  "searchSummary": "<100-200 words optimized for semantic search>",
  "sections": [ { "id": "<exact id from the Sections list below>", "description": "<2-3 sentences>" } ]
}

Voice and openers (apply to BOTH \`summary\` AND each section \`description\`):
- Do NOT use generic AI-summarizer phrasing. Forbidden openers: "The conversation/talk/sermon/video introduces…", "The speaker reflects on / discusses / explores…", "In this [talk/episode/video]…", "This [sermon/conversation] covers…", "In this section…". Open with a concrete claim, scripture, named subject, or specific topic from the content itself.
- Do NOT lead with a thematic preview or topic list — sentences whose function is to announce "the main themes are X, Y, and Z" or to "tie threads together" or to enumerate what the summary will cover. Skip that meta-sentence and start with the first concrete sentence the summary actually needs (e.g. the speaker doing something specific, the first claim made, the setting + named subject).
- Use names when they appear in the metadata or the transcript (speaker, host, guest, channel). Never use "the speaker" if a name is available. Use last names or full names as the source provides; do not invent or guess names. If no name is anywhere in the metadata or transcript, refer to the subject directly without inventing a generic descriptor.
- Third person, present tense where natural. No headings, bullets, or markdown.

Field guidance:
- summary: 150-250 words of well-organized prose for the Summary tab on the media page. Cover the main argument(s), key scripture, and takeaways.
- searchSummary: 100-200 words optimized for semantic search and topic-similarity discovery. Keyword- and entity-dense alternative phrasing: concepts, named people, places, scripture references (book + chapter + verse where stated), central claims. Never shown to users; prioritize concept coverage over prose quality.
- sections: ONE entry per section in the Sections list provided in the user message, in the same order. Each entry's \`id\` MUST match the bracketed id from that list verbatim. Each \`description\` is 2-3 sentences specific to what that section actually teaches — name the speaker's claims, scripture references, and concrete subjects. Apply the same voice/opener rules as summary. The section TITLES are fixed (already chosen), do not restate them; describe what's in that span of the transcript.
- If the Sections list is empty, return \`"sections": []\` and produce summary/searchSummary as usual.

Output the JSON object directly. Do NOT wrap it in \`\`\`json fences. Do NOT add any prose before or after.`;

const sectionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
});

const responseSchema = z.object({
  summary: z.string().min(1),
  searchSummary: z.string().min(1),
  sections: z.array(sectionSchema).default([]),
});

// One entry in the outline-aware summarize input: a section the
// annotate pass already identified, plus the paragraph range it
// covers (used to build the user-message prompt + to compute the
// frontend's timestamp range).
export type SummarySectionInput = {
  /** Annotation id — the model echoes it back so we know which description belongs where. */
  id: string;
  title: string;
  /** Inclusive 0-based paragraph order where the section starts. */
  firstParagraphOrder: number;
};

export type SummaryMetadata = {
  channelName: string;
  title: string | null;
  description: string | null;
};

export type SummaryStats = {
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  summaryLength: number;
  searchSummaryLength: number;
  sectionCount: number;
  // USD cost reported by OpenRouter when `usage: { include: true }` is
  // set on the request. Null when the upstream provider doesn't report
  // it (some Anthropic/Google routings, or future models that opt out).
  costUsd: number | null;
};

export type RunSummaryResult = {
  summary: string;
  searchSummary: string;
  sections: Array<{ id: string; description: string }>;
  stats: SummaryStats;
  // The exact messages we sent to the model. Returned so the admin
  // LLM-eval surface can show "copy prompt" for debugging.
  prompt: { system: string; user: string };
  // Raw post-fence-strip model output (the JSON the model returned),
  // so the eval surface can offer a "copy output" affordance for
  // debugging. Optional because non-eval call sites (the production
  // activity) don't need it.
  responseText?: string;
};

/**
 * Pure LLM-call + parse layer for summarization. Sends paragraphs +
 * metadata to the chosen model and returns the two summaries plus run
 * stats. Used by both `summarizeUpload` (which persists) and the admin
 * LLM-eval mutation (which doesn't).
 *
 * Uses `response_format: json_object` + manual zod parse. The eval
 * surface routes to arbitrary OpenRouter models so we can't rely on any
 * one provider's strict-schema mode (the wider matrix's support varies
 * model-by-model), and a plain json_object request works everywhere
 * we'd plausibly route. The zod schema below enforces the contract.
 */
// Default output cap for summary. Summary output is bounded (≈1K tokens
// for the two fields), so 4K is plenty across providers — including tight
// ones (DeepSeek v3.x).
export const DEFAULT_SUMMARY_MAX_TOKENS = 4096;

// Build the user-message content for a summary request.
//
// `sections` (optional): pre-identified outline from the annotate
// pass. When provided, the model is asked to also produce a 2-3
// sentence description per section, returned in the `sections`
// array keyed by section id. When empty, the prompt just yields
// `summary`/`searchSummary` and `sections: []`.
function buildSummaryUserContent(
  paragraphTexts: string[],
  metadata: SummaryMetadata,
  sections: ReadonlyArray<SummarySectionInput> = [],
): string {
  const numbered = paragraphTexts.map((t, i) => `[P${i}] ${t}`).join('\n\n');
  const metadataLines = [
    `Channel: ${metadata.channelName}`,
    metadata.title ? `Title: ${metadata.title}` : null,
    metadata.description ? `Description: ${metadata.description}` : null,
  ].filter((l): l is string => l !== null);
  const sectionLines =
    sections.length > 0
      ? [
          '',
          'Sections (already identified by an outline pass — echo each `id` verbatim in the `sections` output, one description per section, in order):',
          ...sections.map(
            (s) =>
              `[${s.id}] starts at paragraph P${s.firstParagraphOrder}: ${s.title}`,
          ),
        ].join('\n')
      : '';
  return `${metadataLines.join('\n')}${sectionLines}\n\nTranscript:\n\n${numbered}`;
}

// Parse a model-emitted summary response: defensive fence-strip, then JSON +
// zod. Returns the raw stripped JSON alongside the parsed values so callers can
// stash `responseText` for the LLM-eval surface.
//
// `expectedSectionIds` is always required — it's the set of OUTLINE
// annotation IDs the user message advertised to the model. Sections
// whose id isn't in the set are dropped (model hallucinated an extra
// section), and when the set is empty (annotate never ran for this
// upload) ALL sections are dropped — the UI joins sections to OUTLINE
// annotations by id, so unjoinable sections only inflate storage.
function parseSummaryResponse(
  raw: string,
  expectedSectionIds: ReadonlySet<string>,
): {
  summary: string;
  searchSummary: string;
  sections: Array<{ id: string; description: string }>;
  responseText: string;
} {
  // Strip ```json fences some providers add despite json_object mode.
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const parsed = responseSchema.parse(JSON.parse(stripped));
  const sections = parsed.sections.filter((s) => expectedSectionIds.has(s.id));
  return {
    summary: parsed.summary,
    searchSummary: parsed.searchSummary,
    sections,
    responseText: stripped,
  };
}

// Load OUTLINE annotations for one upload (in paragraph order) and
// reshape into the `SummarySectionInput` form the summarize prompt
// expects. Used by both `summarizeUpload` (live) and the batch
// submit activity. Returns an empty array when annotate hasn't run
// yet — summarize then falls back to the no-sections prompt shape.
export async function loadOutlineSectionsForSummary(
  uploadRecordId: string,
): Promise<SummarySectionInput[]> {
  const rows = await db
    .select({
      id: Annotation.id,
      metadata: Annotation.metadata,
      paragraphOrder: TranscriptParagraph.order,
    })
    .from(Annotation)
    .innerJoin(
      TranscriptParagraph,
      eq(TranscriptParagraph.id, Annotation.paragraphId),
    )
    .where(
      and(
        eq(TranscriptParagraph.uploadRecordId, uploadRecordId),
        eq(Annotation.kind, 'OUTLINE'),
        isNotNull(TranscriptParagraph.order),
      ),
    )
    .orderBy(asc(TranscriptParagraph.order));
  const sections: SummarySectionInput[] = [];
  for (const row of rows) {
    const title =
      typeof row.metadata.title === 'string' ? row.metadata.title : null;
    if (!title) continue;
    sections.push({
      id: row.id,
      title,
      firstParagraphOrder: row.paragraphOrder,
    });
  }
  return sections;
}

export async function runSummary(
  paragraphTexts: string[],
  metadata: SummaryMetadata,
  model: string,
  options: {
    maxTokens?: number;
    /** Outline-aware sections (from annotate). Empty / omitted → no sections. */
    sections?: ReadonlyArray<SummarySectionInput>;
    /**
     * When set, the chat-completion call is logged to `llm_call`. Omit
     * from one-off scripts / unit tests where audit noise is undesirable.
     */
    tracking?: {
      activity: string;
      uploadRecordId?: string | null;
    };
    /**
     * Provider routing. The admin LLM-eval page passes `'openrouter'`.
     * Defaults to direct OpenAI.
     */
    via?: 'openai' | 'openrouter';
    /**
     * Opt into OpenAI Flex. Restricted by the shared client to the tracked
     * `summarizeUpload` background activity.
     */
    serviceTier?: 'flex';
  } = {},
): Promise<RunSummaryResult> {
  invariant(paragraphTexts.length > 0, 'runSummary: no paragraphs provided');
  const maxTokens = options.maxTokens ?? DEFAULT_SUMMARY_MAX_TOKENS;
  const sections = options.sections ?? [];

  const userContent = buildSummaryUserContent(
    paragraphTexts,
    metadata,
    sections,
  );
  const expectedSectionIds = new Set(sections.map((s) => s.id));

  // Summary output is bounded (250 + 200 words for the two fields ≈ 1K
  // tokens with JSON overhead; section descriptions add ~50 tokens
  // each — even 10 sections fit comfortably under 4K). The explicit
  // cap prevents the same silent-truncation surprise we hit on
  // annotate when the provider default is small.
  // Wrapper handles timing, audit-log insertion, and all built-in
  // guards (finish_reason length/content_filter, empty content,
  // create() throw). No activity-specific guards needed here — the
  // zod parse below catches malformed JSON.
  //
  // Keep the body inline to satisfy the typed
  // `createChatCompletionTracked` signature.
  const t0 = Date.now();
  const completion = await createChatCompletionTracked({
    tracking: options.tracking,
    via: options.via ?? 'openai',
    model,
    ...(options.serviceTier ? { service_tier: options.serviceTier } : {}),
    // Same content_filter fallback hook as annotate. Most summarize prompts
    // are short transcript echoes (much smaller than annotate), but the
    // model still occasionally trips OpenAI's classifier on politically/
    // theologically frank source material.
    fallbackModel: SUMMARY_FALLBACK_MODEL,
    response_format: { type: 'json_object' },
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });
  const durationMs = Date.now() - t0;
  const choice = completion.choices[0];

  const raw = choice?.message.content;
  invariant(raw, 'Model returned no content');
  const {
    summary,
    searchSummary,
    sections: parsedSections,
    responseText,
  } = parseSummaryResponse(raw, expectedSectionIds);

  return {
    summary,
    searchSummary,
    sections: parsedSections,
    stats: {
      durationMs,
      promptTokens: completion.usage?.prompt_tokens ?? null,
      completionTokens: completion.usage?.completion_tokens ?? null,
      summaryLength: summary.length,
      searchSummaryLength: searchSummary.length,
      sectionCount: parsedSections.length,
      // See annotate-transcript.ts for the rationale on resolveCostUsd
      // (provider-reported cost when present and non-zero, else table).
      costUsd: resolveCostUsd(
        model,
        completion.usage?.prompt_tokens ?? null,
        completion.usage?.completion_tokens ?? null,
        (completion.usage as unknown as { cost?: number } | undefined)?.cost ??
          null,
        completion.service_tier === 'flex' ? 0.5 : 1,
      ),
    },
    prompt: { system: SYSTEM_PROMPT, user: userContent },
    responseText,
  };
}

/**
 * Generate both a display summary and a search-optimized summary in a single
 * OpenRouter chat completion, then persist them to upload_record along with
 * `summarized_at`. The two summaries cover different downstream uses —
 * display in the Summary tab vs embedding for similarity / RRF — and
 * producing them in one call avoids a second LLM round-trip.
 *
 * `force: false` (the default, used by the first-pass transcribe path)
 * short-circuits when a summary is already present so parent-workflow
 * retries don't re-bill tokens for work the previous attempt completed.
 * `regenerateUploadSummary` passes `force: true` to override that.
 */
export default async function summarizeUpload(
  uploadRecordId: string,
  options: { force?: boolean } = {},
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'summarizeUpload',
    context: { args: { uploadRecordId } },
  });

  // Metadata gives the model a concrete anchor for openers + name resolution.
  // Pull `sections` here so the idempotency check below can compare what's
  // stored against the current outline set without a second round-trip.
  const upload = await db
    .select({
      title: UploadRecord.title,
      description: UploadRecord.description,
      channelName: Channel.name,
      summary: UploadRecord.summary,
      searchSummary: UploadRecord.searchSummary,
      sections: UploadRecord.sections,
    })
    .from(UploadRecord)
    .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
    .where(eq(UploadRecord.id, uploadRecordId))
    .then((r) => r[0]);

  invariant(upload, `Upload record ${uploadRecordId} not found`);

  // Outline annotations from the annotate pass are the source of truth
  // for section breaks. Loaded BEFORE the idempotency check so we can
  // detect the stale-sections case: summarize ran first (no outlines
  // available, sections=[]), annotate later succeeded on retry, but
  // the existing summary would otherwise short-circuit forever, leaving
  // `sections` empty even though OUTLINE annotations now exist.
  const sectionInputs = await loadOutlineSectionsForSummary(uploadRecordId);

  if (!options.force && upload.summary && upload.searchSummary) {
    // Skip when persisted section ids exactly match the current outline
    // set — same set both ways means a re-run wouldn't add information.
    // Mismatch (typically `outlines > 0 && sections === 0` after a
    // graceful-degradation summarize/late-annotate sequence, but also
    // covers same-count-different-ids cases: annotate dropped a
    // heading and added a new one) re-runs so descriptions land for
    // the now-available headings.
    const storedIds = new Set(upload.sections.map((s) => s.id));
    const currentIds = new Set(sectionInputs.map((s) => s.id));
    const idsMatch =
      storedIds.size === currentIds.size &&
      [...currentIds].every((id) => storedIds.has(id));
    if (idsMatch) {
      activityLogger.info(
        `Skipping summarize — summary already present (force=false): display=${upload.summary.length}ch, search=${upload.searchSummary.length}ch, sections=${upload.sections.length}`,
      );
      return {
        summaryLength: upload.summary.length,
        searchSummaryLength: upload.searchSummary.length,
      };
    }
    const missing = [...currentIds].filter((id) => !storedIds.has(id)).length;
    const orphaned = [...storedIds].filter((id) => !currentIds.has(id)).length;
    activityLogger.info(
      `Re-summarizing despite existing summary — outline ids changed (current=${currentIds.size}, stored=${storedIds.size}, missing-from-stored=${missing}, orphaned-in-stored=${orphaned})`,
    );
  }

  const paragraphs = await db
    .select({ text: TranscriptParagraph.text })
    .from(TranscriptParagraph)
    .where(eq(TranscriptParagraph.uploadRecordId, uploadRecordId))
    .orderBy(asc(TranscriptParagraph.order));

  if (paragraphs.length === 0) {
    // No transcript paragraphs — e.g. a live stream / upload with no audio,
    // or one whose audio produced an empty transcript. There is nothing to
    // summarize, so skip gracefully rather than throwing: a hard failure here
    // cascades up and fails the whole post-transcribe workflow.
    activityLogger.info(
      `No transcript paragraphs for ${uploadRecordId} — skipping summarize (no audio / empty transcript)`,
    );
    return { summaryLength: 0, searchSummaryLength: 0 };
  }
  activityLogger.info(
    `Summarizing ${paragraphs.length} paragraphs with ${SUMMARY_MODEL} (${sectionInputs.length} outline sections)`,
  );
  const { summary, searchSummary, sections, stats } = await runSummary(
    paragraphs.map((p) => p.text),
    upload,
    SUMMARY_MODEL,
    {
      sections: sectionInputs,
      tracking: { activity: 'summarizeUpload', uploadRecordId },
      serviceTier: 'flex',
    },
  );

  await db
    .update(UploadRecord)
    .set({
      summary,
      searchSummary,
      sections,
      summarizedAt: new Date(),
    })
    .where(eq(UploadRecord.id, uploadRecordId));

  activityLogger.info(
    `Saved summaries: display=${stats.summaryLength}ch, search=${stats.searchSummaryLength}ch, sections=${stats.sectionCount}`,
  );
  return {
    summaryLength: stats.summaryLength,
    searchSummaryLength: stats.searchSummaryLength,
  };
}
