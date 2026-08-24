import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { ToolingProbe } from '../../../shared/infrastructure/tooling.probe';
import { TrackedRepository } from '../domain/model/tracked-repository';
import { BrowseDirectories } from '../application/browse-directories.query';
import { NativeFolderPicker } from '../application/native-folder-picker.service';
import { RegisterRepositoryUseCase } from '../application/register-repository.use-case';
import { RepositoryMaintenance } from '../application/repository-maintenance.use-case';
import {
  DiscoverRepositoriesDto,
  RegisterRepositoryDto,
  RepositoryView,
  UpdateRepositoryDto,
} from './dto/repository.dto';

@Controller('api/repositories')
export class PortfolioController {
  constructor(
    private readonly register: RegisterRepositoryUseCase,
    private readonly maintenance: RepositoryMaintenance,
    private readonly tooling: ToolingProbe,
    private readonly browser: BrowseDirectories,
    private readonly nativePicker: NativeFolderPicker,
  ) {}

  @Get()
  async list(): Promise<RepositoryView[]> {
    return (await this.maintenance.list()).map(toView);
  }

  @Get('projects')
  async projects() {
    return this.maintenance.projects();
  }

  @Get('tooling')
  async toolingStatus() {
    return this.tooling.status(true);
  }

  @Post()
  async add(@Body() dto: RegisterRepositoryDto): Promise<RepositoryView> {
    return toView(await this.register.execute({ absolutePath: dto.absolutePath, label: dto.label }));
  }

  /**
   * Lists directories so the client can offer a folder picker.
   *
   * Declared before `:id` — Nest matches in declaration order, and a route added below it
   * would be swallowed by the parameter route and read as a repository called "browse".
   */
  @Get('browse')
  async browse(@Query('path') target?: string) {
    return this.browser.list(target);
  }

  /** Whether a native OS dialog is on offer, and where browsing may start. */
  @Get('picker')
  async picker() {
    const listing = await this.browser.list();
    return { nativePicker: await this.nativePicker.available(), roots: listing.roots };
  }

  /** Opens the OS folder dialog on the machine running the API. */
  @Post('pick-folder')
  async pickFolder(@Body() dto: { startAt?: string }) {
    return { absolutePath: await this.nativePicker.choose(dto?.startAt) };
  }

  @Post('discover')
  async discover(@Body() dto: DiscoverRepositoriesDto) {
    return this.maintenance.discover(dto.root, dto.maxDepth ?? 5);
  }

  @Post('rescan')
  async rescan(): Promise<RepositoryView[]> {
    return (await this.maintenance.rescan()).map(toView);
  }

  @Get(':id')
  async one(@Param('id') id: string): Promise<RepositoryView> {
    return toView(await this.maintenance.require(id));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateRepositoryDto): Promise<RepositoryView> {
    let repository = await this.maintenance.require(id);
    if (dto.label !== undefined) repository = await this.maintenance.rename(id, dto.label);
    // `null` clears the pin and hands the decision back to git; omitting the key leaves
    // whatever was there. The two are different requests and the DTO keeps them apart.
    if (dto.projectOverride !== undefined) {
      repository = await this.maintenance.assignProject(id, dto.projectOverride);
    }
    return toView(repository);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Query('confirm') confirm?: string): Promise<{ removed: string }> {
    // Untracking touches nothing on disk, but people read "delete" as destructive, so the
    // response says plainly what did and did not happen.
    await this.maintenance.remove(id);
    return { removed: id };
  }
}

function toView(repository: TrackedRepository): RepositoryView {
  return {
    id: repository.id.value,
    label: repository.label,
    absolutePath: repository.absolutePath,
    profile: repository.settings.profile,
    ruleset: repository.settings.ruleset,
    layers: [...repository.settings.layers],
    configured: repository.settings.isConfigured,
    hasVerifyBlock: repository.settings.hasVerifyBlock,
    git: repository.git,
    projectOverride: repository.projectOverride,
    plansLocalOnly: repository.plansAreLocalOnly,
    addedAt: repository.addedAt.toISOString(),
    lastScannedAt: repository.lastScannedAt?.toISOString() ?? null,
  };
}
