import { Body, Controller, Post } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { CreateFeatureUseCase } from '../application/create-feature.use-case';

class IntentDraftDto {
  @IsString() @MaxLength(4000) problem!: string;
  @IsString() @MaxLength(2000) successSignal!: string;
  @IsArray() @IsString({ each: true }) outOfScope!: string[];
  @IsString() @MaxLength(2000) constraints!: string;
}

class CreateFeatureDto {
  @IsString() @MinLength(1) repositoryId!: string;
  @IsString() @MinLength(2) @MaxLength(80) slug!: string;
  @IsOptional() @IsString() @MaxLength(80) profile?: string;
  @IsOptional() @ValidateNested() @Type(() => IntentDraftDto) intent?: IntentDraftDto;
}

@Controller('api/features')
export class FeatureLifecycleController {
  constructor(private readonly createFeature: CreateFeatureUseCase) {}

  @Post()
  async create(@Body() dto: CreateFeatureDto) {
    return this.createFeature.execute(dto);
  }
}
