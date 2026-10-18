import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

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

interface Fixture {
  accountId: string;
  apiKey: string;
  userIds: string[];
}

let app: TestApp | undefined;

const accountIds: string[] = [];

function getApp(): TestApp {
  assert.ok(app, "Test application must be initialized");
  return app;
}

before(async () => {
  app = await startTestApp();
});

after(async () => {
  if (!app) {
    return;
  }

  try {
    await app.dataSource.transaction(async (manager) => {
      for (const accountId of accountIds) {
        await manager
          .getRepository(ConsumptionRequest)
          .delete({ accountId });

        await manager
          .getRepository(UserMonthlyUsage)
          .delete({ accountId });

        await manager
          .getRepository(AccountMonthlyUsage)
          .delete({ accountId });

        await manager
          .getRepository(User)
          .delete({ accountId });

        // Remove the reference to the custom account plan.
        await manager.getRepository(Account).update(
          { id: accountId },
          {
            planId:
              "00000000-0000-4000-8000-000000000001",
          },
        );

        await manager
          .getRepository(Plan)
          .delete({ ownerAccountId: accountId });

        await manager
          .getRepository(Account)
          .delete({ id: accountId });
      }
    });
  } finally {
    await app.stop();
  }
});

async function createFixture(
  accountAllowance: number,
  userAllowance: number,
  userCount: number,
): Promise<Fixture> {
  const dataSource = getApp().dataSource;
  const apiKey = generateApiKey();

  const fixture = await dataSource.transaction(
    async (manager): Promise<Fixture> => {
      const accountRepository = manager.getRepository(Account);
      const planRepository = manager.getRepository(Plan);
      const userRepository = manager.getRepository(User);

      const account = await accountRepository.save(
        accountRepository.create({
          name: "Concurrency Test Account",
          planId:
            "00000000-0000-4000-8000-000000000001",
          apiKeyHash: hashApiKey(apiKey),
        }),
      );

      const accountPlan = await planRepository.save(
        planRepository.create({
          name: "Concurrency Account Plan",
          scope: "account",
          ownerAccountId: account.id,
          version: 1,
          rules: {
            monthlyAllowance: accountAllowance,
            maxUnitsPerRequest: 10,
          },
        }),
      );

      const userPlan = await planRepository.save(
        planRepository.create({
          name: "Concurrency User Plan",
          scope: "user",
          ownerAccountId: account.id,
          version: 1,
          rules: {
            monthlyAllowance: userAllowance,
            maxUnitsPerRequest: 10,
          },
        }),
      );

      await accountRepository.update(
        { id: account.id },
        { planId: accountPlan.id },
      );

      const userIds: string[] = [];

      for (let index = 0; index < userCount; index += 1) {
        const user = await userRepository.save(
          userRepository.create({
            accountId: account.id,
            externalId: randomUUID(),
            planId: userPlan.id,
          }),
        );

        userIds.push(user.id);
      }

      return {
        accountId: account.id,
        apiKey,
        userIds,
      };
    },
  );

  accountIds.push(fixture.accountId);
  return fixture;
}

async function consume(
  fixture: Fixture,
  userId: string,
  requestId: string,
): Promise<ConsumptionResult> {
  const response = await fetch(
    `${getApp().baseUrl}/consumption`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": fixture.apiKey,
      },
      body: JSON.stringify({
        userId,
        requestId,
        units: 10,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  const body = await response.json();

  assert.equal(
    response.status,
    200,
    `Unexpected response: ${JSON.stringify(body)}`,
  );

  return body as ConsumptionResult;
}

async function runBatch(
  fixture: Fixture,
  requestId?: string,
): Promise<ConsumptionResult[]> {
  // Start all requests before waiting for their completion.
  // allSettled ensures cleanup cannot race with unfinished requests.
  const outcomes = await Promise.allSettled(
    Array.from({ length: 12 }, (_, index) =>
      consume(
        fixture,
        fixture.userIds[index % fixture.userIds.length],
        requestId ?? randomUUID(),
      ),
    ),
  );

  const results: ConsumptionResult[] = [];

  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      throw outcome.reason;
    }

    results.push(outcome.value);
  }

  return results;
}

async function assertDatabaseState(
  fixture: Fixture,
  results: ConsumptionResult[],
  expectedUnits: number,
  expectedRequests: number,
): Promise<void> {
  const dataSource = getApp().dataSource;

  // Avoid silently combining different UTC calendar months.
  const months = new Set(results.map((result) => result.month));
  assert.equal(
    months.size,
    1,
    "The batch crossed a UTC month boundary; rerun this test",
  );

  const month = results[0].month;

  const accountUsage = await dataSource
    .getRepository(AccountMonthlyUsage)
    .findOneBy({
      accountId: fixture.accountId,
      month,
    });

  assert.ok(accountUsage);
  assert.equal(accountUsage.consumedUnits, expectedUnits);

  const userUsage = await dataSource
    .getRepository(UserMonthlyUsage)
    .findBy({
      accountId: fixture.accountId,
      month,
    });

  const totalUserUsage = userUsage.reduce(
    (total, row) => total + row.consumedUnits,
    0,
  );

  assert.equal(totalUserUsage, expectedUnits);

  const storedRequests = await dataSource
    .getRepository(ConsumptionRequest)
    .findBy({ accountId: fixture.accountId });

  assert.equal(storedRequests.length, expectedRequests);

  const acceptedRequests = storedRequests.filter(
    (request) => request.result.accepted,
  );

  const recordedUnits = acceptedRequests.reduce(
    (total, request) => total + request.units,
    0,
  );

  assert.equal(recordedUnits, expectedUnits);

  for (const userId of fixture.userIds) {
    const expectedUserUnits = acceptedRequests
      .filter((request) => request.userId === userId)
      .reduce((total, request) => total + request.units, 0);

    const actualUserUnits = userUsage.find(
      (row) => row.userId === userId,
    )?.consumedUnits ?? 0;

    assert.equal(actualUserUnits, expectedUserUnits);
  }
}

function assertMonthlyRejections(
  results: ConsumptionResult[],
  scope: "account" | "user",
): void {
  const accepted = results.filter((result) => result.accepted);
  const rejected = results.filter((result) => !result.accepted);

  assert.equal(accepted.length, 5);
  assert.equal(rejected.length, 7);

  for (const result of rejected) {
    assert.deepEqual(result.rejection, {
      scope,
      rule: "monthly_allowance",
      limit: 50,
      usedBefore: 50,
    });

    const usage = scope === "account"
      ? result.accountUsage
      : result.userUsage;

    assert.deepEqual(usage, {
      used: 50,
      remaining: 0,
    });
  }
}

test("concurrent requests cannot exceed a user's monthly allowance", async () => {
  const fixture = await createFixture(1_000, 50, 1);
  const results = await runBatch(fixture);

  assertMonthlyRejections(results, "user");

  await assertDatabaseState(fixture, results, 50, 12);
});

test("concurrent users cannot exceed their shared account allowance", async () => {
  const fixture = await createFixture(50, 1_000, 2);
  const results = await runBatch(fixture);

  assertMonthlyRejections(results, "account");

  await assertDatabaseState(fixture, results, 50, 12);
});

test("concurrent retries consume once and create one request record", async () => {
  const fixture = await createFixture(1_000, 1_000, 1);
  const results = await runBatch(fixture, randomUUID());

  const first = results[0];

  assert.equal(first.accepted, true);
  assert.deepEqual(first.accountUsage, {
    used: 10,
    remaining: 990,
  });
  assert.deepEqual(first.userUsage, {
    used: 10,
    remaining: 990,
  });

  for (const result of results) {
    assert.deepEqual(result, first);
  }

  await assertDatabaseState(fixture, results, 10, 1);
});