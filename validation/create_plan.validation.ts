import type { CreatePlanRequest } from "../dtos/plan.dtp";
import { ApplicationError } from "../error/application-error";

// PostgreSQL INTEGER columns store usage from 0 to 2,147,483,647.
const MAX_USAGE_UNITS = 2_147_483_647;

function isObject(value: unknown): value is Record<string, unknown> {
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
    value >= 0 &&
    value <= MAX_USAGE_UNITS
  );
}

export function validateCreatePlan(body: unknown): CreatePlanRequest {
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
      "Limits must be integers between 0 and 2147483647.",
    );
  }

  return {
    name,
    scope: body.scope,
    rules: { monthlyAllowance, maxUnitsPerRequest },
  };
}
