import { Injectable } from '@nestjs/common';

import {
  startStreamingProcess,
  type StreamingProcessHandle,
} from '../../../shared/infrastructure/process/streaming-process';
import { AgentProcessPort, LaunchRequest } from '../domain/ports/agent.ports';
import { translateStreamJson } from './stream-json.translator';

@Injectable()
export class SpawnAgentProcess implements AgentProcessPort {
  private readonly active = new Map<string, StreamingProcessHandle>();
  private readonly cancelled = new Set<string>();

  async launch(request: LaunchRequest): Promise<{ command: string; exitCode: number; cancelled: boolean }> {
    const { run, definition, prompt } = request;
    const useStdin = definition.promptVia === 'stdin';

    const handle = startStreamingProcess(definition.binary, definition.argsFor(prompt), {
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
