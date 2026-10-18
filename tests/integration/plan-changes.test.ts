import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  after,
  afterEach,
  before,
  beforeEach,
  test,
} from "node:test";

import { Account } from "../../models/account.model";
import { User } from "../../models/user.model";
import { Plan } from "../../models/plan.model";
import {
  ConsumptionRequest,
} from "../../models/consumption-request.model";
import type {
  ConsumptionResult,
} from "../../models/consumption-request.model";
import {
  AccountMonthlyUsage,
  UserMonthlyUsage,
} from "../../models/monthly-usage.model";
import {
  generateApiKey,
  hashApiKey,
} from "../../security/api-key";
import { startTestApp } from "../helpers/test-app";
import type { TestApp } from "../helpers/test-app";

type Scope = "account" | "user";

interface UsageResponse {
  usage: {
    used: number;
    remaining: number;
    monthlyAllowance: number;
  };
}

interface PlanResponse {
  plan: {
    id: string;
    version: number;
  };
}

const starterPlanId =
  "00000000-0000-4000-8000-000000000001";
const proPlanId =
  "00000000-0000-4000-8000-000000000002";
const basicPlanId =
  "00000000-0000-4000-8000-000000000003";
const premiumPlanId =
  "00000000-0000-4000-8000-000000000004";

let app: TestApp | undefined;
let accountId: string | undefined;
let userId: string;
let apiKey: string;

function getApp(): TestApp {
  assert.ok(app);
  return app;
}

function getAccountId(): string {
  assert.ok(accountId);
  return accountId;
}

before(async () => {
  app = await startTestApp();
});

beforeEach(async () => {
  accountId = undefined;
  apiKey = generateApiKey();

  const dataSource = getApp().dataSource;

  const accountRepository = dataSource.getRepository(Account);
  const account = await accountRepository.save(
    accountRepository.create({
      name: "Plan Changes Test",
      planId: starterPlanId,
      apiKeyHash: hashApiKey(apiKey),
    }),
  );

  accountId = account.id;

  const userRepository = dataSource.getRepository(User);
  const user = await userRepository.save(
    userRepository.create({
      accountId: account.id,
      externalId: randomUUID(),
      planId: basicPlanId,
    }),
  );

  userId = user.id;
});

afterEach(async () => {
  if (!app || !accountId) {
    return;
  }

  const id = accountId;

  await app.dataSource.transaction(async (manager) => {
    await manager
      .getRepository(ConsumptionRequest)
      .delete({ accountId: id });

    await manager
      .getRepository(UserMonthlyUsage)
      .delete({ accountId: id });

    await manager
      .getRepository(AccountMonthlyUsage)
      .delete({ accountId: id });

    await manager
      .getRepository(User)
      .delete({ accountId: id });

    await manager.getRepository(Account).update(
      { id },
      { planId: starterPlanId },
    );

    await manager
      .getRepository(Plan)
      .delete({ ownerAccountId: id });

    await manager
      .getRepository(Account)
      .delete({ id });
  });

  accountId = undefined;
});

after(async () => {
  if (app) {
    await app.stop();
  }
});

async function request<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  expectedStatus = 200,
): Promise<T> {
  const response = await fetch(
    `${getApp().baseUrl}${path}`,
    {
      method,
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: body === undefined
        ? undefined
        : JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    },
  );

  const result = await response.json();

  assert.equal(
    response.status,
    expectedStatus,
    `Unexpected response: ${JSON.stringify(result)}`,
  );

  return result as T;
}

function consume(
  units: number,
  requestId: string = randomUUID(),
): Promise<ConsumptionResult> {
  return request<ConsumptionResult>(
    "POST",
    "/consumption",
    { userId, requestId, units },
  );
}

async function assignPlan(
  scope: Scope,
  planId: string,
): Promise<void> {
  const path = scope === "account"
    ? "/accounts/me/plan"
    : `/users/${userId}/plan`;

  await request("PUT", path, { planId });
}

function getUsage(
  scope: Scope,
  month: string,
): Promise<UsageResponse> {
  const path = scope === "account"
    ? "/usage/account"
    : `/usage/users/${userId}`;

  return request<UsageResponse>(
    "GET",
    `${path}?month=${month.slice(0, 7)}`,
  );
}

async function assertStoredUsage(
  month: ConsumptionResult["month"],
  expectedUnits: number,
): Promise<void> {
  const dataSource = getApp().dataSource;

  const accountUsage = await dataSource
    .getRepository(AccountMonthlyUsage)
    .findOneBy({
      accountId: getAccountId(),
      month,
    });

  const userUsage = await dataSource
    .getRepository(UserMonthlyUsage)
    .findOneBy({
      accountId: getAccountId(),
      userId,
      month,
    });

  assert.ok(accountUsage);
  assert.ok(userUsage);
  assert.equal(accountUsage.consumedUnits, expectedUnits);
  assert.equal(userUsage.consumedUnits, expectedUnits);
}

for (const scope of ["account", "user"] as const) {
  test(`switching the ${scope} plan preserves consumed units`, async () => {
    const first = await consume(10);
    assert.equal(first.accepted, true);

    const nextPlanId = scope === "account"
      ? proPlanId
      : premiumPlanId;

    const allowance = scope === "account"
      ? 100_000
      : 10_000;

    await assignPlan(scope, nextPlanId);

    const usage = await getUsage(scope, first.month);

    assert.deepEqual(usage.usage, {
      used: 10,
      remaining: allowance - 10,
      monthlyAllowance: allowance,
    });

    await assertStoredUsage(first.month, 10);

    const next = await consume(5);

    assert.equal(next.accepted, true);
    assert.equal(
      next.month,
      first.month,
      "UTC month changed during the test; rerun it",
    );

    const updatedUsage = scope === "account"
      ? next.accountUsage
      : next.userUsage;

    assert.deepEqual(updatedUsage, {
      used: 15,
      remaining: allowance - 15,
    });

    await assertStoredUsage(next.month, 15);
  });

  test(`updating the ${scope} plan applies new limits and preserves history`, async () => {
    const created = await request<PlanResponse>(
      "POST",
      "/plans",
      {
        name: "Adjustable Test Plan",
        scope,
        rules: {
          monthlyAllowance: 30,
          maxUnitsPerRequest: 20,
        },
      },
      201,
    );

    assert.equal(created.plan.version, 1);
    await assignPlan(scope, created.plan.id);

    const first = await consume(10);
    assert.equal(first.accepted, true);

    const requests = getApp().dataSource
      .getRepository(ConsumptionRequest);

    const original = await requests.findOneBy({
      accountId: getAccountId(),
      requestId: first.requestId,
    });

    assert.ok(original);

    const reduced = await request<PlanResponse>(
      "PUT",
      `/plans/${created.plan.id}`,
      {
        name: "Adjustable Test Plan",
        expectedVersion: 1,
        rules: {
          monthlyAllowance: 5,
          maxUnitsPerRequest: 20,
        },
      },
    );

    assert.equal(reduced.plan.version, 2);

    const usage = await getUsage(scope, first.month);

    assert.deepEqual(usage.usage, {
      used: 10,
      remaining: 0,
      monthlyAllowance: 5,
    });

    const rejected = await consume(1);

    assert.equal(rejected.month, first.month);
    assert.equal(rejected.accepted, false);
    assert.deepEqual(rejected.rejection, {
      scope,
      rule: "monthly_allowance",
      limit: 5,
      usedBefore: 10,
    });

    await assertStoredUsage(first.month, 10);

    // A retry returns the original result despite the plan change.
    const replay = await consume(10, first.requestId);
    assert.deepEqual(replay, first);

    const savedAfterUpdate = await requests.findOneBy({
      accountId: getAccountId(),
      requestId: first.requestId,
    });

    assert.ok(savedAfterUpdate);
    assert.deepEqual(savedAfterUpdate.result, original.result);
    assert.deepEqual(
      savedAfterUpdate.accountPlan,
      original.accountPlan,
    );
    assert.deepEqual(
      savedAfterUpdate.userPlan,
      original.userPlan,
    );

    const increased = await request<PlanResponse>(
      "PUT",
      `/plans/${created.plan.id}`,
      {
        name: "Adjustable Test Plan",
        expectedVersion: 2,
        rules: {
          monthlyAllowance: 30,
          maxUnitsPerRequest: 20,
        },
      },
    );

    assert.equal(increased.plan.version, 3);

    const accepted = await consume(5);

    assert.equal(accepted.month, first.month);
    assert.equal(accepted.accepted, true);

    const updatedUsage = scope === "account"
      ? accepted.accountUsage
      : accepted.userUsage;

    assert.deepEqual(updatedUsage, {
      used: 15,
      remaining: 15,
    });

    await assertStoredUsage(first.month, 15);

    // Original acceptance + rejection + new acceptance.
    // The replay must not create a fourth record.
    assert.equal(
      await requests.countBy({
        accountId: getAccountId(),
      }),
      3,
    );
  });
}