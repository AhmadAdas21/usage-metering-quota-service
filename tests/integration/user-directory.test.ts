import "reflect-metadata";

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";

import { Account } from "../../models/account.model";
import { User } from "../../models/user.model";
import { startTestApp } from "../helpers/test-app";
import type { TestApp } from "../helpers/test-app";

const STARTER = "00000000-0000-4000-8000-000000000001";
const BASIC = "00000000-0000-4000-8000-000000000003";
let app: TestApp;
const accountIds: string[] = [];

async function request(path: string, apiKey?: string, method = "GET", body?: unknown) {
  const response = await fetch(`${app.baseUrl}${path}`, {
    method,
    headers: {
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return { status: response.status, body: await response.json() };
}

async function setupAccount(count: number) {
  const response = await request("/accounts", undefined, "POST", {
    name: `Directory ${randomUUID()}`, planId: STARTER,
  });
  assert.equal(response.status, 201);
  const { account, apiKey } = response.body;
  accountIds.push(account.id);

  for (let i = 0; i < count; i++) {
    const user = await request("/users", apiKey, "POST", {
      externalId: `directory-${i}`, planId: BASIC,
    });
    assert.equal(user.status, 201);
  }
  return { account, apiKey };
}

before(async () => { app = await startTestApp(); });
after(async () => {
  try {
    await app.dataSource.transaction(async (manager) => {
      for (const accountId of accountIds) {
        await manager.getRepository(User).delete({ accountId });
        await manager.getRepository(Account).delete({ id: accountId });
      }
    });
  } finally { await app.stop(); }
});

test("user directory requires a valid account API key", async () => {
  const result = await request("/users");
  assert.equal(result.status, 401);
});

test("user directory lists only its account users, with pagination", async () => {
  const owner = await setupAccount(3);
  const other = await setupAccount(2);

  const first = await request("/users?page=1&pageSize=2", owner.apiKey);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.pagination, {
    page: 1, pageSize: 2, totalItems: 3, totalPages: 2,
  });
  assert.equal(first.body.users.length, 2);
  assert.ok(first.body.users.every((user: any) => user.accountId === owner.account.id));
  assert.ok(first.body.users.every((user: any) => !("apiKeyHash" in user)));

  const second = await request("/users?page=2&pageSize=2", owner.apiKey);
  assert.equal(second.status, 200);
  assert.equal(second.body.users.length, 1);
  assert.notEqual(second.body.users[0].id, first.body.users[0].id);

  const foreign = await request("/users?page=1&pageSize=100", other.apiKey);
  assert.equal(foreign.status, 200);
  assert.equal(foreign.body.pagination.totalItems, 2);
  assert.ok(foreign.body.users.every((user: any) => user.accountId === other.account.id));
});

test("directory rejects invalid paging instead of returning uncontrolled data", async () => {
  const owner = await setupAccount(0);
  for (const path of ["/users?page=0", "/users?pageSize=101", "/users?page=abc"]) {
    const result = await request(path, owner.apiKey);
    assert.equal(result.status, 400);
  }
});
