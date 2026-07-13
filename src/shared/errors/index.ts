export type ErrorCode =
  | "bad_request"
  | "forbidden"
  | "integration_error"
  | "invalid_transition"
  | "not_found"
  | "unauthorized"
  | "validation_error";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toErrorResponse(error: unknown) {
  if (isAppError(error)) {
    return {
      body: { error: { code: error.code, message: error.message } },
      status: error.status,
    };
  }

  return {
    body: { error: { code: "internal_error", message: "Unexpected server error." } },
    status: 500,
  };
}
