# Transcript pipeline cleanup (post-reprocess)

Every upload has been reprocessed through the Python transcribe worker
(`services/transcribe`), so each has a camelCase `{id}/transcript.json` and
`transcript_paragraph` rows. The legacy TypeScript transcribe activity, its
whisper helpers, the `transcript.original.txt` download fallback, the
`media.getTranscript` VTT procedure, and the legacy line-transcript UI have been
removed; the media page renders transcripts from paragraphs only.

What remains is out-of-band or dependency housekeeping.

## Delete legacy S3 artifacts

The legacy TS pipeline wrote `{id}/transcript.original.{json,vtt,srt,txt}` to
each storage location's public bucket. Nothing reads them anymore and the
Python worker doesn't delete them, so they need a one-off sweep per storage
location.

The new worker's `{id}/transcript.vtt`, `{id}/transcript.json` and
`{id}/transcript.txt` stay: the VTT and TXT are offered as downloads.

## Drop now-unused dependencies

`subtitle` is no longer imported by `@letschurch/temporal` (it was only used by
the legacy activity) or `@letschurch/web` (only `media.getTranscript` parsed
VTT). Remove it from both `package.json`s and regenerate the lockfile.

## Verification

- `grep -rn "transcript.original\|whisperJsonSchema\|stitchTranscript\|getTranscript\b" packages | grep -v node_modules`
  returns nothing outside the MCP `getTranscript` tool (which reads paragraphs).
