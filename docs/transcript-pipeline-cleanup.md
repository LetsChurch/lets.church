# Transcript pipeline cleanup (post-reprocess)

This tracks the dead code and legacy-artifact references that can be removed
**once every upload has been reprocessed through the Python transcribe worker**
(i.e. every upload has a camelCase `{id}/transcript.json` + `transcript_paragraph`
rows, and the old `{id}/transcript.original.*` artifacts have been deleted as
part of reprocessing).

Until 100% reprocessed, the legacy paths must stay so un-reprocessed uploads
still render/download. Don't start this cleanup until the reprocess backfill is
confirmed complete.

## Reprocessing must delete the old S3 artifacts

The new worker writes `{id}/transcript.vtt`, `{id}/transcript.json`,
`{id}/transcript.txt` (public bucket). The legacy TS pipeline wrote
`{id}/transcript.original.{json,vtt,srt,txt}`. Reprocessing should delete the
stale `transcript.original.*` keys (and any other legacy-only artifacts) so the
bucket doesn't carry both. This deletion is the trigger that makes the
references below safe to remove.

---

## Phase 1 — safe once all uploads are reprocessed

### 1. Remove the legacy TypeScript transcribe activity
`packages/temporal/src/activities/transcribe/transcribe.ts` (whisper-ctranslate2
+ stitch + `transcript.original.*` upload) is dormant — the Python worker owns
the `transcribe` Temporal queue. It survives only to **type** the `transcribe`
proxy in `process-media.ts`:

- `packages/temporal/src/workflows/background/process-media.ts:10` — `import type * as transcribeActivities from '../../activities/transcribe'`
- `:37` — `proxyActivities<typeof transcribeActivities>(...)`

To remove it, replace that proxy's type with an inline shape (matches the Python
worker's return):
```ts
const { transcribe } = proxyActivities<{
  transcribe(
    uploadRecordId: string,
    s3UploadKey: string,
  ): Promise<{ transcriptKey: string; transcriptJsonKey: string; additionalKeys: string[] }>;
}>({ /* …existing opts… */ });
```
Then delete `packages/temporal/src/activities/transcribe/` (`transcribe.ts` +
`index.ts`).

### 2. Slim `packages/temporal/src/util/whisper.ts`
After (1), the whisper-ctranslate2 helpers are dead — they're only used by the
legacy `transcribe.ts`. The only thing still needed is the camelCase
`transcriptJsonSchema` + `TranscriptJson`/`TranscriptJsonSegment` types
(consumed by `store-transcript-paragraphs.ts`).

Remove: `runWhisper`, `whisperJsonSchema`, `stitchTranscript`,
`whisperJsonToVtt`, `readWhisperJsonFile`, `StitchedTranscript`. Keep
`transcriptJsonSchema` + types (consider renaming the file to
`transcript-json.ts`, since "whisper" no longer fits).

### 3. Switch the TXT download to the new artifact
`packages/web/src/trpc/procedures/media.ts:553` serves
`${media.id}/transcript.original.txt`. Change to `${media.id}/transcript.txt`
(the new worker's output). The VTT download at `:542` already uses
`transcript.vtt` (unchanged).

### 4. Remove the old `@letschurch/transcribe-worker` package
`packages/transcribe-worker/` is the retired Node worker (replaced by
`services/transcribe`). Remove the package directory and its references:
- `Dockerfile:48` — `COPY … packages/transcribe-worker/package.json …`
- the `pnpm-workspace.yaml` glob (if it enumerates it) and any `pnpm-lock.yaml` entry
- confirm no remaining `@letschurch/transcribe-worker` imports

### 5. Web `util/whisper.ts` (separate copy)
`packages/web/src/util/whisper.ts` still defines `stitchToHtml` +
`whisperJsonSchema` with tests/snapshots (`whisper.test.ts`,
`__snapshots__/whisper.test.ts.snap`). Confirm it's unused by app code (it is at
time of writing — only its own tests reference it) and remove the module +
tests + snapshot.

### 6. Stray `DocumentKind` duplicate (incidental)
`packages/temporal/src/activities/background/geocode-organization.ts` carries a
copy/paste `DocumentKind` union (still listing `transcriptHtml`) and a
mislabeled `index-document` logger. Unused/unrelated cruft — delete the stray
union (keep the `jsonSchema`/geocoding logic).

---

## Phase 2 — gated on transcript SEARCH migration (not reprocess alone)

These still power **search** and the legacy line-transcript fallback, so they
can only go once search is reworked onto paragraph data. Listed here so the full
end state is visible:

- `media.getTranscript` tRPC (`media.ts`, parses `transcript.vtt` → `{start,text}[]`)
- `Transcript` legacy component (`packages/web/src/components/transcript.tsx`)
- the legacy/new fallback branches + dual prefetch/query in
  `routes/_main/media/$mediaId.tsx`, `media-sidebar-tabs.tsx`, and the mobile
  drawer (once paragraphs are guaranteed for all uploads, the `?? legacy` arms drop)
- `transcript-search` store (FlexSearch over `{start,text}`) once search reads paragraphs
- the `'transcript'` VTT→ES path — **DONE** (search is on `lc_media_v1`
  paragraphs). The legacy `lc_uploads_v2` + `lc_transcripts` indices are retired:
  removed the `index-document.ts` `'transcript'`/`'upload'` cases, both mappings,
  the `reindex.ts` + admin-UI `'upload'`/`'transcript'` kinds, `performSearch`
  (+ `msearchUploads`/`msearchTranscripts` + their hit schemas + `uploadExists`/
  `listIds`), and repointed create/update/process-media indexing + the
  delete-upload search cleanup to `lc_media_v1`/`lc_speaker_vectors`. The
  `transcript.vtt` artifact + its download **remain** (the `media.getTranscript`
  legacy transcript UI above still reads VTT) — drop those separately. Live
  `lc_uploads_v2` / `lc_transcripts` indices must be deleted from the cluster
  out-of-band (the push-mappings script never deletes).

---

## Verification after cleanup
- `tsc --noEmit` for `@letschurch/temporal`, `@letschurch/web`, `@letschurch/db`.
- `grep -rn "transcript.original\|whisperJsonSchema\|stitchTranscript\|transcribe-worker" packages | grep -v node_modules` returns nothing.
- background-worker recompiles its Temporal bundle and boots.
- A reprocessed upload's media page still renders paragraphs; TXT/VTT downloads resolve.
