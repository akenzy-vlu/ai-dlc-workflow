import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';

import { RunnerSetupService } from '../application/runner-setup.service';

class UseInterpreterDto {
  @IsString() @MinLength(1) interpreter!: string;
}

@Controller('api/runner')
export class RunnerController {
  constructor(private readonly setup: RunnerSetupService) {}

  @Get()
  async status() {
    return { ...(await this.setup.status()), installing: this.setup.isInstalling, steps: this.setup.steps };
  }

  /**
   * Creates a venv, installs Playwright and downloads Chromium. Around 150 MB.
   *
   * Returns immediately; progress arrives on the socket as `setup.progress`. The client
   * confirms before calling this — the console does not download hundreds of megabytes
   * because someone landed on a settings page.
   */
  @Post('install')
  async install() {
    return this.setup.install();
  }

  @Post('use-interpreter')
  async useInterpreter(@Body() dto: UseInterpreterDto) {
    return this.setup.useInterpreter(dto.interpreter);
  }
}
