import { spawn } from 'node:child_process';

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  /** Command line as executed, for the audit surface. Never contains credentials. */
  command: string;
  durationMs: number;
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

/**
 * Every write in this system goes through here, and nowhere else.
 *
 * The console never edits `.aidlc-state.yaml`, a ticket's `status:` line, or any of the
 * three generated files. It shells out to `aidlc.py` / `uow_graph.py` and reports what
 * they say — including their refusals, verbatim. That is the whole reason the AI-DLC
 * gates hold: the controller is the single enforcement point, and a UI that writes state
 * behind its back turns the gates back into prose.
 */
export class ProcessRunner {
  private readonly queue: (() => void)[] = [];
  private active = 0;

  constructor(private readonly concurrency: number = 4) {}

  async run(bin: string, args: string[], options: RunOptions = {}): Promise<ProcessResult> {
    await this.acquire();
    const startedAt = Date.now();
    try {
      return await new Promise<ProcessResult>((resolve, reject) => {
        const child = spawn(bin, args, {
          cwd: options.cwd,
          env: { ...process.env, ...options.env, PYTHONDONTWRITEBYTECODE: '1' },
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill('SIGKILL');
          reject(new Error(`timed out after ${options.timeoutMs ?? 30_000}ms: ${bin} ${args.join(' ')}`));
        }, options.timeoutMs ?? 30_000);

        child.stdout.on('data', (c) => (stdout += c.toString()));
        child.stderr.on('data', (c) => (stderr += c.toString()));
        child.on('error', (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
        child.on('close', (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            code: code ?? -1,
            stdout,
            stderr,
            command: `${bin} ${args.join(' ')}`,
            durationMs: Date.now() - startedAt,
          });
        });
      });
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    this.queue.shift()?.();
  }
}
