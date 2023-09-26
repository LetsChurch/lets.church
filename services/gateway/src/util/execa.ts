import type { ExecaChildProcess } from 'execa';

export function disposableExeca(proc: ExecaChildProcess) {
  const pid = proc.pid;

  return {
    proc,
    [Symbol.dispose]() {
      if (proc.exitCode === null && !proc.killed) {
        console.log(
          `Warning: Disposing child process ${proc.spawnfile} (${pid})`,
        );
        proc.kill();
      } else {
        console.log(`Child process ${proc.pid} successfully disposed`);
      }
    },
  };
}
