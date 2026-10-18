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

let app: TestApp | undefined;
let accountId: string | undefined;
let userId: string;
let apiKey: string;

function getApp(): TestApp {
  assert.ok(app, "Test application must be initialized");
  return app;
}

function getAccountId(): string {
  assert.ok(accountId, "Test account must be initialized");
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
      name: "Consumption Integration Test",
      planId: "00000000-0000-4000-8000-000000000001",
      apiKeyHash: hashApiKey(apiKey),
    }),
  );

  accountId = account.id;

  const userRepository = dataSource.getRepository(User);
  const user = await userRepository.save(
    userRepository.create({
      accountId: account.id,
      externalId: randomUUID(),
      planId: "00000000-0000-4000-8000-000000000003",
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

async function postConsumption(
  requestId: string,
  units: number,
): Promise<Response> {
  return fetch(`${getApp().baseUrl}/consumption`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      userId,
      requestId,
      units,
    }),
    signal: AbortSignal.timeout(5_000),
  });
}

async function consume(
  requestId: string,
  units: number,
): Promise<ConsumptionResult> {
  const response = await postConsumption(requestId, units);
  const body = await response.json();

  assert.equal(
    response.status,
    200,
    `Unexpected consumption response: ${JSON.stringify(body)}`,
  );

  return body as ConsumptionResult;
}

async function assertStoredState(
  result: ConsumptionResult,
  expectedUnits: number,
  expectedRequestCount: number,
): Promise<void> {
  const dataSource = getApp().dataSource;
  const id = getAccountId();

  const accountUsage = await dataSource
    .getRepository(AccountMonthlyUsage)
    .findOneBy({
      accountId: id,
      month: result.month,
    });

  const userUsage = await dataSource
    .getRepository(UserMonthlyUsage)
    .findOneBy({
      accountId: id,
      userId,
      month: result.month,
    });

  assert.equal(accountUsage?.consumedUnits ?? 0, expectedUnits);
  assert.equal(userUsage?.consumedUnits ?? 0, expectedUnits);

  const requests = dataSource.getRepository(ConsumptionRequest);

  assert.equal(
    await requests.countBy({ accountId: id }),
    expectedRequestCount,
  );

  const savedRequest = await requests.findOneBy({
    accountId: id,
    requestId: result.requestId,
  });

  assert.ok(savedRequest);
  assert.deepEqual(savedRequest.result, result);
}

test("accepted consumption updates both balances and stores its result", async () => {
  const result = await consume(randomUUID(), 10);

  assert.equal(result.accepted, true);
  assert.equal(result.rejection, null);
  assert.equal(result.userId, userId);
  assert.equal(result.units, 10);

  assert.deepEqual(result.accountUsage, {
    used: 10,
    remaining: 9_990,
  });

  assert.deepEqual(result.userUsage, {
    used: 10,
    remaining: 990,
  });

  await assertStoredState(result, 10, 1);
});

test("replaying an accepted request returns the original result without double counting", async () => {
  const requestId = randomUUID();

  const first = await consume(requestId, 10);
  const replay = await consume(requestId, 10);

  assert.equal(first.accepted, true);

  // Includes processedAt and the original usage snapshot.
  assert.deepEqual(replay, first);

  await assertStoredState(first, 10, 1);
});

test("reusing a request ID with different units returns conflict without changing usage", async () => {
  const requestId = randomUUID();
  const first = await consume(requestId, 10);

  assert.equal(first.accepted, true);

  const response = await postConsumption(requestId, 11);
  const body = (await response.json()) as {
    error: { code: string };
  };

  assert.equal(response.status, 409);
  assert.equal(body.error.code, "REQUEST_ID_CONFLICT");

  await assertStoredState(first, 10, 1);
});

test("replaying a rejected request preserves its result and consumes nothing", async () => {
  const requestId = randomUUID();

  // Basic permits at most 20 units per request.
  const first = await consume(requestId, 21);
  const replay = await consume(requestId, 21);

  assert.equal(first.accepted, false);

  assert.deepEqual(first.rejection, {
    scope: "user",
    rule: "max_units_per_request",
    limit: 20,
    usedBefore: 0,
  });

  assert.deepEqual(first.accountUsage, {
    used: 0,
    remaining: 10_000,
  });

  assert.deepEqual(first.userUsage, {
    used: 0,
    remaining: 1_000,
  });

  assert.deepEqual(replay, first);

  await assertStoredState(first, 0, 1);
});