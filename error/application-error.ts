export type ApplicationErrorCode =
  | "INVALID_ACCOUNT_NAME"
  | "INVALID_PLAN_ID"
  | "PLAN_NOT_AVAILABLE"
  | "INVALID_EXTERNAL_ID"
  | "USER_ALREADY_EXISTS"
    | "INVALID_PLAN_NAME"
  | "INVALID_PLAN_RULES" |"INVALID_PLAN_VERSION"
   | "PLAN_NOT_FOUND"
  | "PLAN_VERSION_CONFLICT" | "ACCOUNT_NOT_FOUND"
  | "INVALID_USER_ID"
| "USER_NOT_FOUND"| "INVALID_REQUEST_ID"
| "INVALID_UNITS"| "REQUEST_ID_CONFLICT"  | "INVALID_USAGE_MONTH"
  | "INVALID_PAGE"
  | "INVALID_PAGE_SIZE";


export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}