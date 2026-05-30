import { Channel, db, TranscriptParagraph, UploadRecord } from '@letschurch/db';
import { asc, eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import { z } from 'zod';
import {
  createChatCompletionTracked,
  openrouterExtras,
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
  "searchSummary": "<100-200 words optimized for semantic search>"
}

Voice and openers:
- Do NOT use generic AI-summarizer phrasing. Forbidden openers: "The conversation/talk/sermon/video introduces…", "The speaker reflects on / discusses / explores…", "In this [talk/episode/video]…", "This [sermon/conversation] covers…". Open with a concrete claim, scripture, named subject, or specific topic from the content itself.
- Do NOT lead with a thematic preview or topic list — sentences whose function is to announce "the main themes are X, Y, and Z" or to "tie threads together" or to enumerate what the summary will cover. Skip that meta-sentence and start with the first concrete sentence the summary actually needs (e.g. the speaker doing something specific, the first claim made, the setting + named subject).
- Use names when they appear in the metadata or the transcript (speaker, host, guest, channel). Never use "the speaker" if a name is available. Use last names or full names as the source provides; do not invent or guess names. If no name is anywhere in the metadata or transcript, refer to the subject directly without inventing a generic descriptor.
- Third person, present tense where natural. No headings, bullets, or markdown.

Field guidance:
- summary: 150-250 words of well-organized prose for the Summary tab on the media page. Cover the main argument(s), key scripture, and takeaways.
- searchSummary: 100-200 words optimized for semantic search and topic-similarity discovery. Keyword- and entity-dense alternative phrasing: concepts, named people, places, scripture references (book + chapter + verse where stated), central claims. Never shown to users; prioritize concept coverage over prose quality.

Output the JSON object directly. Do NOT wrap it in \`\`\`json fences. Do NOT add any prose before or after.`;

const responseSchema = z.object({
  summary: z.string().min(1),
  searchSummary: z.string().min(1),
});

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
  // USD cost reported by OpenRouter when `usage: { include: true }` is
  // set on the request. Null when the upstream provider doesn't report
  // it (some Anthropic/Google routings, or future models that opt out).
  costUsd: number | null;
};

export type RunSummaryResult = {
  summary: string;
  searchSummary: string;
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

export async function runSummary(
  paragraphTexts: string[],
  metadata: SummaryMetadata,
  model: string,
  options: {
    maxTokens?: number;
    /**
     * When set, the chat-completion call is logged to `llm_call`. Omit
     * from one-off scripts / unit tests where audit noise is undesirable.
     */
    tracking?: {
      activity: string;
      uploadRecordId?: string | null;
    };
  } = {},
): Promise<RunSummaryResult> {
  invariant(paragraphTexts.length > 0, 'runSummary: no paragraphs provided');
  const maxTokens = options.maxTokens ?? DEFAULT_SUMMARY_MAX_TOKENS;

  const transcript = paragraphTexts.join('\n\n');
  const metadataLines = [
    `Channel: ${metadata.channelName}`,
    metadata.title ? `Title: ${metadata.title}` : null,
    metadata.description ? `Description: ${metadata.description}` : null,
  ].filter((l): l is string => l !== null);
  const userContent = `${metadataLines.join('\n')}\n\nTranscript:\n\n${transcript}`;

  // Summary output is bounded (250 + 200 words for the two fields ≈ 1K
  // tokens with JSON overhead); 4K leaves plenty of headroom across
  // providers. The explicit cap prevents the same silent-truncation
  // surprise we hit on annotate when the provider default is small.
  // `openrouterExtras` adds OpenRouter-specific routing + cost hints.
  // Wrapper handles timing, audit-log insertion, and all built-in
  // guards (finish_reason length/content_filter, empty content,
  // create() throw). No activity-specific guards needed here — the
  // zod parse below catches malformed JSON.
  const t0 = Date.now();
  const completion = await createChatCompletionTracked({
    tracking: options.tracking,
    model,
    response_format: { type: 'json_object' },
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    ...(openrouterExtras as Record<string, unknown>),
  });
  const durationMs = Date.now() - t0;
  const choice = completion.choices[0];

  const raw = choice?.message.content;
  invariant(raw, 'Model returned no content');
  // Strip ```json fences some providers add despite json_object mode.
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const parsed = responseSchema.parse(JSON.parse(stripped));

  return {
    summary: parsed.summary,
    searchSummary: parsed.searchSummary,
    stats: {
      durationMs,
      promptTokens: completion.usage?.prompt_tokens ?? null,
      completionTokens: completion.usage?.completion_tokens ?? null,
      summaryLength: parsed.summary.length,
      searchSummaryLength: parsed.searchSummary.length,
      // See annotate-transcript.ts for the rationale on resolveCostUsd
      // (provider-reported cost when present and non-zero, else table).
      costUsd: resolveCostUsd(
        model,
        completion.usage?.prompt_tokens ?? null,
        completion.usage?.completion_tokens ?? null,
        (completion.usage as unknown as { cost?: number } | undefined)?.cost ??
          null,
      ),
    },
    prompt: { system: SYSTEM_PROMPT, user: userContent },
    responseText: stripped,
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
  // The existing summary fields are pulled in the same query so the
  // idempotency check below doesn't need a second round-trip.
  const upload = await db
    .select({
      title: UploadRecord.title,
      description: UploadRecord.description,
      channelName: Channel.name,
      summary: UploadRecord.summary,
      searchSummary: UploadRecord.searchSummary,
    })
    .from(UploadRecord)
    .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
    .where(eq(UploadRecord.id, uploadRecordId))
    .then((r) => r[0]);

  invariant(upload, `Upload record ${uploadRecordId} not found`);

  if (!options.force && upload.summary && upload.searchSummary) {
    activityLogger.info(
      `Skipping summarize — summary already present (force=false): display=${upload.summary.length}ch, search=${upload.searchSummary.length}ch`,
    );
    return {
      summaryLength: upload.summary.length,
      searchSummaryLength: upload.searchSummary.length,
    };
  }

  const paragraphs = await db
    .select({ text: TranscriptParagraph.text })
    .from(TranscriptParagraph)
    .where(eq(TranscriptParagraph.uploadRecordId, uploadRecordId))
    .orderBy(asc(TranscriptParagraph.order));

  invariant(
    paragraphs.length > 0,
    `No transcript paragraphs for ${uploadRecordId} — cannot summarize`,
  );

  activityLogger.info(
    `Summarizing ${paragraphs.length} paragraphs with ${SUMMARY_MODEL}`,
  );
  const { summary, searchSummary, stats } = await runSummary(
    paragraphs.map((p) => p.text),
    upload,
    SUMMARY_MODEL,
    {
      tracking: { activity: 'summarizeUpload', uploadRecordId },
    },
  );

  await db
    .update(UploadRecord)
    .set({
      summary,
      searchSummary,
      summarizedAt: new Date(),
    })
    .where(eq(UploadRecord.id, uploadRecordId));

  activityLogger.info(
    `Saved summaries: display=${stats.summaryLength}ch, search=${stats.searchSummaryLength}ch`,
  );
  return {
    summaryLength: stats.summaryLength,
    searchSummaryLength: stats.searchSummaryLength,
  };
}
