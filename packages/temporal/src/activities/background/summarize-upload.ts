import { Channel, db, TranscriptParagraph, UploadRecord } from '@letschurch/db';
import { asc, eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { llm, SUMMARY_MODEL } from '../../util/llm';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/summarize-upload',
});

// JSON shape is enforced by Structured Outputs (zodResponseFormat below) — the
// prompt only specifies *content*, not format. Field-level guidance still
// matters because the schema can't express word counts, voice, openers, or
// "no markdown".
//
// Anti-trope guidance is deliberate. Without it, models default to their
// training-set summarizer template ("The conversation introduces…", "The
// speaker reflects on…") even when a real name is sitting in the metadata.
// Forbidding those openers + requiring named subjects when available pushes
// the model toward concrete prose anchored to the actual content.
const SYSTEM_PROMPT = `You summarize sermons, lectures, and talks for a Christian media platform.

Voice and openers:
- Do NOT use generic AI-summarizer phrasing. Forbidden openers: "The conversation/talk/sermon/video introduces…", "The speaker reflects on / discusses / explores…", "In this [talk/episode/video]…", "This [sermon/conversation] covers…". Open with a concrete claim, scripture, named subject, or specific topic from the content itself.
- Do NOT lead with a thematic preview or topic list — sentences whose function is to announce "the main themes are X, Y, and Z" or to "tie threads together" or to enumerate what the summary will cover. Skip that meta-sentence and start with the first concrete sentence the summary actually needs (e.g. the speaker doing something specific, the first claim made, the setting + named subject).
- Use names when they appear in the metadata or the transcript (speaker, host, guest, channel). Never use "the speaker" if a name is available. Use last names or full names as the source provides; do not invent or guess names. If no name is anywhere in the metadata or transcript, refer to the subject directly without inventing a generic descriptor.
- Third person, present tense where natural. No headings, bullets, or markdown.

Two output fields:
- summary: 150-250 words of well-organized prose for the Summary tab on the media page. Cover the main argument(s), key scripture, and takeaways.
- searchSummary: 100-200 words optimized for semantic search and topic-similarity discovery. Keyword- and entity-dense alternative phrasing: concepts, named people, places, scripture references (book + chapter + verse where stated), central claims. Never shown to users; prioritize concept coverage over prose quality.`;

// Strict Structured Outputs — the OpenAI SDK turns this zod schema into a
// JSON schema, instructs the model to emit conforming JSON, validates the
// response, and types `message.parsed` accordingly. No manual JSON.parse, no
// post-hoc zod.parse, no "the model returned markdown fences" defensive code.
const responseSchema = z.object({
  summary: z.string().min(1),
  searchSummary: z.string().min(1),
});

/**
 * Generate both a display summary and a search-optimized summary in a single
 * OpenRouter chat completion (JSON-mode), then persist them to upload_record
 * along with `summarized_at`. The two summaries cover different downstream
 * uses — display in the Summary tab vs embedding for similarity / RRF —
 * and producing them in one call avoids a second LLM round-trip.
 */
export default async function summarizeUpload(uploadRecordId: string) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'summarizeUpload',
    context: { args: { uploadRecordId } },
  });

  // Metadata gives the model a concrete anchor for openers + name resolution.
  // Without it, the model has no choice but to fall back to "the speaker" /
  // "the conversation". With it, it can lead with the actual title topic or
  // the channel/speaker name when those are present.
  const upload = await db
    .select({
      title: UploadRecord.title,
      description: UploadRecord.description,
      channelName: Channel.name,
    })
    .from(UploadRecord)
    .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
    .where(eq(UploadRecord.id, uploadRecordId))
    .then((r) => r[0]);

  invariant(upload, `Upload record ${uploadRecordId} not found`);

  const paragraphs = await db
    .select({ text: TranscriptParagraph.text })
    .from(TranscriptParagraph)
    .where(eq(TranscriptParagraph.uploadRecordId, uploadRecordId))
    .orderBy(asc(TranscriptParagraph.order));

  invariant(
    paragraphs.length > 0,
    `No transcript paragraphs for ${uploadRecordId} — cannot summarize`,
  );

  const transcript = paragraphs.map((p) => p.text).join('\n\n');

  // Plain labelled sections in the user message keep metadata visually
  // distinct from transcript without needing XML escaping. Empty fields are
  // omitted so the model doesn't see "Title: null".
  const metadataLines = [
    `Channel: ${upload.channelName}`,
    upload.title ? `Title: ${upload.title}` : null,
    upload.description ? `Description: ${upload.description}` : null,
  ].filter((l): l is string => l !== null);

  const userContent = `${metadataLines.join('\n')}\n\nTranscript:\n\n${transcript}`;

  activityLogger.info(
    `Summarizing ${paragraphs.length} paragraphs (${transcript.length} chars) with ${SUMMARY_MODEL}`,
  );

  const completion = await llm.chat.completions.parse({
    model: SUMMARY_MODEL,
    response_format: zodResponseFormat(responseSchema, 'summaries'),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  const parsed = completion.choices[0]?.message.parsed;
  invariant(parsed, 'Model returned no parsed content');

  await db
    .update(UploadRecord)
    .set({
      summary: parsed.summary,
      searchSummary: parsed.searchSummary,
      summarizedAt: new Date(),
    })
    .where(eq(UploadRecord.id, uploadRecordId));

  activityLogger.info(
    `Saved summaries: display=${parsed.summary.length}ch, search=${parsed.searchSummary.length}ch`,
  );
  return {
    summaryLength: parsed.summary.length,
    searchSummaryLength: parsed.searchSummary.length,
  };
}
