import type { ChangePlanRequest } from "../dtos/change-plan.dto";
import { ApplicationError } from "../error/application-error";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateChangePlan(
  body: unknown,
): ChangePlanRequest {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new ApplicationError(
      "INVALID_PLAN_ID",
      "Request body must be a JSON object.",
    );
  }

  if (
    !("planId" in body) ||
    typeof body.planId !== "string" ||
    !UUID_PATTERN.test(body.planId)
  ) {
    throw new ApplicationError(
      "INVALID_PLAN_ID",
      "Plan ID must be a valid UUID.",
    );
  }

  return {
    planId: body.planId,
  };
}