/**
 * Launch a non-interactive Claude CLI command with stdin explicitly closed.
 *
 * `claude -p` reads stdin when it is available. child_process.execFile creates
 * an open stdin pipe by default, so the CLI waits for EOF before starting its
 * prompt. Closing it immediately is required for unattended companions.
 */
export function closeChildStdin(child) {
  const stdin = child?.stdin;
  if (!stdin || stdin.destroyed || stdin.writableEnded) return false;
  stdin.end();
  return true;
}

export function execFileWithClosedStdin(execFileImpl, file, args, options) {
  return new Promise((resolve, reject) => {
    const child = execFileImpl(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    closeChildStdin(child);
  });
}
