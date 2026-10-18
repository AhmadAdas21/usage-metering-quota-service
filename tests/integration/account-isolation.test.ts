import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import type { CreateAccountResponse } from "../../dtos/account.dto";
import type { CreateUserResponse } from "../../dtos/user.dto";
import { Account } from "../../models/account.model";
import { User } from "../../models/user.model";
import { ConsumptionRequest } from "../../models/consumption-request.model";
import {
  AccountMonthlyUsage,
  UserMonthlyUsage,
} from "../../models/monthly-usage.model";
import { startTestApp } from "../helpers/test-app";
import type { TestApp } from "../helpers/test-app";

const starterPlanId =
  "00000000-0000-4000-8000-000000000001";
const basicPlanId =
  "00000000-0000-4000-8000-000000000003";

let app: TestApp | undefined;
let accountA: CreateAccountResponse;
let accountB: CreateAccountResponse;
let userA: CreateUserResponse["user"];
let userB: CreateUserResponse["user"];
let month: string;

const accountIds: string[] = [];
const acceptedRequestId = randomUUID();

function getApp(): TestApp {
  assert.ok(app, "Test application must be initialized");
  return app;
}

async function request<T>(
  path: string,
  apiKey?: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {};

  if (apiKey !== undefined) {
    headers["x-api-key"] = apiKey;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(
    `${getApp().baseUrl}${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined
        ? undefined
        : JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    },
  );

  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

async function createAccount(
  name: string,
): Promise<CreateAccountResponse> {
  const response = await request<CreateAccountResponse>(
    "/accounts",
    undefined,
    {
      name,
      planId: starterPlanId,
    },
  );

  assert.equal(response.status, 201);
  assert.ok(response.body.account.id);
  accountIds.push(response.body.account.id);

  assert.equal(typeof response.body.apiKey, "string");
  assert.ok(response.body.apiKey.length > 0);

  return response.body;
}

async function createUser(
  apiKey: string,
): Promise<CreateUserResponse["user"]> {
  const response = await request<CreateUserResponse>(
    "/users",
    apiKey,
    {
      externalId: "shared-external-id",
      planId: basicPlanId,
    },
  );

  assert.equal(response.status, 201);
  return response.body.user;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

interface HistoryResponse {
  accountId: string;
  items: Array<{
    requestId: string;
    userId: string;
  }>;
  pagination: {
    totalItems: number;
  };
}

before(async () => {
  app = await startTestApp();

  accountA = await createAccount("Isolation Account A");
  accountB = await createAccount("Isolation Account B");

  userA = await createUser(accountA.apiKey);
  userB = await createUser(accountB.apiKey);

  const consumption = await request<{
    accepted: boolean;
    month: string;
  }>("/consumption", accountB.apiKey, {
    userId: userB.id,
    requestId: acceptedRequestId,
    units: 10,
  });

  assert.equal(consumption.status, 200);
  assert.equal(consumption.body.accepted, true);

  // Use the month actually recorded by the service.
  month = consumption.body.month.slice(0, 7);
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

        await manager
          .getRepository(Account)
          .delete({ id: accountId });
      }
    });
  } finally {
    await app.stop();
  }
});

test("issued API keys identify their own accounts", async () => {
  assert.notEqual(accountA.apiKey, accountB.apiKey);
  assert.notEqual(userA.id, userB.id);
  assert.equal(userA.accountId, accountA.account.id);
  assert.equal(userB.accountId, accountB.account.id);

  for (const account of [accountA, accountB]) {
    const response = await request<{
      account: { id: string };
    }>("/accounts/me", account.apiKey);

    assert.equal(response.status, 200);
    assert.equal(
      response.body.account.id,
      account.account.id,
    );
  }
});

test("cannot read another account's user usage", async () => {
  const path = `/usage/users/${userB.id}?month=${month}`;

  const ownerResponse = await request<{
    userId: string;
    usage: { used: number };
  }>(path, accountB.apiKey);

  assert.equal(ownerResponse.status, 200);
  assert.equal(ownerResponse.body.userId, userB.id);
  assert.equal(ownerResponse.body.usage.used, 10);

  const foreignResponse = await request<ErrorResponse>(
    path,
    accountA.apiKey,
  );

  assert.equal(foreignResponse.status, 404);
  assert.equal(
    foreignResponse.body.error.code,
    "USER_NOT_FOUND",
  );
});

test("cannot consume for another account or change its balances", async () => {
  const response = await request<ErrorResponse>(
    "/consumption",
    accountA.apiKey,
    {
      userId: userB.id,
      requestId: randomUUID(),
      units: 5,
    },
  );

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "USER_NOT_FOUND");

  const dataSource = getApp().dataSource;

  const accountUsage = await dataSource
    .getRepository(AccountMonthlyUsage)
    .findOneBy({ accountId: accountB.account.id });

  const userUsage = await dataSource
    .getRepository(UserMonthlyUsage)
    .findOneBy({
      accountId: accountB.account.id,
      userId: userB.id,
    });

  assert.ok(accountUsage);
  assert.ok(userUsage);
  assert.equal(accountUsage.consumedUnits, 10);
  assert.equal(userUsage.consumedUnits, 10);

  assert.equal(
    await dataSource.getRepository(AccountMonthlyUsage).countBy({
      accountId: accountA.account.id,
    }),
    0,
  );

  assert.equal(
    await dataSource.getRepository(UserMonthlyUsage).countBy({
      accountId: accountA.account.id,
    }),
    0,
  );

  assert.equal(
    await dataSource.getRepository(ConsumptionRequest).countBy({
      accountId: accountA.account.id,
    }),
    0,
  );

  assert.equal(
    await dataSource.getRepository(ConsumptionRequest).countBy({
      accountId: accountB.account.id,
    }),
    1,
  );
});

test("history contains only the authenticated account's requests", async () => {
  const path = `/usage/history?month=${month}`;

  const responseA = await request<HistoryResponse>(
    path,
    accountA.apiKey,
  );

  const responseB = await request<HistoryResponse>(
    path,
    accountB.apiKey,
  );

  assert.equal(responseA.status, 200);
  assert.equal(responseA.body.accountId, accountA.account.id);
  assert.deepEqual(responseA.body.items, []);
  assert.equal(responseA.body.pagination.totalItems, 0);

  assert.equal(responseB.status, 200);
  assert.equal(responseB.body.accountId, accountB.account.id);
  assert.equal(responseB.body.pagination.totalItems, 1);
  assert.equal(responseB.body.items.length, 1);
  assert.equal(
    responseB.body.items[0].requestId,
    acceptedRequestId,
  );
  assert.equal(responseB.body.items[0].userId, userB.id);
});

test("cannot filter history by another account's user", async () => {
  const response = await request<ErrorResponse>(
    `/usage/history?month=${month}&userId=${userB.id}`,
    accountA.apiKey,
  );

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "USER_NOT_FOUND");
});