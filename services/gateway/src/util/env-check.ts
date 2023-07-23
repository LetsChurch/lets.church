import { execa, type ExecaReturnValue } from 'execa';
import invariant from 'tiny-invariant';

function getHelp(bin: string) {
  return execa(bin, ['--help']);
}

function checkCode(res: ExecaReturnValue) {
  invariant(res.exitCode === 0, () =>
    JSON.stringify({ stdout: res.stdout, stderr: res.stderr }),
  );
}

export async function checkFfmpeg() {
  const res = await getHelp('ffmpeg');
  checkCode(res);
}

export async function checkWhisper() {
  await checkFfmpeg();

  const res = await getHelp('whisper-ctranslate2');
  checkCode(res);
}

export async function checkAudiowaveform() {
  await checkFfmpeg();

  const res = await getHelp('audiowaveform');
  checkCode(res);
}

export async function checkYtDlp() {
  const res = await getHelp('yt-dlp');
  checkCode(res);
}
