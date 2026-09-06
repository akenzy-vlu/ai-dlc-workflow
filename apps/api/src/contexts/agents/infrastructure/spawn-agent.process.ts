import { Injectable } from '@nestjs/common';

import { InvalidValueError } from '../../../shared/kernel';

import {
  startStreamingProcess,
  type StreamingProcessHandle,
} from '../../../shared/infrastructure/process/streaming-process';
import { AgentDefinition } from '../domain/model/agent-definition';
import { AgentProcessPort, LaunchRequest } from '../domain/ports/agent.ports';
import { translateStreamJson } from './stream-json.translator';

/**
 * Argv for one run: a fresh launch, or a continuation of a session the CLI still holds.
 *
 * Exported and pure so the choice can be tested without spawning anything — the suite
 * runs no subprocesses, and this branch is the only decision in this file.
 *
 * The guard is deliberately redundant. `AgentLauncherService.reply()` refuses a
 * non-resumable agent long before anything reaches here, so this throw should be
 * unreachable. It is written anyway because the failure it prevents is the one this whole
 * capability exists for: a guessed resume flag does not make the CLI exit, it drops it
 * into an interactive session that hangs behind a pipe until the timeout kills it.
 */
export function resolveArgs(definition: AgentDefinition, prompt: string, resumeSessionId?: string): string[] {
  if (resumeSessionId === undefined) return definition.argsFor(prompt);
  if (!definition.canResume) {
    throw new InvalidValueError(
      `refusing to resume with ${definition.label}: it declares no resume invocation, ` +
        'and a guessed flag opens an interactive session that never returns',
    );
  }
  return definition.argsForResume(resumeSessionId, prompt);
}

@Injectable()
export class SpawnAgentProcess implements AgentProcessPort {
  private readonly active = new Map<string, StreamingProcessHandle>();
  private readonly cancelled = new Set<string>();

  async launch(request: LaunchRequest): Promise<{ command: string; exitCode: number; cancelled: boolean }> {
    const { run, definition, prompt } = request;
    const useStdin = definition.promptVia === 'stdin';
    // Resolved before the spawn, so a refusal costs no process. `handle.command` is built
    // from these, which is what makes a resumed run record the argv it actually ran.
    const args = resolveArgs(definition, prompt, request.resumeSessionId);

    const handle = startStreamingProcess(definition.binary, args, {
      cwd: run.cwd,
      stdin: useStdin ? prompt : undefined,
      timeoutMs: request.timeoutMs,
      onLine: (text, stream) => {
        const at = new Date().toISOString();
        // stderr is never protocol — a crash trace parsed as an event would vanish.
        const translated = stream === 'stdout' ? translateStreamJson(text, at) : null;
        if (!translated) {
          request.onLine({ at, stream, text });
          return;
        }
        for (const activity of translated.activities) request.onActivity(activity);
        if (Object.keys(translated.telemetry).length > 0) request.onTelemetry(translated.telemetry);
        if (translated.transcript !== null) request.onLine({ at, stream, text: translated.transcript });
      },
    });

    this.active.set(run.id, handle);
    try {
      const { code } = await handle.done;
      return { command: handle.command, exitCode: code, cancelled: this.cancelled.has(run.id) };
    } finally {
      this.active.delete(run.id);
      this.cancelled.delete(run.id);
    }
  }

  cancel(runId: string): boolean {
    const handle = this.active.get(runId);
    if (!handle) return false;
    this.cancelled.add(runId);
    handle.cancel();
    return true;
  }

  isRunning(runId: string): boolean {
    return this.active.has(runId);
  }
}
