import type { UpdatePlanRequest } from "../dtos/plan.dtp";
import { ApplicationError } from "../error/application-error";

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

export function validateUpdatePlan(body: unknown): UpdatePlanRequest {
  if (!isObject(body)) {
    throw new ApplicationError(
      "INVALID_PLAN_RULES",
      "Request body must be a JSON object.",
    );
  }

  if ("scope" in body || "ownerAccountId" in body) {
    throw new ApplicationError(
      "INVALID_PLAN_RULES",
      "Plan scope and ownership cannot be changed.",
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

  const expectedVersion = body.expectedVersion;
  if (
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    throw new ApplicationError(
      "INVALID_PLAN_VERSION",
      "Expected version must be a positive safe integer.",
    );
  }

  return {
    name,
    rules: { monthlyAllowance, maxUnitsPerRequest },
    expectedVersion,
  };
}
