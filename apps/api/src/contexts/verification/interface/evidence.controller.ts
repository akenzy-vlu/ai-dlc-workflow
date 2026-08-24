import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { EvidenceArchiveService } from '../application/evidence-archive.service';

/**
 * Serves evidence by content hash, outside any repository's URL space.
 *
 * A blob is immutable by construction — its name *is* its hash — so it is cached for a
 * year rather than the five minutes a path-addressed screenshot has to settle for. That
 * is the practical payoff of content addressing, on top of the deduplication.
 */
@Controller('api/evidence')
export class EvidenceController {
  constructor(private readonly archive: EvidenceArchiveService) {}

  @Get(':sha256')
  async blob(@Param('sha256') sha256: string, @Res() response: Response): Promise<void> {
    const blob = await this.archive.open(sha256);

    response.setHeader('Content-Type', blob.contentType);
    response.setHeader('Content-Length', blob.bytes);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // The hash is the entity tag, so a conditional request needs no extra bookkeeping.
    response.setHeader('ETag', `"${blob.sha256}"`);

    // Streaming rather than buffering: a run's evidence is screenshots, and holding a
    // whole set in memory to answer one request is how an API falls over on a busy page.
    blob.body.pipe(response);
    blob.body.on('error', () => response.destroy());
  }
}
