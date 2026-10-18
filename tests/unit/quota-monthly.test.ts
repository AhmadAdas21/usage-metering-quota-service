import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateQuota } from "../../services/quota-strategy";

test("rejects when account monthly balance is insufficient", () => {
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
    accountConsumedUnits: 9_995,
    userConsumedUnits: 100,
  });

  assert.deepEqual(result, {
    scope: "account",
    rule: "monthly_allowance",
    limit: 10_000,
    usedBefore: 9_995,
  });
});

test("rejects when user monthly balance is insufficient", () => {
  const result = evaluateQuota({
    units: 11,
    accountRules: {
      monthlyAllowance: 10_000,
      maxUnitsPerRequest: 100,
    },
    userRules: {
      monthlyAllowance: 1_000,
      maxUnitsPerRequest: 20,
    },
    accountConsumedUnits: 990,
    userConsumedUnits: 990,
  });

  assert.deepEqual(result, {
    scope: "user",
    rule: "monthly_allowance",
    limit: 1_000,
    usedBefore: 990,
  });
});

test("accepts consumption equal to both remaining monthly balances", () => {
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
    accountConsumedUnits: 9_990,
    userConsumedUnits: 990,
  });

  assert.equal(result, null);
});

test("rejects when user usage exceeds a reduced monthly allowance", () => {
  const result = evaluateQuota({
    units: 1,
    accountRules: {
      monthlyAllowance: 10_000,
      maxUnitsPerRequest: 100,
    },
    userRules: {
      monthlyAllowance: 500,
      maxUnitsPerRequest: 20,
    },
    accountConsumedUnits: 800,
    userConsumedUnits: 800,
  });

  assert.deepEqual(result, {
    scope: "user",
    rule: "monthly_allowance",
    limit: 500,
    usedBefore: 800,
  });
});