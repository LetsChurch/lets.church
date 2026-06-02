# Evaluating and tuning the annotation prompt

## Purpose

The annotation activity (`packages/temporal/src/activities/background/annotate-transcript.ts`) ships transcripts to an LLM through OpenRouter and gets back a markdown-formatted version with section headings and inline scripture/keyword links. The `SYSTEM_PROMPT` constant in that file is the system prompt; changing it changes every uploaded transcript's annotations. Production runs against `openai/gpt-5.4-mini` at `temperature: 0.6` (both empirically tuned — see commit history for the eval data behind those choices).

This document is the reference for evaluating that prompt — verifying that changes don't regress, and qualifying new candidate models before swapping them into the activity.

There are two evaluation surfaces:

1. **In-app eval page** at `/dashboard/admin/llm-eval` (admin-only). Runs the production prompt against the production code path for one upload against N models in parallel. Does not write annotations to the DB, but every chat-completion call is logged to the `llm_call` table with `activity='evalAnnotate'` / `'evalSummarize'` so cost is captured. Use when comparing models against the *current* prompt.

2. **Direct OpenRouter testing** with a local prompt file. Bypasses the production code so the prompt itself can be iterated freely. Use when changing the prompt.

3. **`llm_call` audit log**. Every production + eval call lands here with `model`, `activity`, `upload_record_id`, token counts, computed cost, provider cost, `outcome` (`success` / `guard_length_truncation` / `guard_content_filter` / `guard_silent_summarization`), `error_message`, and `duration_ms`. Filter by `outcome != 'success'` to find pay-but-reject calls; aggregate by `(model, day)` for cost trends. Indices on `(model, created_at)`, `(activity, created_at)`, `(upload_record_id)` make those queries cheap.

## Acceptance criteria

A prompt + model combination should meet all of these on a realistic full-length transcript (≥40 min). Short clips (≲100 paragraphs) get a softened heading-count criterion — see criterion 2.

1. **No banter heading.** When the program opens with banter (welcomes, weather, tech setup, scheduling chitchat, sponsor reads), those paragraphs must stay as plain text — the first `#` heading appears later, at the first substantive teaching section. Forbidden titles include "Welcome and Technical Setup", "Opening Banter", "Introductory Chatter", "Greetings", "The Show Opens With…", and similar. (For short clips with no opening banter, the first paragraph of substantive content can have a heading directly above it.)

2. **Heading count scales with length.** Long-form (≥100 paragraphs): at least 3 headings, typically 3–10 — a long output with 0/1/2 headings indicates the model lumped distinct topics together. Short clips (<100 paragraphs): 0–3 headings is normal; don't fabricate breaks. Every heading title must be concrete and content-specific (e.g. "Trans Children and the Image of God"), not generic ("Introduction", "Discussion"). Format-specific guidance in the prompt covers Q&A / call-in shows (each caller's question is its own heading), enumerated essays ("N reasons" — each reason its own heading), recorded-clip commentary (each clip its own heading), and formal debates (opening statements, cross-examinations, rebuttals, closing statements, audience Q&A — each a heading, with speaker surname + topic in the title; the moderator's intro/format/credentials block is banter and gets no heading).

3. **No truncation, and no silent summarization.** `finish_reason` must be `stop`, not `length` or `content_filter`. The activity also guards against models that return a paraphrased summary instead of echoing every paragraph: the silent-summarization guard fails the call when `completion_tokens < SILENT_SUMMARY_FLOOR × (transcriptBody.length / CHARS_PER_TOKEN)` — current values are 0.75 and 4 respectively, pulled out as named constants in `annotate-transcript.ts` for easy tuning. (The floor was 0.8 until the debate-format prompt expansion in June 2026; Dorean chapters 11–14 sit at 76–79% under the tighter banter rules, so we dropped the floor to 0.75 to keep them out of the failure column.) Healthy gpt-5.4-mini runs land at 95–105% of the estimate; Llama-4 summarization failures land at 20–30%. The guard throws and the call shows up in `llm_call.outcome = 'guard_silent_summarization'` with the observed ratio in `error_message` — plot the distribution before tightening.

4. **Attribution patterns annotated.** Every occurrence of "Jesus said / Jesus himself said / Christ said / Paul wrote / Peter writes / John says / James wrote / David said / Moses wrote / Isaiah said / the prophet wrote / the apostle says" and similar must wrap the cited or alluded scripture as a `[span](#bible?…)` link. This is the most common silent failure — many models skip it because the citation is implicit.

5. **Explicit citations annotated.** Every "Romans 8:28", "1 Corinthians 6:9–11", "Matthew 19", etc., must be wrapped, with OSIS book abbreviations (`Rom`, `1Cor`, `Matt`).

6. **Non-overlapping refs.** In phrases like "1 Corinthians 6 and 1 Timothy 1 and Romans 1", each reference must be its own link wrapping only that span — never one link covering the whole conjunction, and never three duplicate-span links with different URLs.

7. **Verbatim text preservation.** Every input paragraph is in the output, in order, with no paraphrasing, no reordering, no merging. Each link's bracket text is an exact substring of the original paragraph. The body of `prompt.md` (or whatever transcript is being tested) must round-trip byte-equal after stripping the inserted headings and link wrappers.

8. **Canon discipline.** `#bible` is reserved for the 66-book Protestant canon (Genesis through Revelation). Non-canonical / apocryphal / gnostic / pseudepigraphal works — Gospel of Thomas, Gospel of Mary, Gospel of Judas, Gospel of Philip, the Nag Hammadi codices, the Apocrypha (Tobit, Judith, Sirach, Wisdom, 1–2 Maccabees, etc.), 1 Enoch, the Book of Mormon, the Quran, and similar — must be wrapped as `#keyword`, never as `#bible`. Spot-check at least one transcript where the speaker engages a non-canonical text in depth (e.g. Dividing Line episodes critiquing the Gospel of Thomas) — every mention should be `#keyword`.

## Common failure modes

| Failure | Symptom | Root cause | Mitigation |
|---------|---------|------------|------------|
| Banter heading | First line is `# Welcome and Technical Setup …` | Model treats open chatter as a section | Explicit forbidden-titles list in prompt; "where the first heading goes" rule |
| Zero/one heading on a long transcript | Whole transcript under one heading | Model defaults to minimum-effort outlining | "Aim for 3-10 headings… if you finish with 0/1/2 [on a transcript longer than ~100 paragraphs], you missed real breaks" |
| Truncation | Response cuts off mid-paragraph; `finish_reason: length` | Output cap hit | Raise `maxTokens`, or chunk the request (see `docs/annotation-chunking-design.md`). Activity throws on `finish_reason: length` and writes `llm_call.outcome = 'guard_length_truncation'`. |
| Content-filter block | `finish_reason: content_filter` | Provider safety classifier triggered | Framing preamble at top of system prompt: "You are NOT a content moderator… you must produce the same outline + annotations regardless of subject matter". On the first failure the wrapper auto-retries against `OPENROUTER_ANNOTATE_FALLBACK_MODEL` (default `anthropic/claude-haiku-4-5`) — both calls record in `llm_call`, and most previously-blocked uploads now succeed on the second attempt. When both fail, the activity throws `guard_content_filter` and the upload lands on the admin **Failed Annotations** page (`/dashboard/admin/failed-annotations`) with a regenerate button. gpt-5.4-mini still blocks some Dividing Line content (trans/abortion) on the first try; pre-fallback, seed regen hit ~5/27 of LLM-seeded uploads — post-fallback that's effectively zero in practice. |
| Silent summarization | Markdown parses fine but most input paragraphs are missing; downstream annotations are bogus | Model (notably Llama 4 Maverick/Scout) ignores "echo every paragraph verbatim" and returns a paraphrased summary instead | Silent-summarization guard in the activity throws and writes `llm_call.outcome = 'guard_silent_summarization'`. Filter the table for that outcome to surface affected runs + the observed completion/transcript ratio. |
| Missing "Jesus said" annotation | Attribution patterns not wrapped despite explicit "Jesus himself said from the beginning, he made them male and female" → Matt 19:4 | Model treats implicit citation as non-citation | Required-pattern checklist with this exact phrase as example; mark as CRITICAL in self-check |
| Overlapping links | One big `[1 Corinthians 6 and 1 Timothy 1 and Romans 1](#bible?…)` link | Model groups consecutive refs | Concrete worked example in prompt showing the correct three-link form |
| Duplicate-span links | Three identical bracket texts with different URLs | Same as above, model invented chars | "If the chars inside [...] aren't already there in the original paragraph in that exact order, the annotation is wrong" |
| Paragraph drift | Output text doesn't match input verbatim — paraphrased, corrected, capitalized differently | Model "improving" the transcript | "Preserve each paragraph's text VERBATIM. No paraphrasing, no reordering, no corrections" |
| Non-canonical work wrapped as `#bible` | `[Gospel of Thomas](#bible?book=Thomas&chapter=…)` or similar | Model treats every gospel-shaped phrase as scripture | Explicit non-canonical-works rule + self-check item 7. Verify by grepping the response for `book=Thomas`, `book=Mary`, `book=Judas`, `book=Mormon`, `book=Quran` — should be zero hits. |

Irreducible model noise sits around 85–90% on the hardest target (attribution patterns) — pure prompt engineering can't reliably reach 100% with smaller models. Accept ≥7/8 across repeated runs as passing.

## In-app evaluation

Path: `/dashboard/admin/llm-eval`. Admin role required.

Workflow:

1. Pick an upload via the search box (min 2 chars).
2. Pick task = `annotate`.
3. The model field pre-fills with `openai/gpt-5.4-mini` (the production default). Add other OpenRouter model ids (e.g. `openai/gpt-5.4`, `google/gemini-2.5-flash`, `openai/gpt-5.4-nano`) to A/B-compare. Up to 8.
4. Optionally override `maxTokens` (the activity default for annotate is 32768; lower for providers with tighter caps — DeepSeek v3.x = 8K–16K, Groq llama-4-scout = 8K).
5. Click "Run evaluation". Each model fires in parallel and renders as soon as its call resolves.

The URL captures `uploadId`, `task`, comma-separated `models`, and `maxTokens` so results are shareable and refresh-safe. Queries are user-driven and do not auto-refresh — refocusing the window won't re-spend tokens.

Each result card shows:

- Latency, prompt/completion tokens, OpenRouter-reported USD cost.
- Counts: outline / bible / keyword / skipped.
- The parsed annotations grouped by paragraph, with the matched word range and bible metadata for each inline annotation.
- A "Skipped" section listing inline annotations the model emitted but we couldn't materialize (span not found verbatim, or invalid bible metadata).
- Per-card "Copy raw output" button (markdown for annotate, JSON for summarize — best-effort pretty-printed).
- Per-page "Copy prompt" button (the exact `[system]`/`[user]` text sent to every model in the run).

The eval activity bypasses the DB write — nothing is persisted. To re-test the same model after a code change, retry it from its card.

### What to look at

- **Skipped count.** A few skipped items is normal (LLMs occasionally pick spans across punctuation we can't fuzzy-match); >5 is a signal that the model is hallucinating link text.
- **Outline count.** Below 3 fails criterion 2. Look at the headings list and ask: are these substantive teaching titles, or did the model name the banter?
- **Bible/keyword count vs upload length.** For a 30-min sermon, expect 10–40 annotations. Very low counts often mean the model skipped attribution patterns; spot-check the paragraphs that quote scripture in the source-of-record preview.

### Picking a corpus

Re-use the LLM-seeded uploads from `LLM_SEEDED_UPLOAD_IDS` (`packages/web/src/seed/llm-seed.ts`). They span:

- Dividing Line episodes — heavy attribution patterns, controversial topics that stress safety classifiers.
- Verse-by-verse expository sermons — high density of explicit citations.
- Topical talks — mix of allusion and explicit citation, multiple section breaks.

Pick at least one from each category before declaring a prompt change good. A change that improves Dividing Line outputs can silently regress expository sermons by over-fragmenting their outlines.

## Direct OpenRouter testing (for prompt iteration)

When changing the prompt itself, iterating against the in-app eval is slow — each change means editing the source code, restarting Temporal, and re-running. Direct testing keeps the loop tight.

### Setup

Driver script (`/tmp/promptdev/run.mjs` is a good convention; nothing in the repo depends on it):

```javascript
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) { console.error('OPENROUTER_API_KEY missing'); process.exit(1); }

const promptPath = process.argv[2] || 'prompt.md';
const outPath = process.argv[3] || 'response.md';

const raw = await readFile(promptPath, 'utf-8');
const m = raw.match(/^\[system\]\n([\s\S]*?)\n\[user\]\n([\s\S]*)$/);
if (!m) { console.error('Could not parse prompt.md'); process.exit(1); }
const [, system, user] = m;

const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'openai/gpt-5.4-mini',
    max_tokens: 32768,
    // Production setting. Default 1.0 produces the "model summarizes
    // the transcript instead of echoing it" catastrophic-failure mode
    // on ~1/12 runs; 0.6 eliminates it.
    temperature: 0.6,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    // Production provider routing. The order list applies to open-weight
    // routes (gemma, llama, deepseek) — direct-from-vendor routes like
    // openai/* ignore it. Sort: 'price' is the fallback strategy.
    provider: {
      order: ['cloudflare', 'nextbit', 'siliconflow', 'parasail', 'novita'],
      sort: 'price',
    },
    usage: { include: true },
  }),
});

const data = await res.json();
const choice = data.choices?.[0];
const finish = choice?.finish_reason;
const content = choice?.message?.content ?? '';
const usage = data.usage ?? {};
console.error(`finish=${finish}, in=${usage.prompt_tokens}, out=${usage.completion_tokens}, cost=$${usage.cost ?? 'n/a'}`);
if (finish !== 'stop') console.error(`!! abnormal finish_reason: ${finish}`);
if (content.length < 30000) console.error(`!! short content (${content.length} chars) — possible early stop / content filter`);

const stripped = content.trim().replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/i, '');
await writeFile(outPath, stripped);
```

Prompt file format — `prompt.md` in the repo root holds the system prompt and one upload's paragraphs as the user message:

```
[system]
<paste FULL_DOC_SYSTEM_PROMPT here, with the leading "You are…" line>

[user]
Channel: <name>
Title: <title>
Description: <description or empty>

Paragraphs (one per blank-line-separated block, prefixed with order):

[0] <paragraph text>

[1] <paragraph text>
…
```

Source `OPENROUTER_API_KEY` from `.envrc.local` before running. Output lands in `response.md`.

### Iteration loop

1. Edit `prompt.md` (system part only — keep the user message constant across runs).
2. Run the driver 5–8 times in parallel against the target model. Single runs are noisy; the model's irreducible variance means a fluke pass means nothing.
3. Inspect each `response.md` for the failure modes above.
4. Aggregate: how many runs hit each criterion?
5. Compare against the previous prompt's baseline. If a change moves one criterion forward but regresses another, that's not a win — try again.

Helpful one-liners for batch evaluation:

```bash
# First line and first heading of N parallel runs
for i in $(seq 1 8); do (
  node /tmp/promptdev/run.mjs prompt.md /tmp/promptdev/out-$i.md 2>/dev/null
  printf "run %d: first line: %s\n" $i "$(head -1 /tmp/promptdev/out-$i.md)"
  printf "         first heading: %s\n" "$(grep -m1 '^#' /tmp/promptdev/out-$i.md)"
  printf "         heading count: %d\n" "$(grep -c '^#' /tmp/promptdev/out-$i.md)"
) & done; wait

# Did the Jesus attribution annotation land?
grep -c 'Jesus himself said from the beginning' /tmp/promptdev/out-*.md
grep -l 'jesus himself said from the beginning, he made them male and female\].*book=Matt' -i /tmp/promptdev/out-*.md
```

### When the model fails

If a candidate model fails consistently on criterion 4 (attribution patterns) or 3 (no truncation) across multiple prompt iterations, escalate rather than keep tightening the prompt:

- **Truncation:** the model's safety classifier is the cause if it stops at the same paragraph every run. The framing preamble in the production prompt usually defuses this. If it doesn't, the model is unusable for this task — pick another.
- **Persistent attribution miss:** if 8 runs all miss the same "Jesus said" annotation, the model isn't reading attribution patterns as citations. Try a stronger restatement in the self-check block. If still missing, escalate model tier.
- **Persistent banter heading:** very rare after the iter-8 prompt; if a new model regresses, the prohibition probably needs to be moved earlier in the system prompt rather than buried in the Headings section.

### Porting back to production

Once the iterated `prompt.md` passes consistently, port the system-prompt half into `SYSTEM_PROMPT` in `packages/temporal/src/activities/background/annotate-transcript.ts`. Run `pnpm --filter @letschurch/temporal run check:ts`. Then re-run the in-app eval against the same upload to confirm the production code path matches the direct test.

After production-prompt changes that affect the seed corpus annotations, regenerate the LLM seed annotations:

```bash
just generate-seed-annotations   # ~5 min, ~$0.10–0.15 at gpt-5.4-mini
just dump-llm-seed-data          # capture into committed snapshots
```

Content-filter blocks on the primary model auto-retry against `OPENROUTER_ANNOTATE_FALLBACK_MODEL` (default `anthropic/claude-haiku-4-5`) — both attempts record in `llm_call`. Uploads where both fail surface on the admin **Failed Annotations** page (`/dashboard/admin/failed-annotations`) with a regenerate button. To audit a regen run, query `llm_call` for `outcome != 'success' AND activity = 'annotateTranscript' AND created_at > '<regen start>'`; rows whose `model` matches the fallback are the cases the fallback caught, rows whose `model` matches the primary are the cases the activity ultimately gave up on. See `docs/seed-data.md` for the full bootstrap flow.

The summarize activity has the same fallback wiring — `OPENROUTER_SUMMARY_FALLBACK_MODEL` (same default) — with a parallel admin **Failed Summaries** page at `/dashboard/admin/failed-summaries`.

## Reference

- Production prompt: `packages/temporal/src/activities/background/annotate-transcript.ts` (`SYSTEM_PROMPT`)
- Activity (the page and the production workflow both call this): `packages/temporal/src/activities/background/annotate-transcript.ts` (`runAnnotation`)
- Silent-summarization guard knobs: `SILENT_SUMMARY_FLOOR`, `CHARS_PER_TOKEN` (named exports in the same file, top of `runAnnotation`)
- Text-only prompt-tuning eval CLI: `services/transcribe/scripts/segment_text.py` (wtpsplit-segments a plain-text transcript into paragraph JSON) → `packages/web/src/seed/eval-annotate-from-json.ts` (runs `runAnnotation` against the JSON, prints heading + annotation counts + writes the raw markdown). Use this loop when tuning the prompt against a new content format without going through the full upload pipeline. Scratch artifacts land under `seed-data/eval/` (gitignored).
- Admin eval page: `packages/web/src/routes/dashboard_/admin_.llm-eval.tsx`
- Admin failure-surface pages: `packages/web/src/routes/dashboard_/admin_.failed-annotations.tsx`, `admin_.failed-summaries.tsx` (list uploads whose latest annotate/summarize `llm_call` failed AND no annotations/summary landed; both expose the existing `regenerateUploadAnnotations` / `regenerateUploadSummary` mutations as per-row buttons)
- Fallback-model env vars: `OPENROUTER_ANNOTATE_FALLBACK_MODEL`, `OPENROUTER_SUMMARY_FALLBACK_MODEL` — both default to `anthropic/claude-haiku-4-5`. Empty string disables the fallback; the wrapper then throws `guard_content_filter` as before.
- `llm_call` schema: `packages/db/src/schema.ts` (search for `LlmCall`)
- Pricing table + `computeCost` / `resolveCostUsd`: `packages/temporal/src/util/llm-pricing.ts`
- Tracked-completion wrapper (`createChatCompletionTracked`): `packages/temporal/src/util/llm.ts`
- Workflows: `summarizeUploadWorkflow` and `annotateTranscriptWorkflow` are now independent — admins can regenerate either without re-running the other. See `packages/temporal/src/workflows/background/`.
- Chunked-request future work: `docs/annotation-chunking-design.md`
- Seed corpus list: `LLM_SEEDED_UPLOAD_IDS` in `packages/web/src/seed/llm-seed.ts`
- OSIS book abbreviations: <https://wiki.crosswire.org/OSIS_Book_Abbreviations>
