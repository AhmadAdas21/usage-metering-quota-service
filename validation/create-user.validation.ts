import type { CreateUserRequest } from "../dtos/user.dto";
import { ApplicationError } from "../error/application-error";

export function validateCreateUser(
  body: unknown,
): CreateUserRequest {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new ApplicationError(
      "INVALID_EXTERNAL_ID",
      "Request body must be a JSON object.",
    );
  }

  if (
    !("externalId" in body) ||
    typeof body.externalId !== "string"
  ) {
    throw new ApplicationError(
      "INVALID_EXTERNAL_ID",
      "External ID is required and must be a string.",
    );
  }

  if (
    !("planId" in body) ||
    typeof body.planId !== "string"
  ) {
    throw new ApplicationError(
      "INVALID_PLAN_ID",
      "Plan ID is required and must be a string.",
    );
  }

  return {
    externalId: body.externalId,
    planId: body.planId,
  };
}