import { invariant } from 'es-toolkit';
import { execa, type Result } from 'execa';

function getHelp(bin: string) {
  return execa(bin, ['--help']);
}

function checkCode(res: Result) {
  invariant(
    res.exitCode === 0,
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
