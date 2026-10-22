import { test } from "node:test";
import assert from "node:assert/strict";

import { ApplicationError } from "../../error/application-error";
import { validateCreatePlan } from "../../validation/create_plan.validation";
import { validateUpdatePlan } from "../../validation/update_plan.validation";

const MAX = 2_147_483_647;
const validRules = {
  monthlyAllowance: 100,
  maxUnitsPerRequest: 10,
};

function expectInvalidPlanRules(operation: () => unknown): void {
  assert.throws(
    operation,
    (error: unknown) =>
      error instanceof ApplicationError &&
      error.code === "INVALID_PLAN_RULES",
  );
}

for (const field of ["monthlyAllowance", "maxUnitsPerRequest"] as const) {
  test(`create plan rejects ${field} above the PostgreSQL integer limit`, () => {
    expectInvalidPlanRules(() =>
      validateCreatePlan({
        name: "Invalid plan",
        scope: "account",
        rules: { ...validRules, [field]: MAX + 1 },
      }),
    );
  });

  test(`update plan rejects ${field} above the PostgreSQL integer limit`, () => {
    expectInvalidPlanRules(() =>
      validateUpdatePlan({
        name: "Invalid update",
        expectedVersion: 1,
        rules: { ...validRules, [field]: MAX + 1 },
      }),
    );
  });
}

test("create plan accepts exact PostgreSQL integer maximum", () => {
  const plan = validateCreatePlan({
    name: "Large plan",
    scope: "account",
    rules: { monthlyAllowance: MAX, maxUnitsPerRequest: MAX },
  });

  assert.deepEqual(plan.rules, {
    monthlyAllowance: MAX,
    maxUnitsPerRequest: MAX,
  });
});

test("update plan accepts zero limits to pause consumption", () => {
  const plan = validateUpdatePlan({
    name: "Paused plan",
    expectedVersion: 1,
    rules: { monthlyAllowance: 0, maxUnitsPerRequest: 0 },
  });

  assert.deepEqual(plan.rules, {
    monthlyAllowance: 0,
    maxUnitsPerRequest: 0,
  });
});
