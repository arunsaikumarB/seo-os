export type ErrorCode =
  | 'AUTH_INVALID_TOKEN'
  | 'AUTH_FORBIDDEN'
  | 'TENANT_MISMATCH'
  | 'VALIDATION_ERROR'
  | 'RESOURCE_NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: ErrorCode;
  errors?: Array<{ field: string; message: string }>;
  traceId?: string;
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly errors?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'AppError';
  }

  toProblemDetails(instance?: string, traceId?: string): ProblemDetails {
    return {
      type: `https://docs.seoos.io/errors/${this.code.toLowerCase().replace(/_/g, '-')}`,
      title: this.name,
      status: this.status,
      detail: this.message,
      instance,
      code: this.code,
      errors: this.errors,
      traceId,
    };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
