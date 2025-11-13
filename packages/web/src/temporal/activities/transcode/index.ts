// Type definitions for transcode activities (implementation in @letschurch/transcode-worker)
import type { Probe } from '../../../util/zod';

export declare function createThumbnails(
  uploadRecordId: string,
  s3UploadKey: string,
  probe: Probe,
): Promise<void>;

export declare function generatePeaks(
  uploadRecordId: string,
  s3UploadKey: string,
): Promise<void>;

export declare function transcode(
  uploadRecordId: string,
  s3UploadKey: string,
  probe: Probe,
): Promise<void>;
