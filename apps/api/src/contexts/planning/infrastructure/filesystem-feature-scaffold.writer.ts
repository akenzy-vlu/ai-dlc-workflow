import { Injectable } from '@nestjs/common';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import { todoCount } from '../../../shared/infrastructure/text/markdown.reader';
import { FeatureScaffoldWriterPort, IntentDraft } from '../domain/ports/feature-scaffold.port';

@Injectable()
export class FilesystemFeatureScaffoldWriter implements FeatureScaffoldWriterPort {
  constructor(private readonly fs: FileSystem) {}

  async writeIntent(featureDirectory: string, slug: string, draft: IntentDraft): Promise<boolean> {
    const target = path.join(featureDirectory, '00-intent.md');
    const existing = await this.fs.readText(target);
    if (existing === null) return false;

    // The scaffold aidlc.py writes has exactly four TODO placeholders and nothing else.
    // Anything with fewer has been edited by a person, and is not ours to overwrite.
    if (todoCount(existing) < 4) return false;

    const outOfScope = draft.outOfScope.filter((item) => item.trim().length > 0);
    const body = [
      `# Intent — ${slug}`,
      '',
      '## Problem',
      '',
      draft.problem.trim() || 'TODO',
      '',
      '## Success signal',
      '',
      draft.successSignal.trim() || 'TODO',
      '',
      '## Out of scope',
      '',
      ...(outOfScope.length > 0 ? outOfScope.map((item) => `- ${item.trim()}`) : ['- TODO']),
      '',
      '## Constraints',
      '',
      draft.constraints.trim() || 'None recorded.',
      '',
    ].join('\n');

    await fsp.writeFile(target, body, 'utf8');
    return true;
  }
}
