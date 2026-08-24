import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { TICKET_ACTIONS } from '../../../../shared/kernel';

/**
 * `by` is optional here, and that is not laxness.
 *
 * Behind an authenticating proxy the client has nothing to send — the name comes from the
 * request's identity header and the body is ignored. Without one, `resolveActingIdentity`
 * rejects a missing name itself. Requiring it in the DTO would force every trusted-mode
 * client to send a value that is thrown away.
 */
export class ApproveGateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  by?: string;
}

export class ReopenGateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  by?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class TransitionTicketDto {
  @IsIn(Object.keys(TICKET_ACTIONS))
  action!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  by?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Skips review. The controller records the bypass in the audit trail. */
  @IsOptional()
  @IsBoolean()
  noReview?: boolean;
}
