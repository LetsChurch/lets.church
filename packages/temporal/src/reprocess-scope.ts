export type ReprocessScope =
  // Uploads with no rows in `transcript_paragraph`. Used to migrate
  // content from the pre-paragraphs transcribe pipeline (whisper-only
  // output, no diarization / paragraph segmentation) onto the current
  // pipeline. Scheduled in reverse-chronological order so the freshest
  // content catches up first.
  | { kind: 'no_paragraphs' }
  | { kind: 'all' }
  | { kind: 'channel'; channelId: string };
