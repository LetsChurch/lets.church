export type ReprocessScope =
  // Uploads with no rows in `transcript_paragraph`. Used to migrate
  // content from the pre-paragraphs transcribe pipeline (whisper-only
  // output, no diarization / paragraph segmentation) onto the current
  // pipeline. Scheduled in reverse-chronological order so the freshest
  // content catches up first.
  | { kind: 'no_paragraphs' }
  // Video uploads whose audio is still muxed into the video segments
  // (`split_audio = false`) rather than served as a separate fMP4
  // rendition. Used to migrate content that predates the split-audio
  // transcode pipeline. Restricted to uploads with a video variant —
  // audio-only uploads never have (or need) split audio.
  | { kind: 'no_split_audio' }
  | { kind: 'all' }
  | { kind: 'channel'; channelId: string };
