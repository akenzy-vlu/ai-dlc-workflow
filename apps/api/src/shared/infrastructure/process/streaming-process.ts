import { ChildProcess, spawn } from 'node:child_process';

export interface StreamingProcessOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Written to stdin, then closed. Used for prompts too long to sit in argv. */
  stdin?: string;
  timeoutMs?: number;
  onLine: (line: string, stream: 'stdout' | 'stderr') => void;
}

export interface StreamingProcessHandle {
  readonly command: string;
  readonly done: Promise<{ code: number; signal: string | null }>;
  cancel(): void;
}

/**
 * A long-running child process whose output is streamed line by line.
 *
 * Separate from `ProcessRunner` on purpose. That one buffers and is bounded by a
 * concurrency limit, which is right for controller calls measured in hundreds of
 * milliseconds. An agent CLI runs for minutes, produces output the whole time, and must
 * be cancellable — buffering it would mean the user watches a spinner and then gets a
 * wall of text after the interesting part is over.
 */
export function startStreamingProcess(
  bin: string,
  args: string[],
  options: StreamingProcessOptions,
): StreamingProcessHandle {
  const child: ChildProcess = spawn(bin, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const buffers: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };

  const pump = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
    buffers[stream] += chunk.toString();
    const lines = buffers[stream].split('\n');
    // The last element is a partial line until the next chunk arrives.
    buffers[stream] = lines.pop() ?? '';
    for (const line of lines) options.onLine(line, stream);
  };

  child.stdout?.on('data', pump('stdout'));
  child.stderr?.on('data', pump('stderr'));

  if (options.stdin !== undefined) {
    child.stdin?.write(options.stdin);
  }
  child.stdin?.end();

  let timer: NodeJS.Timeout | null = null;
  if (options.timeoutMs) {
    timer = setTimeout(() => {
      options.onLine(`— cancelled: exceeded ${Math.round(options.timeoutMs! / 60_000)} minute limit`, 'stderr');
      child.kill('SIGKILL');
    }, options.timeoutMs);
  }

  const done = new Promise<{ code: number; signal: string | null }>((resolve) => {
    const finish = (code: number, signal: string | null) => {
      if (timer) clearTimeout(timer);
      // Flush whatever was left without a trailing newline.
      for (const stream of ['stdout', 'stderr'] as const) {
        if (buffers[stream]) {
          options.onLine(buffers[stream], stream);
          buffers[stream] = '';
        }
      }
      resolve({ code, signal });
    };

    child.on('error', (error) => {
      options.onLine(`— could not start: ${error.message}`, 'stderr');
      finish(127, null);
    });
    child.on('close', (code, signal) => finish(code ?? -1, signal));
  });

  return {
    command: `${bin} ${args.join(' ')}`,
    done,
    cancel: () => {
      // SIGTERM first so the CLI can flush a partial transcript; the close handler fires
      // either way, and an agent that ignores it still dies with the parent process.
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3_000);
    },
  };
}
