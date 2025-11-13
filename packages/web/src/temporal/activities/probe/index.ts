import type { Probe } from '../../../util/zod';

// This is a type-only export for use with proxyActivities
// The actual implementation is in @letschurch/probe-worker
export declare function probe(
  uploadRecordId: string,
  s3UploadKey: string,
): Promise<Probe>;
