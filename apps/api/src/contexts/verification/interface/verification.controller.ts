import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

import { EvidenceArchiveService } from '../application/evidence-archive.service';
import { VerificationService } from '../application/verification.service';

class RunVerificationDto {
  @IsOptional() @IsArray() @IsString({ each: true }) environments?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) viewports?: string[];
  /** Generates 08-evidence.md and the uow.md checkbox block. Only legal on `capable`. */
  @IsOptional() @IsBoolean() write?: boolean;
}

@Controller('api/features/:repositoryId/:slug/verification')
export class VerificationController {
  constructor(
    private readonly verification: VerificationService,
    private readonly archive: EvidenceArchiveService,
  ) {}

  @Get()
  async describe(@Param('repositoryId') repositoryId: string, @Param('slug') slug: string) {
    return this.verification.describe(repositoryId, slug);
  }

  @Post('run')
  async run(
    @Param('repositoryId') repositoryId: string,
    @Param('slug') slug: string,
    @Body() dto: RunVerificationDto,
  ) {
    return this.verification.run(repositoryId, slug, dto);
  }

  @Post('check-evidence')
  async checkEvidence(@Param('repositoryId') repositoryId: string, @Param('slug') slug: string) {
    return this.verification.checkEvidence(repositoryId, slug);
  }

  /** Serves a screenshot out of `evidence/`, path-guarded. */
  @Get('artifact')
  async artifact(
    @Param('repositoryId') repositoryId: string,
    @Param('slug') slug: string,
    @Query('path') relativePath: string,
    @Res() response: Response,
  ) {
    const absolute = await this.verification.artifactPath(repositoryId, slug, relativePath);
    // `dotfiles: 'allow'` is required, not cosmetic: every evidence path runs through
    // `.ai/`, and Express's default of ignoring dotfile segments 404s all of them. The
    // path was already constrained to the feature's own `evidence/` directory upstream,
    // so allowing them here widens nothing.
    response.sendFile(absolute, { dotfiles: 'allow', maxAge: '5m' });
  }

  /**
   * Copies this feature's screenshots into the content-addressed store and writes
   * `evidence-manifest.json` next to the plan. Reads the repository, never mutates it
   * beyond that one file — which is meant to be committed.
   */
  @Post('archive')
  async archiveEvidence(@Param('repositoryId') repositoryId: string, @Param('slug') slug: string) {
    return this.archive.archive(repositoryId, slug);
  }

  /** What the manifest claims, and which of those blobs this machine actually holds. */
  @Get('archive')
  async describeArchive(@Param('repositoryId') repositoryId: string, @Param('slug') slug: string) {
    return this.archive.describe(repositoryId, slug);
  }
}
