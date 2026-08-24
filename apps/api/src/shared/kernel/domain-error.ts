/**
 * Domain errors are part of the model, not of the transport. They carry a stable `code`
 * so the interface layer can map them to an HTTP status without string-matching messages.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
  }
}

/** A value object was handed something the model cannot represent. */
export class InvalidValueError extends DomainError {
  readonly code = 'INVALID_VALUE';
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

/** An aggregate that must exist does not. */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  constructor(what: string, id: string) {
    super(`${what} not found: ${id}`, { what, id });
  }
}

/**
 * The operation is legal in the model but forbidden in the current state.
 *
 * This is the error the AI-DLC controller itself produces ("refused: ..."), and the
 * console must surface it verbatim rather than dress it up: a refusal is information.
 */
export class RefusedError extends DomainError {
  readonly code = 'REFUSED';
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}
