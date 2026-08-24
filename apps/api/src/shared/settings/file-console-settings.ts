import { Inject, Injectable } from '@nestjs/common';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig } from '../../config/aidlc.config';
import { FileSystem } from '../infrastructure/fs/file-system';
import type { ConsoleSettings, ConsoleSettingsPort } from './console-settings.port';

/** `~/.aidlc-console/settings.json` — the laptop driver. */
@Injectable()
export class FileConsoleSettings implements ConsoleSettingsPort {
  private readonly filePath: string;

  constructor(
    @Inject(AIDLC_CONFIG) config: AidlcConfig,
    private readonly fs: FileSystem,
  ) {
    this.filePath = path.join(config.consoleHome, 'settings.json');
  }

  async read(): Promise<ConsoleSettings> {
    return (await this.fs.readJson<ConsoleSettings>(this.filePath)) ?? {};
  }

  async patch(values: Partial<ConsoleSettings>): Promise<void> {
    await this.fs.writeJson(this.filePath, { ...(await this.read()), ...values });
  }
}
