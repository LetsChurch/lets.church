import { stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import type { UploadVariant } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { Context } from '@temporalio/activity';
import fastGlob from 'fast-glob';
import { mkdirp } from 'mkdirp';
import pMap from 'p-map';
import { rimraf } from 'rimraf';
import { updateUploadRecord } from '../../../client';
import { CURRENT_PIPELINE_VERSION } from '../../../queues';
import {
  parseM3u8,
  runFfmpegRemuxAudio,
  runFfmpegRemuxVideo,
  variantsToMasterVideoPlaylist,
} from '../../../util/ffmpeg';
import logger from '../../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/transcode/remux',
});

const WORK_DIR = process.env.TRANSCODE_WORKING_DIRECTORY ?? '/data/transcode';

type UploadVariantValue = (typeof UploadVariant.enumValues)[number];

async function uploadFiles(
  uploadRecordId: string,
  paths: string[],
  contentType: string,
  signal: AbortSignal,
  log: typeof logger,
) {
  await pMap(
    paths,
    async (path) => {
      log.info(`Uploading ${basename(path)}`);
      Context.current().heartbeat(`upload ${basename(path)}`);
      await publicS3.retryablePutFile({
        key: `${uploadRecordId}/${basename(path)}`,
        contentType,
        path,
        contentLength: (await stat(path)).size,
        signal,
      });
    },
    { concurrency: 5 },
  );
}

export default async function remux(uploadRecordId: string) {
  const log = moduleLogger.child({
    temporalActivity: 'remux',
    context: { args: { uploadRecordId } },
  });

  Context.current().heartbeat('job start');
  const signal = Context.current().cancellationSignal;
  const workingDir = join(WORK_DIR, uploadRecordId);

  await updateUploadRecord(uploadRecordId, {
    transcodingStartedAt: new Date(),
  });

  try {
    // Discover what exists in S3 — drives the remux loop and the DB update
    const allKeys: string[] = [];
    for await (const key of publicS3.listKeys(`${uploadRecordId}/`)) {
      allKeys.push(key);
    }

    const filenames = new Set(
      allKeys.map((k) => k.slice(uploadRecordId.length + 1)),
    );

    const videoVariants = (
      ['VIDEO_4K', 'VIDEO_1080P', 'VIDEO_720P', 'VIDEO_480P'] as const
    ).filter((v) => filenames.has(`${v}.m3u8`));

    await mkdirp(workingDir);

    // Remux each video variant. Each variant produces muxed fMP4 segments
    // (video + audio in the same .m4s), which guarantees A/V segment
    // boundary alignment — a single muxer cuts both streams at the same
    // video keyframe, so there is no per-segment drift.
    for (const variant of videoVariants) {
      if (filenames.has(`${variant}_init.mp4`)) {
        log.info(`${variant} already remuxed, skipping`);
        continue;
      }

      log.info(`Remuxing ${variant}`);
      Context.current().heartbeat(`remux ${variant}`);

      const obj = await publicS3.getObject(`${uploadRecordId}/${variant}.m3u8`);
      const m3u8 = await obj.Body?.transformToString();
      if (!m3u8) {
        throw new Error(`Empty playlist body for ${variant}.m3u8`);
      }

      const { segments, hlsTime } = parseM3u8(m3u8);
      log.info(`${variant}: ${segments.length} segments, hlsTime=${hlsTime}`);

      const localSegmentPaths = await pMap(
        segments,
        async (seg) => {
          const localPath = join(workingDir, seg);
          await publicS3.streamObjectToFile(
            `${uploadRecordId}/${seg}`,
            localPath,
            () => Context.current().heartbeat(`dl ${seg}`),
          );
          return localPath;
        },
        { concurrency: 5 },
      );

      const concatPath = join(workingDir, `${variant}_concat.txt`);
      await writeFile(
        concatPath,
        localSegmentPaths.map((p) => `file '${p}'`).join('\n'),
      );

      const remuxVideoProc = runFfmpegRemuxVideo(
        workingDir,
        variant,
        concatPath,
        hlsTime,
        signal,
        filenames.has('AUDIO.m3u8'),
      );
      while (remuxVideoProc.exitCode === null) {
        Context.current().heartbeat(`remuxing ${variant}`);
        await setTimeout(1000);
      }
      await remuxVideoProc;

      const videoFiles = await fastGlob([
        join(workingDir, `${variant}_init.mp4`),
        join(workingDir, `${variant}_*.m4s`),
      ]);
      await uploadFiles(uploadRecordId, videoFiles, 'video/mp4', signal, log);

      const m3u8Path = join(workingDir, `${variant}.m3u8`);
      await publicS3.retryablePutFile({
        key: `${uploadRecordId}/${variant}.m3u8`,
        contentType: 'application/x-mpegURL',
        path: m3u8Path,
        contentLength: (await stat(m3u8Path)).size,
        signal,
      });

      // Free disk space before the next variant
      for (const p of [...localSegmentPaths, concatPath]) {
        await unlink(p).catch(() => undefined);
      }
    }

    // Remux AUDIO track whenever AUDIO.m3u8 is present
    let audioProduced = false;
    if (filenames.has('AUDIO.m3u8')) {
      if (filenames.has('AUDIO_init.mp4')) {
        log.info('AUDIO already remuxed, skipping');
        audioProduced = true;
      } else {
        log.info('Remuxing AUDIO');
        Context.current().heartbeat('remux AUDIO');

        const obj = await publicS3.getObject(`${uploadRecordId}/AUDIO.m3u8`);
        const m3u8 = await obj.Body?.transformToString();
        if (!m3u8) {
          throw new Error('Empty playlist body for AUDIO.m3u8');
        }

        const { segments, hlsTime } = parseM3u8(m3u8);
        log.info(`AUDIO: ${segments.length} segments, hlsTime=${hlsTime}`);

        const localSegmentPaths = await pMap(
          segments,
          async (seg) => {
            const localPath = join(workingDir, seg);
            await publicS3.streamObjectToFile(
              `${uploadRecordId}/${seg}`,
              localPath,
              () => Context.current().heartbeat(`dl ${seg}`),
            );
            return localPath;
          },
          { concurrency: 5 },
        );

        const concatPath = join(workingDir, 'AUDIO_concat.txt');
        await writeFile(
          concatPath,
          localSegmentPaths.map((p) => `file '${p}'`).join('\n'),
        );

        const remuxAudioProc = runFfmpegRemuxAudio(
          workingDir,
          concatPath,
          hlsTime,
          signal,
        );
        while (remuxAudioProc.exitCode === null) {
          Context.current().heartbeat('remuxing AUDIO');
          await setTimeout(1000);
        }
        await remuxAudioProc;

        const audioFiles = await fastGlob([
          join(workingDir, 'AUDIO_init.mp4'),
          join(workingDir, 'AUDIO_*.m4s'),
        ]);
        await uploadFiles(uploadRecordId, audioFiles, 'video/mp4', signal, log);

        const audioM3u8Path = join(workingDir, 'AUDIO.m3u8');
        await publicS3.retryablePutFile({
          key: `${uploadRecordId}/AUDIO.m3u8`,
          contentType: 'application/x-mpegURL',
          path: audioM3u8Path,
          contentLength: (await stat(audioM3u8Path)).size,
          signal,
        });

        for (const p of [...localSegmentPaths, concatPath]) {
          await unlink(p).catch(() => undefined);
        }

        audioProduced = true;
      }
    }

    if (videoVariants.length > 0) {
      const playlistBuffer = Buffer.from(
        variantsToMasterVideoPlaylist(videoVariants, audioProduced),
      );
      await publicS3.retryablePutFile({
        key: `${uploadRecordId}/master.m3u8`,
        contentType: 'application/x-mpegURL',
        body: playlistBuffer,
        signal,
      });
    }

    // Update DB before deleting legacy files so that a retry after a failed
    // deletion skips the already-remuxed variants (idempotency check above)
    // and doesn't encounter missing .ts segments.
    const newVariants: UploadVariantValue[] = [
      ...videoVariants,
      ...(audioProduced ? (['AUDIO'] as const) : []),
    ];
    await updateUploadRecord(uploadRecordId, {
      variants: newVariants,
      pipelineVersion: CURRENT_PIPELINE_VERSION,
      transcodingFinishedAt: new Date(),
    });

    // Delete old TS segments and legacy _DOWNLOAD / VIDEO_360P files
    log.info('Deleting legacy files from S3');
    const keysToDelete = allKeys.filter((key) => {
      const filename = key.slice(uploadRecordId.length + 1);
      return (
        filename.endsWith('.ts') ||
        filename.includes('_DOWNLOAD') ||
        filename.includes('VIDEO_360P')
      );
    });
    if (keysToDelete.length > 0) {
      log.info(`Deleting ${keysToDelete.length} legacy files`);
      await publicS3.deleteKeys(keysToDelete, () =>
        Context.current().heartbeat('deleteLegacy'),
      );
    }

    log.info('Remux complete');
  } catch (e) {
    log.error(
      { err: e instanceof Error ? e : new Error(String(e)) },
      'Failed to remux',
    );
    try {
      await updateUploadRecord(uploadRecordId, {
        transcodingStartedAt: null,
        transcodingProgress: 0,
      });
    } catch (resetErr) {
      log.error(
        {
          err:
            resetErr instanceof Error ? resetErr : new Error(String(resetErr)),
        },
        'Failed to reset upload record after remux failure',
      );
    }
    throw e;
  } finally {
    await rimraf(workingDir);
  }
}
