import "reflect-metadata";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
import type {
  UsageHistoryResponse,
} from "../../dtos/usage-history.dto";
import {
  generateApiKey,
  hashApiKey,
} from "../../security/api-key";
import { startTestApp } from "../helpers/test-app";
import type { TestApp } from "../helpers/test-app";

interface UsageResponse {
  month: string;
  usage: {
    used: number;
    remaining: number;
    monthlyAllowance: number;
  };
}

let app: TestApp | undefined;
let accountId: string | undefined;
let userA: string;
let userB: string;

const apiKey = generateApiKey();
const january = "2024-01-01";
const february = "2024-02-01";

function getApp(): TestApp {
  assert.ok(app);
  return app;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(
    `${getApp().baseUrl}${path}`,
    {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(5_000),
    },
  );

  const body = await response.json();

  assert.equal(
    response.status,
    200,
    `Unexpected response: ${JSON.stringify(body)}`,
  );

  return body as T;
}

before(async () => {
  app = await startTestApp();

  // Create all fixture data atomically.
  const fixture = await app.dataSource.transaction(
    async (manager) => {
      const accountRepository = manager.getRepository(Account);
      const userRepository = manager.getRepository(User);
      const planRepository = manager.getRepository(Plan);

      const accountPlan = await planRepository.findOneByOrFail({
        id: "00000000-0000-4000-8000-000000000001",
      });

      const userPlan = await planRepository.findOneByOrFail({
        id: "00000000-0000-4000-8000-000000000003",
      });

      const account = await accountRepository.save(
        accountRepository.create({
          name: "Historical Usage Test",
          planId: accountPlan.id,
          apiKeyHash: hashApiKey(apiKey),
        }),
      );

      const users: User[] = [];

      for (let index = 0; index < 2; index += 1) {
        users.push(
          await userRepository.save(
            userRepository.create({
              accountId: account.id,
              externalId: randomUUID(),
              planId: userPlan.id,
            }),
          ),
        );
      }

      const firstUser = users[0].id;
      const secondUser = users[1].id;

      await manager.getRepository(AccountMonthlyUsage).save([
        {
          accountId: account.id,
          month: january,
          consumedUnits: 35,
        },
        {
          accountId: account.id,
          month: february,
          consumedUnits: 7,
        },
      ]);

      await manager.getRepository(UserMonthlyUsage).save([
        {
          accountId: account.id,
          userId: firstUser,
          month: january,
          consumedUnits: 15,
        },
        {
          accountId: account.id,
          userId: secondUser,
          month: january,
          consumedUnits: 20,
        },
        {
          accountId: account.id,
          userId: firstUser,
          month: february,
          consumedUnits: 7,
        },
      ]);

      const entries = [
        {
          requestId: "jan-first",
          userId: firstUser,
          units: 10,
          month: january,
          processedAt: "2024-01-05T10:00:00.000Z",
          accountUsed: 10,
          userUsed: 10,
          accepted: true,
        },
        {
          requestId: "jan-second",
          userId: secondUser,
          units: 20,
          month: january,
          processedAt: "2024-01-10T10:00:00.000Z",
          accountUsed: 30,
          userUsed: 20,
          accepted: true,
        },
        {
          requestId: "jan-third",
          userId: firstUser,
          units: 5,
          month: january,
          processedAt: "2024-01-15T10:00:00.000Z",
          accountUsed: 35,
          userUsed: 15,
          accepted: true,
        },
        {
          requestId: "jan-rejected",
          userId: firstUser,
          units: 21,
          month: january,
          processedAt: "2024-01-20T10:00:00.000Z",
          accountUsed: 35,
          userUsed: 15,
          accepted: false,
        },
        {
          requestId: "feb-first",
          userId: firstUser,
          units: 7,
          month: february,
          processedAt: "2024-02-05T10:00:00.000Z",
          accountUsed: 7,
          userUsed: 7,
          accepted: true,
        },
      ];

      const requestRepository =
        manager.getRepository(ConsumptionRequest);

      for (const [index, entry] of entries.entries()) {
        const base = {
          requestId: entry.requestId,
          userId: entry.userId,
          units: entry.units,
          month: entry.month,
          processedAt: entry.processedAt,
          accountUsage: {
            used: entry.accountUsed,
            remaining: 10_000 - entry.accountUsed,
          },
          userUsage: {
            used: entry.userUsed,
            remaining: 1_000 - entry.userUsed,
          },
        };

        const result: ConsumptionResult = entry.accepted
          ? {
              ...base,
              accepted: true,
              rejection: null,
            }
          : {
              ...base,
              accepted: false,
              rejection: {
                scope: "user",
                rule: "max_units_per_request",
                limit: 20,
                usedBefore: entry.userUsed,
              },
            };

        await requestRepository.save(
          requestRepository.create({
            accountId: account.id,
            userId: entry.userId,
            requestId: entry.requestId,
            units: entry.units,
            payloadHash: createHash("sha256")
              .update(
                JSON.stringify({
                  userId: entry.userId,
                  units: entry.units,
                }),
              )
              .digest("hex"),
            accountPlan: {
              id: accountPlan.id,
              version: accountPlan.version,
              rules: accountPlan.rules,
            },
            userPlan: {
              id: userPlan.id,
              version: userPlan.version,
              rules: userPlan.rules,
            },
            result,

            // Deliberately opposite to processedAt order.
            // This detects sorting by createdAt accidentally.
            createdAt: new Date(
              Date.UTC(2024, 2, 10 - index),
            ),
          }),
        );
      }

      return {
        accountId: account.id,
        userA: firstUser,
        userB: secondUser,
      };
    },
  );

  accountId = fixture.accountId;
  userA = fixture.userA;
  userB = fixture.userB;
});

after(async () => {
  if (!app) {
    return;
  }

  try {
    if (accountId) {
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
    }
  } finally {
    await app.stop();
  }
});

test("historical usage stays separate by month and user", async () => {
  const cases = [
    { path: "/usage/account", month: "2024-01", used: 35, limit: 10_000 },
    { path: "/usage/account", month: "2024-02", used: 7, limit: 10_000 },
    { path: `/usage/users/${userA}`, month: "2024-01", used: 15, limit: 1_000 },
    { path: `/usage/users/${userB}`, month: "2024-01", used: 20, limit: 1_000 },
    { path: `/usage/users/${userA}`, month: "2024-02", used: 7, limit: 1_000 },
    { path: `/usage/users/${userB}`, month: "2024-02", used: 0, limit: 1_000 },
    { path: "/usage/account", month: "2024-03", used: 0, limit: 10_000 },
  ];

  for (const entry of cases) {
    const response = await get<UsageResponse>(
      `${entry.path}?month=${entry.month}`,
    );

    assert.equal(response.month, `${entry.month}-01`);
    assert.deepEqual(response.usage, {
      used: entry.used,
      remaining: entry.limit - entry.used,
      monthlyAllowance: entry.limit,
    });
  }
});

test("history paginates by processedAt and includes rejected requests", async () => {
  const first = await get<UsageHistoryResponse>(
    "/usage/history?month=2024-01&page=1&pageSize=2",
  );

  const second = await get<UsageHistoryResponse>(
    "/usage/history?month=2024-01&page=2&pageSize=2",
  );

  assert.equal(first.accountId, accountId);
  assert.equal(first.month, january);

  assert.deepEqual(first.pagination, {
    page: 1,
    pageSize: 2,
    totalItems: 4,
    totalPages: 2,
  });

  assert.deepEqual(second.pagination, {
    page: 2,
    pageSize: 2,
    totalItems: 4,
    totalPages: 2,
  });

  assert.deepEqual(
    first.items.map((item) => item.requestId),
    ["jan-rejected", "jan-third"],
  );

  assert.deepEqual(
    second.items.map((item) => item.requestId),
    ["jan-second", "jan-first"],
  );

  assert.equal(first.items[0].accepted, false);

  const items = [...first.items, ...second.items];

  assert.equal(
    new Set(items.map((item) => item.requestId)).size,
    4,
  );

  assert.ok(items.every((item) => item.month === january));
});

test("history combines month and user filters", async () => {
  const januaryHistory = await get<UsageHistoryResponse>(
    `/usage/history?month=2024-01&userId=${userA}`,
  );

  assert.equal(januaryHistory.pagination.totalItems, 3);

  assert.deepEqual(
    januaryHistory.items.map((item) => item.requestId),
    ["jan-rejected", "jan-third", "jan-first"],
  );

  assert.ok(
    januaryHistory.items.every((item) => item.userId === userA),
  );

  const februaryHistory = await get<UsageHistoryResponse>(
    `/usage/history?month=2024-02&userId=${userA}`,
  );

  assert.equal(februaryHistory.pagination.totalItems, 1);
  assert.deepEqual(
    februaryHistory.items.map((item) => item.requestId),
    ["feb-first"],
  );
});

test("history returns correct metadata for empty pages and months", async () => {
  const beyondLastPage = await get<UsageHistoryResponse>(
    "/usage/history?month=2024-01&page=3&pageSize=2",
  );

  assert.deepEqual(beyondLastPage.items, []);
  assert.deepEqual(beyondLastPage.pagination, {
    page: 3,
    pageSize: 2,
    totalItems: 4,
    totalPages: 2,
  });

  const emptyMonth = await get<UsageHistoryResponse>(
    "/usage/history?month=2024-03&page=1&pageSize=2",
  );

  assert.deepEqual(emptyMonth.items, []);
  assert.deepEqual(emptyMonth.pagination, {
    page: 1,
    pageSize: 2,
    totalItems: 0,
    totalPages: 0,
  });
});