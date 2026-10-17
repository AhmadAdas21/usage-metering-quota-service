import type { CreateAccountRequest } from "../dtos/account.dto";
import { ApplicationError } from "../error/application-error";

export function validateCreateAccount(
  body: unknown,
): CreateAccountRequest {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new ApplicationError(
      "INVALID_ACCOUNT_NAME",
      "Request body must be a JSON object.",
    );
  }

  if (!("name" in body) || typeof body.name !== "string") {
    throw new ApplicationError(
      "INVALID_ACCOUNT_NAME",
      "Account name is required and must be a string.",
    );
  }

  if (!("planId" in body) || typeof body.planId !== "string") {
    throw new ApplicationError("INVALID_PLAN_ID","Plan ID is required and must be a string.", );
  }

  return {
    name: body.name,
    planId: body.planId,
  };
}