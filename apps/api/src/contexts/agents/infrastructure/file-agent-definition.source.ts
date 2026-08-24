import { Inject, Injectable } from '@nestjs/common';
import * as path from 'node:path';

import { AIDLC_CONFIG, AidlcConfig } from '../../../config/aidlc.config';
import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import type {
  AgentConfigEntry,
  AgentDefinitionSourcePort,
} from '../domain/ports/agent-definition-source.port';

/** `~/.aidlc-console/agents.json` — the laptop driver. */
@Injectable()
export class FileAgentDefinitionSource implements AgentDefinitionSourcePort {
  constructor(
    @Inject(AIDLC_CONFIG) private readonly config: AidlcConfig,
    private readonly fs: FileSystem,
  ) {}

  async list(): Promise<AgentConfigEntry[]> {
    const file = path.join(this.config.consoleHome, 'agents.json');
    return (await this.fs.readJson<AgentConfigEntry[]>(file)) ?? [];
  }
}
