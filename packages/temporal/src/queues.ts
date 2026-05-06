export const BACKGROUND_QUEUE = 'background';
export const GLACIER_QUEUE = 'glacier';
export const IMPORT_QUEUE = 'import';
export const PROBE_QUEUE = 'probe';
export const TRANSCODE_QUEUE = 'transcode';
export const TRANSCRIBE_QUEUE = 'transcribe';

// Priority keys for media processing workflows (1 = highest, 5 = lowest)
export const PRIORITY_USER_UPLOAD = 1;
export const PRIORITY_RETRY = 2;
export const PRIORITY_IMPORT = 5;
