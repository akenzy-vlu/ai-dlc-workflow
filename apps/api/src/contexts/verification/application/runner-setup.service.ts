import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import {
  CONSOLE_SETTINGS,
  type ConsoleSettings,
  type ConsoleSettingsPort,
} from '../../../shared/settings/console-settings.port';
import { ProcessRunner } from '../../../shared/infrastructure/process/process-runner';
import { startStreamingProcess } from '../../../shared/infrastructure/process/streaming-process';
import { RunnerStatus, SETUP_STEPS, SetupStepId } from '../domain/model/runner-status';

export interface SetupEvent {
  step: SetupStepId;
  state: 'running' | 'done' | 'failed';
  line: string | null;
  at: string;
}

export type SetupListener = (event: SetupEvent) => void;


const PROBE = "import importlib.metadata as m, playwright.sync_api; print(m.version('playwright'))";
const LAUNCH_PROBE =
  'from playwright.sync_api import sync_playwright\n' +
  'with sync_playwright() as p:\n' +
  '    b = p.chromium.launch()\n' +
  '    print(b.version)\n' +
  '    b.close()\n';

/**
 * Installs and reports on the browser runner.
 *
 * This is the one part of the console that installs software, and it is deliberately
 * narrow: one venv, in a path the console suggests, containing one package. It never
 * touches the system interpreter and never installs into a repository.
 */
@Injectable()
export class RunnerSetupService {
  private readonly logger = new Logger(RunnerSetupService.name);
  private readonly listeners = new Set<SetupListener>();
  private installing = false;

  constructor(
    @Inject(AIDLC_CONFIG) private readonly config: AidlcConfig,
    private readonly runner: ProcessRunner,
    private readonly fs: FileSystem,
    @Inject(CONSOLE_SETTINGS) private readonly settingsStore: ConsoleSettingsPort,
  ) {}

  onEvent(listener: SetupListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get isInstalling(): boolean {
    return this.installing;
  }

  get steps() {
    return SETUP_STEPS;
  }

  /** The interpreter verify.py will use, honouring a persisted choice. */
  async interpreter(): Promise<{ value: string; source: 'configured' | 'default' }> {
    const settings = await this.settings();
    if (settings.runnerPython) return { value: settings.runnerPython, source: 'configured' };
    if (process.env.AIDLC_VERIFY_PYTHON) {
      return { value: process.env.AIDLC_VERIFY_PYTHON, source: 'configured' };
    }
    return { value: this.config.pythonBin, source: 'default' };
  }

  async status(): Promise<RunnerStatus> {
    const { value: interpreter, source } = await this.interpreter();
    const venvPath = this.venvPath();
    const requirementsPath = this.config.verifyPath
      ? path.join(this.config.verifyPath, 'scripts', 'runner', 'requirements.txt')
      : null;

    const exists = await this.interpreterExists(interpreter);
    const blockers: string[] = [];

    if (!requirementsPath || !fs.existsSync(requirementsPath)) {
      blockers.push('ai-dlc-verify is not installed, so there is no runner to set up');
    }
    if (!exists) blockers.push(`${interpreter} is not an interpreter on this machine`);

    const probe = exists
      ? await this.runner.run(interpreter, ['-c', PROBE], { timeoutMs: 20_000 }).catch(() => null)
      : null;
    const playwrightInstalled = probe?.code === 0;
    const playwrightVersion = playwrightInstalled ? probe!.stdout.trim() : null;
    if (exists && !playwrightInstalled) blockers.push('playwright is not installed for that interpreter');

    // Playwright keeps browsers in a per-user cache; a version directory starting with
    // `chromium` means the download has happened. Cheaper and more honest than launching
    // a browser on every status poll.
    const chromiumInstalled = playwrightInstalled && this.chromiumPresent();
    if (playwrightInstalled && !chromiumInstalled) blockers.push('chromium has not been downloaded yet');

    return {
      interpreter,
      source,
      interpreterExists: exists,
      playwrightInstalled,
      playwrightVersion,
      chromiumInstalled,
      ready: blockers.length === 0,
      blockers,
      suggestedVenvPath: venvPath,
      venvExists: fs.existsSync(path.join(venvPath, 'bin', 'python')),
      requirementsPath,
    };
  }

  /**
   * Runs the whole install, streaming output.
   *
   * Returns as soon as it starts; progress arrives on the socket. A pip install plus a
   * Chromium download is minutes, and holding an HTTP request open for it just times out
   * somewhere less informative than a log the user can read.
   */
  async install(): Promise<{ started: boolean; reason?: string }> {
    if (this.installing) return { started: false, reason: 'an install is already running' };

    const requirements = this.config.verifyPath
      ? path.join(this.config.verifyPath, 'scripts', 'runner', 'requirements.txt')
      : null;
    if (!requirements || !fs.existsSync(requirements)) {
      throw new BadRequestException(
        'ai-dlc-verify is not installed on this machine, so there is no runner to set up',
      );
    }

    this.installing = true;
    void this.runInstall(requirements).finally(() => {
      this.installing = false;
    });
    return { started: true };
  }

  /** Points verify.py at an interpreter the user already has. */
  async useInterpreter(interpreterPath: string): Promise<RunnerStatus> {
    const value = interpreterPath.trim();
    if (!value) throw new BadRequestException('an interpreter path is required');
    if (!(await this.interpreterExists(value))) {
      throw new BadRequestException(`${value} is not an interpreter on this machine`);
    }
    await this.persistInterpreter(value);
    return this.status();
  }

  private async runInstall(requirements: string): Promise<void> {
    const venvPath = this.venvPath();
    const venvPython = path.join(venvPath, 'bin', 'python');

    const ok = await this.step('venv', this.config.pythonBin, ['-m', 'venv', venvPath]);
    if (!ok) return;
    if (!(await this.step('pip', venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']))) return;
    if (!(await this.step('requirements', venvPython, ['-m', 'pip', 'install', '-r', requirements]))) return;
    if (!(await this.step('browser', venvPython, ['-m', 'playwright', 'install', 'chromium']))) return;
    if (!(await this.step('verify', venvPython, ['-c', LAUNCH_PROBE]))) return;

    await this.persistInterpreter(venvPython);
    this.emit({
      step: 'verify',
      state: 'done',
      line: `— runner ready. AIDLC_VERIFY_PYTHON is now ${venvPython}`,
      at: new Date().toISOString(),
    });
  }

  private step(id: SetupStepId, bin: string, args: string[]): Promise<boolean> {
    this.emit({ step: id, state: 'running', line: `$ ${bin} ${args.join(' ')}`, at: new Date().toISOString() });

    const handle = startStreamingProcess(bin, args, {
      cwd: this.config.consoleHome,
      // Chromium is a large download on a slow link; ten minutes per step is generous
      // enough that a real install never trips it and short enough that a hung one does.
      timeoutMs: 10 * 60_000,
      onLine: (line, stream) =>
        this.emit({
          step: id,
          state: 'running',
          line: stream === 'stderr' ? line : line,
          at: new Date().toISOString(),
        }),
    });

    return handle.done.then(({ code }) => {
      const ok = code === 0;
      this.emit({
        step: id,
        state: ok ? 'done' : 'failed',
        line: ok ? null : `— step failed with exit ${code}`,
        at: new Date().toISOString(),
      });
      if (!ok) this.logger.warn(`runner setup step ${id} failed with exit ${code}`);
      return ok;
    });
  }

  private venvPath(): string {
    return path.join(os.homedir(), '.venvs', 'aidlc-verify');
  }

  private chromiumPresent(): boolean {
    const cache =
      process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
        : path.join(os.homedir(), '.cache', 'ms-playwright');
    try {
      return fs.readdirSync(cache).some((entry) => entry.startsWith('chromium'));
    } catch {
      return false;
    }
  }

  private async interpreterExists(interpreter: string): Promise<boolean> {
    if (interpreter.includes('/')) return fs.existsSync(interpreter);
    const found = await this.runner.run('which', [interpreter], { timeoutMs: 5_000 }).catch(() => null);
    return found?.code === 0;
  }

  private async settings(): Promise<ConsoleSettings> {
    return this.settingsStore.read();
  }

  private async persistInterpreter(interpreter: string): Promise<void> {
    await this.settingsStore.patch({ runnerPython: interpreter });
    // Also set it in this process so a verification started right now picks it up without
    // a restart — verify.py reads it from the environment it is spawned with.
    process.env.AIDLC_VERIFY_PYTHON = interpreter;
  }

  private emit(event: SetupEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
