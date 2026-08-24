import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

import { DomainError, InvalidValueError, NotFoundError, RefusedError } from '../kernel/domain-error';

/**
 * Maps domain errors onto HTTP without letting the transport dictate the model.
 *
 * `RefusedError` gets 409 rather than 400 on purpose: the request was well-formed and the
 * caller was entitled to make it — the *state* forbids it. That distinction is the whole
 * content of a gate, and collapsing it into "bad request" would tell the user they typed
 * something wrong when in fact the plan is not ready.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response.status(exception.getStatus()).json(
        typeof body === 'string' ? { message: body, code: 'HTTP_ERROR' } : body,
      );
      return;
    }

    if (exception instanceof DomainError) {
      const status =
        exception instanceof NotFoundError
          ? HttpStatus.NOT_FOUND
          : exception instanceof RefusedError
            ? HttpStatus.CONFLICT
            : exception instanceof InvalidValueError
              ? HttpStatus.BAD_REQUEST
              : HttpStatus.UNPROCESSABLE_ENTITY;

      response.status(status).json({
        code: exception.code,
        message: exception.message,
        details: exception.details ?? null,
      });
      return;
    }

    const error = exception as Error;
    this.logger.error(error?.message ?? 'unknown error', error?.stack);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: error?.message ?? 'unexpected error',
    });
  }
}
