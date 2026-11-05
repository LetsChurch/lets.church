# Study guides

The media page's Download menu offers **Study guide (PDF)** for any upload of
at least 10 minutes (`STUDY_GUIDE_MIN_SECONDS`; a shorter talk can't fill the
page) whose transcript pipeline has finished (it has a summary, which runs after the
outline and Scripture annotations and is skipped for empty transcripts). It
shows even where the channel has media downloads turned off: the guide
comes from the transcript, not the media files. It's a two-page US Letter
handout: the front follows along with the recording (big idea, key passage,
fill-in-the-blank outline with timestamps, notes), the back is for afterwards
(discussion questions, a family box, memory verse, key terms, an optional
timeline, quotes with QR codes to their moments, a prayer prompt, and the
passages it cites or echoes).

## How it's made

1. **Generated once, on first request.** `studyGuide.request`
   (`packages/web/src/trpc/procedures/study-guide.ts`) returns the guide if it
   exists, joins a running generation, or starts `generateStudyGuideWorkflow`
   (one workflow per upload, `generateStudyGuide:<uploadId>`). The client polls
   `studyGuide.status` and downloads when it's ready
   (`use-study-guide-download.ts`).
2. **One LLM call.** `generateStudyGuide`
   (`packages/temporal/src/activities/background/generate-study-guide.ts`) sends
   the transcript, the outline sections and the recording's cited passages to
   `SUMMARY_MODEL` (medium reasoning, not Flex, since a viewer is waiting), with
   the summary fallback model for content-filter refusals. It then resolves
   references against the versification, prints passages from the BSB
   (`util/scripture/verse-text.ts`), maps paragraphs to timestamps, drops quotes
   that aren't the speaker's words, and caps every list to what the page
   holds.
3. **Stored, then rendered per download.** The result is validated against
   `StudyGuideContentSchema` (`packages/temporal/src/util/study-guide.ts`) and
   stored in `study_guide`. `/media/$mediaId/study-guide.pdf` renders it with
   react-pdf on each request (`packages/web/src/study-guide/`), so layout
   changes apply without regenerating.

The passages list comes from the stored BIBLE annotations (see
[scripture-references.md](scripture-references.md)); the model only flags ones
that are wrong where they occur (a quote matched to the wrong book) and adds
uncited echoes, listed separately.

## Regenerating

Bump `STUDY_GUIDE_VERSION` when the prompt or content shape changes: older
guides are rebuilt the next time someone asks for them. A guide is also
deleted whenever what it was built from changes: a replaced transcript
(`storeTranscriptParagraphs`), re-annotation (`annotateTranscript`), or a
Scripture backfill that changes the upload's references
(`backfillScriptureRefsForUpload`). A corpus-wide backfill therefore discards
the guides it touches, and each costs a new LLM call on its next request. A
generation that overlaps one of these writes is discarded rather than saved
(it compares the summary timestamp and the annotations before and after,
under the annotation lock). Nothing regenerates in bulk.

## Abuse limits

Anyone who can view an upload can trigger its first generation, so starting
one is charged to the shared AI quota (`enforceAiRateLimit`, kind
`study-guide`, two credits like any chat completion; see docs/security.md §6),
then to a site-wide cap of 300 per day. Cached guides, running generations and
status polls cost nothing. Each PDF download renders the document, so
downloads have their own per-IP bucket (30, then one every 6 seconds).

## Rendering notes

- Fonts (Newsreader, Hanken Grotesk) are inlined into the server bundle as
  data URLs (`?inline` imports). Each has a Latin Extended fallback family for
  words like "dōrean".
- `@react-pdf/renderer` is a server external, and `pdfkit*` is fully traced in
  `vite.config.ts`: pdfkit loads its standard fonts through a dynamic package
  subpath that neither bundling nor file tracing follows. Check a production
  build (`NODE_ENV=production`, boot `.output/server/index.mjs`, fetch a PDF)
  after upgrading either.
- Overflow wraps onto another page rather than clipping; page numbers come
  from the renderer.
