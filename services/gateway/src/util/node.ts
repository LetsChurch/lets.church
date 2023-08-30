import http from 'node:http';
import https from 'node:https';
import { createWriteStream } from 'node:fs';

export function streamUrlToDisk(
  url: string,
  path: string,
  heartbeat?: () => unknown,
) {
  return new Promise<string>((resolve, reject) => {
    (url.startsWith('https://') ? https : http).get(url, (res) => {
      if (!res.statusCode || res.statusCode >= 300) {
        reject(new Error(`Unexpected status code: ${res.statusCode}`));
      }

      const file = createWriteStream(path);

      file.on('finish', () => {
        resolve(path);
      });

      res.pipe(file);

      if (heartbeat) {
        res.on('data', () => {
          heartbeat();
        });
      }
    });
  });
}
