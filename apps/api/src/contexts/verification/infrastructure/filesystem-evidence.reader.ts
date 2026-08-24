import { Injectable } from '@nestjs/common';
import * as path from 'node:path';

import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import { EvidenceRun } from '../domain/model/evidence-run';
import { EvidenceReaderPort } from '../domain/ports/verification.port';

const EVIDENCE_DIR = 'evidence';

@Injectable()
export class FilesystemEvidenceReader implements EvidenceReaderPort {
  constructor(private readonly fs: FileSystem) {}

  async read(featureKey: string, featureDirectory: string): Promise<EvidenceRun | null> {
    const raw = await this.fs.readJson<Record<string, any>>(
      path.join(featureDirectory, EVIDENCE_DIR, 'run.json'),
    );
    return raw ? EvidenceRun.fromRunJson(featureKey, raw) : null;
  }

  /**
   * Screenshots are served by path from a JSON file the console did not write, so the
   * path is treated as untrusted: it must resolve inside `evidence/` or it is refused.
   */
  resolveArtifact(featureDirectory: string, relativePath: string): string | null {
    const root = path.resolve(featureDirectory, EVIDENCE_DIR);
    const target = path.resolve(root, relativePath);
    return target === root || target.startsWith(root + path.sep) ? target : null;
  }
}
