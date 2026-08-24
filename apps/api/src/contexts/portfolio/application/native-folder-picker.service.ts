import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';

import { RefusedError } from '../../../shared/kernel';
import { ProcessRunner } from '../../../shared/infrastructure/process/process-runner';

/**
 * Opens the operating system's own folder dialog and returns what was chosen.
 *
 * Only meaningful when the API process shares a desktop with whoever is looking at the
 * console — a native `pnpm dev` run. In a container there is no display and the
 * filesystem is not the user's, so this reports unavailable and the console falls back to
 * the directory browser, which works everywhere.
 */
/** Ten minutes: long enough that nobody hits it, short enough to free the slot. */
const DIALOG_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class NativeFolderPicker {
  private readonly logger = new Logger(NativeFolderPicker.name);
  private cached: boolean | null = null;

  constructor(private readonly runner: ProcessRunner) {}

  /**
   * Whether a dialog can actually be shown.
   *
   * `/.dockerenv` is the cheap, reliable container tell. Without that check the container
   * would advertise a picker, `osascript` would be missing, and the user would get a
   * failure on click instead of a button that was never offered.
   */
  async available(): Promise<boolean> {
    if (this.cached !== null) return this.cached;

    if (await exists('/.dockerenv')) {
      this.cached = false;
      return false;
    }
    if (os.platform() !== 'darwin') {
      // Linux would want zenity/kdialog; not wired, and guessing wrong means a hang.
      this.cached = false;
      return false;
    }
    const probe = await this.runner.run('which', ['osascript'], { timeoutMs: 5_000 }).catch(() => null);
    this.cached = probe?.code === 0;
    return this.cached;
  }

  async choose(startAt?: string): Promise<string> {
    if (!(await this.available())) {
      throw new RefusedError(
        'refused: this console cannot open a native folder dialog — it is not running on your desktop. Use Browse instead.',
      );
    }

    const target = sanitiseStart(startAt);
    const script = target
      ? `choose folder with prompt "Select a repository" default location POSIX file ${quote(target)}`
      : 'choose folder with prompt "Select a repository"';

    // Long, but finite. A dialog waits on a person, so the runner's 30s default would
    // kill it under their hands — and 0 is worse than useless here: the runner reads it
    // as setTimeout(0) and SIGKILLs before the window is even drawn.
    const result = await this.runner.run(
      'osascript',
      ['-e', `POSIX path of (${script})`],
      { timeoutMs: DIALOG_TIMEOUT_MS },
    );

    if (result.code !== 0) {
      // Cancelling is exit code 1 with "User canceled" on stderr — an outcome, not a fault.
      if (/user canceled/i.test(result.stderr)) {
        throw new RefusedError('refused: no folder chosen');
      }
      throw new RefusedError(`refused: the folder dialog failed — ${result.stderr.trim()}`);
    }

    // `POSIX path of` returns a trailing separator on directories; the registry stores
    // paths without one, and the two forms would otherwise register as different repos.
    return result.stdout.trim().replace(/\/+$/, '');
  }
}

/**
 * Narrows what may reach the AppleScript source.
 *
 * The value is interpolated into a script string, so escaping quotes and backslashes is
 * what keeps it a literal — but escaping alone is a single point of failure for input
 * that has no business being anything other than an absolute path. Rejecting the rest is
 * cheaper than trusting the escape.
 */
function sanitiseStart(value?: string): string | undefined {
  const target = value?.trim();
  if (!target) return undefined;
  if (!target.startsWith('/')) return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f"\\]/.test(target)) return undefined;
  return target;
}

function quote(value: string): string {
  return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
