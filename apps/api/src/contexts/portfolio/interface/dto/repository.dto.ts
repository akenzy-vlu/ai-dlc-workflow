import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class RegisterRepositoryDto {
  @IsString()
  @MinLength(1)
  absolutePath!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}

export class UpdateRepositoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label?: string;

  /** A project key to pin this checkout to, or null to let git decide again. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  projectOverride?: string | null;
}

export class DiscoverRepositoriesDto {
  @IsString()
  @MinLength(1)
  root!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  maxDepth?: number;
}

export interface RepositoryView {
  id: string;
  label: string;
  absolutePath: string;
  profile: string;
  ruleset: number | null;
  layers: string[];
  configured: boolean;
  hasVerifyBlock: boolean;
  git: {
    sha: string;
    branch: string;
    aiDirTracked: boolean;
    aiDirDirty: boolean;
    remoteUrl: string | null;
    isWorktree: boolean;
  } | null;
  projectOverride: string | null;
  plansLocalOnly: boolean;
  addedAt: string;
  lastScannedAt: string | null;
}
