export type ApplicationErrorCode =
  | "INVALID_ACCOUNT_NAME"
  | "INVALID_PLAN_ID"
  | "PLAN_NOT_AVAILABLE"
  | "INVALID_EXTERNAL_ID"
  | "USER_ALREADY_EXISTS"
    | "INVALID_PLAN_NAME"
  | "INVALID_PLAN_RULES";

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}