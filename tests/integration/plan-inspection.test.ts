import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Account } from "../../models/account.model";
import { ConsumptionRequest } from "../../models/consumption-request.model";
import {
  AccountMonthlyUsage,
  UserMonthlyUsage,
} from "../../models/monthly-usage.model";
import { Plan } from "../../models/plan.model";
import { User } from "../../models/user.model";
import { startTestApp } from "../helpers/test-app";
import type { TestApp } from "../helpers/test-app";

const STARTER = "00000000-0000-4000-8000-000000000001";
const BASIC = "00000000-0000-4000-8000-000000000003";
const PREMIUM = "00000000-0000-4000-8000-000000000004";
const MAX = 2_147_483_647;

let app: TestApp | undefined;
const createdAccountIds: string[] = [];

function getApp(): TestApp {
  assert.ok(app, "Test application must be initialized");
  return app;
}

// These tests deliberately use HTTP so auth middleware and routes are tested.
async function request(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  apiKey?: string,
) {
  const response = await fetch(`${getApp().baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>,
  };
}

async function createAccount() {
  const response = await request("POST", "/accounts", {
    name: `Plan inspection ${randomUUID()}`,
    planId: STARTER,
  });

  assert.equal(response.status, 201);
  const accountId = response.body.account.id as string;
  const apiKey = response.body.apiKey as string;
  assert.ok(accountId);
  assert.ok(apiKey);
  createdAccountIds.push(accountId);
  return { accountId, apiKey };
}

async function createCustomPlan(
  apiKey: string,
  scope: "account" | "user",
  monthlyAllowance: number,
  maxUnitsPerRequest: number,
) {
  const response = await request(
    "POST",
    "/plans",
    {
      name: `Custom ${scope}`,
      scope,
      rules: { monthlyAllowance, maxUnitsPerRequest },
    },
    apiKey,
  );

  assert.equal(response.status, 201);
  return response.body.plan as { id: string; version: number };
}

before(async () => {
  app = await startTestApp();
});

after(async () => {
  if (!app) return;

  try {
    for (const accountId of createdAccountIds) {
      await app.dataSource.transaction(async (manager) => {
        await manager.getRepository(ConsumptionRequest).delete({ accountId });
        await manager.getRepository(UserMonthlyUsage).delete({ accountId });
        await manager.getRepository(AccountMonthlyUsage).delete({ accountId });
        await manager.getRepository(User).delete({ accountId });
        await manager.getRepository(Account).update(
          { id: accountId },
          { planId: STARTER },
        );
        await manager.getRepository(Plan).delete({ ownerAccountId: accountId });
        await manager.getRepository(Account).delete({ id: accountId });
      });
    }
  } finally {
    await app.stop();
  }
});

test("account inspection returns current plan and reflects custom updates", async () => {
  const { accountId, apiKey } = await createAccount();

  const unauthenticated = await request("GET", "/accounts/me/plan");
  assert.equal(unauthenticated.status, 401);

  const initial = await request("GET", "/accounts/me/plan", undefined, apiKey);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.account.id, accountId);
  assert.equal(initial.body.account.planId, STARTER);
  assert.equal(initial.body.plan.isPredefined, true);
  assert.deepEqual(initial.body.plan.rules, {
    monthlyAllowance: 10_000,
    maxUnitsPerRequest: 100,
  });

  const custom = await createCustomPlan(apiKey, "account", 30, 10);
  const switched = await request(
    "PUT", "/accounts/me/plan", { planId: custom.id }, apiKey,
  );
  assert.equal(switched.status, 200);

  const updated = await request(
    "PUT",
    `/plans/${custom.id}`,
    {
      name: "Updated account plan",
      expectedVersion: 1,
      rules: { monthlyAllowance: 45, maxUnitsPerRequest: 15 },
    },
    apiKey,
  );
  assert.equal(updated.status, 200);

  const active = await request("GET", "/accounts/me/plan", undefined, apiKey);
  assert.equal(active.status, 200);
  assert.equal(active.body.account.planId, custom.id);
  assert.equal(active.body.plan.id, custom.id);
  assert.equal(active.body.plan.isPredefined, false);
  assert.equal(active.body.plan.version, 2);
  assert.deepEqual(active.body.plan.rules, {
    monthlyAllowance: 45,
    maxUnitsPerRequest: 15,
  });
});

test("user inspection reflects plan assignment changes and live rules", async () => {
  const { accountId, apiKey } = await createAccount();
  const created = await request(
    "POST", "/users", { externalId: "plan-view", planId: BASIC }, apiKey,
  );
  assert.equal(created.status, 201);
  const userId = created.body.user.id as string;

  const initial = await request("GET", `/users/${userId}`, undefined, apiKey);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.user.accountId, accountId);
  assert.equal(initial.body.user.planId, BASIC);
  assert.deepEqual(initial.body.plan.rules, {
    monthlyAllowance: 1_000,
    maxUnitsPerRequest: 20,
  });

  const switched = await request(
    "PUT", `/users/${userId}/plan`, { planId: PREMIUM }, apiKey,
  );
  assert.equal(switched.status, 200);

  const premium = await request("GET", `/users/${userId}`, undefined, apiKey);
  assert.equal(premium.status, 200);
  assert.equal(premium.body.user.planId, PREMIUM);
  assert.equal(premium.body.plan.rules.monthlyAllowance, 10_000);

  const custom = await createCustomPlan(apiKey, "user", 50, 5);
  const assigned = await request(
    "PUT", `/users/${userId}/plan`, { planId: custom.id }, apiKey,
  );
  assert.equal(assigned.status, 200);

  const updated = await request(
    "PUT",
    `/plans/${custom.id}`,
    {
      name: "Updated user plan",
      expectedVersion: 1,
      rules: { monthlyAllowance: 65, maxUnitsPerRequest: 6 },
    },
    apiKey,
  );
  assert.equal(updated.status, 200);

  const active = await request("GET", `/users/${userId}`, undefined, apiKey);
  assert.equal(active.status, 200);
  assert.equal(active.body.user.planId, custom.id);
  assert.equal(active.body.plan.version, 2);
  assert.deepEqual(active.body.plan.rules, {
    monthlyAllowance: 65,
    maxUnitsPerRequest: 6,
  });
});

test("user inspection blocks missing keys and cross-account reads", async () => {
  const owner = await createAccount();
  const foreign = await createAccount();

  const created = await request(
    "POST", "/users", { externalId: "private-user", planId: BASIC }, owner.apiKey,
  );
  assert.equal(created.status, 201);
  const userId = created.body.user.id as string;

  const missingKey = await request("GET", `/users/${userId}`);
  assert.equal(missingKey.status, 401);

  const foreignRead = await request(
    "GET", `/users/${userId}`, undefined, foreign.apiKey,
  );
  assert.equal(foreignRead.status, 404);
  assert.equal(foreignRead.body.error.code, "USER_NOT_FOUND");

  const invalidId = await request(
    "GET", "/users/not-a-uuid", undefined, owner.apiKey,
  );
  assert.equal(invalidId.status, 400);
  assert.equal(invalidId.body.error.code, "INVALID_USER_ID");
});

test("plan max integer boundary works end-to-end without overflow", async () => {
  const { apiKey } = await createAccount();

  for (const rules of [
    { monthlyAllowance: MAX + 1, maxUnitsPerRequest: 1 },
    { monthlyAllowance: MAX, maxUnitsPerRequest: MAX + 1 },
  ]) {
    const invalid = await request(
      "POST",
      "/plans",
      { name: "Invalid overflow", scope: "account", rules },
      apiKey,
    );
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, "INVALID_PLAN_RULES");
  }

  const accountPlan = await createCustomPlan(apiKey, "account", MAX, MAX);
  const invalidUpdate = await request(
    "PUT",
    `/plans/${accountPlan.id}`,
    {
      name: "Invalid update",
      expectedVersion: 1,
      rules: { monthlyAllowance: MAX + 1, maxUnitsPerRequest: MAX },
    },
    apiKey,
  );
  assert.equal(invalidUpdate.status, 400);

  const userPlan = await createCustomPlan(apiKey, "user", MAX, MAX);
  const assigned = await request(
    "PUT", "/accounts/me/plan", { planId: accountPlan.id }, apiKey,
  );
  assert.equal(assigned.status, 200);

  const created = await request(
    "POST", "/users", { externalId: "boundary-user", planId: userPlan.id }, apiKey,
  );
  assert.equal(created.status, 201);
  const userId = created.body.user.id as string;

  const accepted = await request(
    "POST", "/consumption",
    { userId, requestId: randomUUID(), units: MAX }, apiKey,
  );
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.accepted, true);
  assert.equal(accepted.body.accountUsage.used, MAX);
  assert.equal(accepted.body.accountUsage.remaining, 0);
  assert.equal(accepted.body.userUsage.used, MAX);

  const rejected = await request(
    "POST", "/consumption",
    { userId, requestId: randomUUID(), units: 1 }, apiKey,
  );
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.accepted, false);
  assert.equal(rejected.body.rejection.rule, "monthly_allowance");
  assert.equal(rejected.body.accountUsage.used, MAX);
});
