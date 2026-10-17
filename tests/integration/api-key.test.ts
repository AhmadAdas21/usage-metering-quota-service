import "reflect-metadata";

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { Account } from "../../models/account.model";
import {
  generateApiKey,
  hashApiKey,
} from "../../security/api-key";
import { startTestApp } from "../helpers/test-app";
import type { TestApp } from "../helpers/test-app";

let app: TestApp | undefined;
let accountId: string | undefined;

const apiKey = generateApiKey();
const accountName = "API Key Integration Test";
const starterPlanId =
  "00000000-0000-4000-8000-000000000001";

function getApp(): TestApp {
  assert.ok(app, "Test application must be initialized");
  return app;
}

before(async () => {
  app = await startTestApp();

  const repository = app.dataSource.getRepository(Account);

  const account = await repository.save(
    repository.create({
      name: accountName,
      planId: starterPlanId,
      apiKeyHash: hashApiKey(apiKey),
    }),
  );

  accountId = account.id;
});

after(async () => {
  if (!app) {
    return;
  }

  try {
    if (accountId) {
      await app.dataSource
        .getRepository(Account)
        .delete({ id: accountId });
    }
  } finally {
    await app.stop();
  }
});

test("rejects a request without an API key", async () => {
  const response = await fetch(
    `${getApp().baseUrl}/accounts/me`,
    {
      signal: AbortSignal.timeout(5_000),
    },
  );

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, {
    error: {
      code: "UNAUTHORIZED",
      message: "A valid API key is required.",
    },
  });
});

test("rejects an empty API key", async () => {
  const response = await fetch(
    `${getApp().baseUrl}/accounts/me`,
    {
      headers: {
        "x-api-key": "",
      },
      signal: AbortSignal.timeout(5_000),
    },
  );

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, {
    error: {
      code: "UNAUTHORIZED",
      message: "A valid API key is required.",
    },
  });
});

test("rejects an unknown API key", async () => {
  const response = await fetch(
    `${getApp().baseUrl}/accounts/me`,
    {
      headers: {
        "x-api-key": generateApiKey(),
      },
      signal: AbortSignal.timeout(5_000),
    },
  );

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, {
    error: {
      code: "UNAUTHORIZED",
      message: "A valid API key is required.",
    },
  });
});

test("accepts a valid API key without exposing credentials", async () => {
  const response = await fetch(
    `${getApp().baseUrl}/accounts/me`,
    {
      headers: {
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(5_000),
    },
  );

  const body = (await response.json()) as {
    account: {
      id: string;
      name: string;
      planId: string;
      createdAt: string;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");

  assert.ok(body.account);
  assert.equal(body.account.id, accountId);
  assert.equal(body.account.name, accountName);
  assert.equal(body.account.planId, starterPlanId);

  assert.equal(typeof body.account.createdAt, "string");
  assert.ok(
    Number.isFinite(Date.parse(body.account.createdAt)),
    "Account creation date must be valid",
  );

  assert.deepEqual(
    Object.keys(body.account).sort(),
    ["id", "name", "planId", "createdAt"].sort(),
  );

  const serializedBody = JSON.stringify(body);

  assert.equal(serializedBody.includes(apiKey), false);
  assert.equal(serializedBody.includes(hashApiKey(apiKey)), false);
});