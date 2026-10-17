import type { CreatePlanRequest } from "../dtos/plan.dtp";
import { ApplicationError } from "../error/application-error";

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isValidLimit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

export function validateCreatePlan(
  body: unknown,
): CreatePlanRequest {
  if (!isObject(body)) {
    throw new ApplicationError(
      "INVALID_PLAN_RULES",
      "Request body must be a JSON object.",
    );
  }

  if (typeof body.name !== "string") {
    throw new ApplicationError(
      "INVALID_PLAN_NAME",
      "Plan name is required and must be a string.",
    );
  }

  const name = body.name.trim();

  if (name.length === 0 || name.length > 100) {
    throw new ApplicationError(
      "INVALID_PLAN_NAME",
      "Plan name must contain between 1 and 100 characters.",
    );
  }

  if (body.scope !== "account" && body.scope !== "user") {
    throw new ApplicationError(
      "INVALID_PLAN_RULES",
      "Plan scope must be account or user.",
    );
  }

  if (!isObject(body.rules)) {
    throw new ApplicationError(
      "INVALID_PLAN_RULES",
      "Plan rules must be a JSON object.",
    );
  }

  const { monthlyAllowance, maxUnitsPerRequest } = body.rules;

  if (
    !isValidLimit(monthlyAllowance) ||
    !isValidLimit(maxUnitsPerRequest)
  ) {
    throw new ApplicationError(
      "INVALID_PLAN_RULES",
      "Limits must be non-negative safe integers.",
    );
  }

  return {
    name,
    scope: body.scope,
    rules: {
      monthlyAllowance,
      maxUnitsPerRequest,
    },
  };
}