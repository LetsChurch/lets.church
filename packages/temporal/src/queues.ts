export const BACKGROUND_QUEUE = 'background';
export const GLACIER_QUEUE = 'glacier';
export const IMPORT_QUEUE = 'import';
export const PROBE_QUEUE = 'probe';
export const TRANSCODE_QUEUE = 'transcode';
export const TRANSCRIBE_QUEUE = 'transcribe';

// This is the current version of the media processing pipeline
export const CURRENT_PIPELINE_VERSION = 2;

// Priority keys for media processing workflows (1 = highest, 5 = lowest)
// Tasks default to a Priority of 3. Activities and Child Workflows will inherit their Workflow's
// priority unless they explicitly specify their own priority.
export const PRIORITY_USER = 1;
export const PRIORITY_RETRY = 2;
export const PRIORITY_IMPORT = 4;
export const PRIORITY_REPROCESS = 5;
