import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateQuota } from "../../services/quota-strategy";

test("accepts consumption within both account and user limits", () => {
  const result = evaluateQuota({
    units: 10,
    accountRules: {
      monthlyAllowance: 10_000,
      maxUnitsPerRequest: 100,
    },
    userRules: {
      monthlyAllowance: 1_000,
      maxUnitsPerRequest: 20,
    },
    accountConsumedUnits: 500,
    userConsumedUnits: 100,
  });

  assert.equal(result, null);
});