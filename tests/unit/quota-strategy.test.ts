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

test("rejects consumption above the account per-request limit", () => {
  const result = evaluateQuota({
    units: 101,
    accountRules: {
      monthlyAllowance: 10_000,
      maxUnitsPerRequest: 100,
    },
    userRules: {
      monthlyAllowance: 1_000,
      maxUnitsPerRequest: 200,
    },
    accountConsumedUnits: 500,
    userConsumedUnits: 100,
  });

  assert.deepEqual(result, {
    scope: "account",
    rule: "max_units_per_request",
    limit: 100,
    usedBefore: 500,
  });
});

test("rejects consumption above the user per-request limit", () => {
  const result = evaluateQuota({
    units: 21,
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

  assert.deepEqual(result, {
    scope: "user",
    rule: "max_units_per_request",
    limit: 20,
    usedBefore: 100,
  });
});