import pProgress, { PProgress } from 'p-progress';
import pRetry from 'p-retry';
import invariant from 'tiny-invariant';

function uploadPart(
  file: File,
  url: string,
  partSize: number,
  part: number,
  signal?: AbortSignal,
) {
  invariant(
    part > 0 && part <= 10_000,
    'Part number must be between 1 and 10,000 inclusive',
  );

  return pProgress((progress) =>
    pRetry(
      () =>
        new Promise<string>((resolve, reject) => {
          const offset = (part - 1) * partSize;
          const chunk = file.slice(offset, offset + partSize);

          const xhr = new XMLHttpRequest();

          signal?.addEventListener('abort', () => xhr.abort());

          xhr.upload.addEventListener('progress', ({ loaded, total }) => {
            progress(loaded / total);
          });

          xhr.addEventListener('error', (error) => reject(error));
          xhr.addEventListener('abort', (error) => reject(error));
          xhr.addEventListener('loadend', () => {
            progress(1);
            const eTag = xhr.getResponseHeader('ETag');
            if (eTag) {
              resolve(eTag);
            } else {
              reject(new Error(`No ETag from part upload: ${part}`));
            }
          });

          xhr.open('PUT', url);

          xhr.send(chunk);
        }),
      { retries: 5, ...(signal ? { signal } : {}) },
    ),
  );
}

export function doMultipartUpload(
  file: File,
  urls: Array<string>,
  partSize: number,
  signal?: AbortSignal,
) {
  return PProgress.all(
    urls.map((url, i) => () => uploadPart(file, url, partSize, i + 1, signal)),
    { concurrency: 6, ...(signal ? { signal } : {}) },
  );
}
