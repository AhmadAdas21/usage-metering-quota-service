import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import type { CreateAccountResponse } from "../../dtos/account.dto";
import type { CreateUserResponse } from "../../dtos/user.dto";
import type {
  AccountUsageResponse,
  UserUsageResponse,
} from "../../dtos/usage.dto";
import type {
  ConsumptionResult,
} from "../../models/consumption-request.model";

interface PlanResponse {
  plan: {
    id: string;
  };
}

interface HistoryResponse {
  pagination: {
    totalItems: number;
  };
}

interface LoadUser {
  id: string;
  expectedUsage: number;
}

function readInteger(
  name: string,
  fallback: number,
  maximum: number,
): number {
  const value = Number(process.env[name] ?? fallback);

  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}`);
  }

  return value;
}

async function runWorkers(
  count: number,
  concurrency: number,
  operation: (index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < count) {
      const index = nextIndex++;
      await operation(index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(count, concurrency) },
      () => worker(),
    ),
  );
}

function percentile(sorted: number[], percent: number): number {
  const index = Math.ceil((percent / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const baseUrl = (
    process.env.API_BASE_URL ?? "http://localhost:3000"
  ).replace(/\/+$/, "");

  const requests = readInteger("LOAD_REQUESTS", 2_000, 100_000);
  const concurrency = readInteger("LOAD_CONCURRENCY", 20, 500);
  const userCount = readInteger("LOAD_USERS", 10, 100);
  const warmupRequests = 50;

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const month = startedAt.slice(0, 7);
  const allowance = requests + warmupRequests;

  let apiKey: string | undefined;

  async function request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      await response.text();
      throw new Error(`${method} ${path}: HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  }

  await request("GET", "/health");

  console.log("Preparing load-test account and users...");

  const createdAccount = await request<CreateAccountResponse>(
    "POST",
    "/accounts",
    {
      name: `Load Test ${runId}`,
      planId: "00000000-0000-4000-8000-000000000001",
    },
  );

  apiKey = createdAccount.apiKey;

  async function createPlan(
    scope: "account" | "user",
  ): Promise<string> {
    const response = await request<PlanResponse>("POST", "/plans", {
      name: `Load ${scope} ${runId}`,
      scope,
      rules: {
        monthlyAllowance: allowance,
        maxUnitsPerRequest: 1,
      },
    });

    return response.plan.id;
  }

  const accountPlanId = await createPlan("account");
  const userPlanId = await createPlan("user");

  await request("PUT", "/accounts/me/plan", {
    planId: accountPlanId,
  });

  const users: LoadUser[] = [];

  for (let index = 0; index < userCount; index++) {
    const response = await request<CreateUserResponse>(
      "POST",
      "/users",
      {
        externalId: `load-user-${index}`,
        planId: userPlanId,
      },
    );

    users.push({
      id: response.user.id,
      expectedUsage: 0,
    });
  }

  async function consume(index: number): Promise<void> {
    const user = users[index % users.length];
    const requestId = randomUUID();

    const result = await request<ConsumptionResult>(
      "POST",
      "/consumption",
      {
        userId: user.id,
        requestId,
        units: 1,
      },
    );

    assert.equal(result.requestId, requestId);
    assert.equal(result.userId, user.id);
    assert.equal(result.units, 1);
    assert.equal(result.month.slice(0, 7), month);
    assert.equal(result.accepted, true, "Unexpected quota rejection");
    assert.equal(result.rejection, null);

    user.expectedUsage++;
  }

  console.log(`Warm-up: ${warmupRequests} requests`);
  await runWorkers(warmupRequests, concurrency, consume);

  console.log(
    `Measured run: ${requests} requests, ` +
      `${concurrency} workers, ${userCount} users`,
  );

  const latencies: number[] = [];
  const errorSamples: string[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;

  const measurementStarted = performance.now();

  await runWorkers(requests, concurrency, async (index) => {
    const requestStarted = performance.now();

    try {
      await consume(index);
      successfulRequests++;
    } catch (error) {
      failedRequests++;

      if (errorSamples.length < 5) {
        errorSamples.push(errorMessage(error));
      }
    } finally {
      latencies.push(performance.now() - requestStarted);
    }
  });

  const durationMs = performance.now() - measurementStarted;
  const verificationErrors: string[] = [];

  async function verify(
    label: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      verificationErrors.push(`${label}: ${errorMessage(error)}`);
    }
  }

  const expectedTotal = users.reduce(
    (total, user) => total + user.expectedUsage,
    0,
  );

  await verify("UTC month", async () => {
    assert.equal(
      new Date().toISOString().slice(0, 7),
      month,
      "The run crossed a UTC month boundary; repeat the test",
    );
  });

  await verify("Account usage", async () => {
    const response = await request<AccountUsageResponse>(
      "GET",
      `/usage/account?month=${month}`,
    );

    assert.equal(response.usage.used, expectedTotal);
    assert.equal(response.usage.monthlyAllowance, allowance);
    assert.equal(response.usage.remaining, allowance - expectedTotal);
  });

  for (const user of users) {
    await verify(`User ${user.id}`, async () => {
      const response = await request<UserUsageResponse>(
        "GET",
        `/usage/users/${user.id}?month=${month}`,
      );

      assert.equal(response.usage.used, user.expectedUsage);
      assert.equal(response.usage.monthlyAllowance, allowance);
      assert.equal(
        response.usage.remaining,
        allowance - user.expectedUsage,
      );
    });
  }

  await verify("History count", async () => {
    const response = await request<HistoryResponse>(
      "GET",
      `/usage/history?month=${month}&page=1&pageSize=1`,
    );

    assert.equal(
      response.pagination.totalItems,
      warmupRequests + requests,
    );
  });

  latencies.sort((left, right) => left - right);

  const metrics = {
    requests,
    successfulRequests,
    failedRequests,
    errorRatePercent: round((failedRequests / requests) * 100),
    durationSeconds: round(durationMs / 1_000),
    completedRequestsPerSecond: round(requests / (durationMs / 1_000)),
    latencyMeanMs: round(
      latencies.reduce((total, value) => total + value, 0) /
        latencies.length,
    ),
    latencyP50Ms: round(percentile(latencies, 50)),
    latencyP95Ms: round(percentile(latencies, 95)),
    latencyP99Ms: round(percentile(latencies, 99)),
    latencyMaxMs: round(latencies[latencies.length - 1]),
  };

  const passed =
    failedRequests === 0 &&
    verificationErrors.length === 0;

  const report = {
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    scenario: "single-account-multiple-users",
    loadModel: "closed-loop-fixed-workers",
    client: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    configuration: {
      baseUrl,
      requests,
      concurrency,
      userCount,
      warmupRequests,
      unitsPerRequest: 1,
    },
    accountId: createdAccount.account.id,
    metrics,
    verification: {
      passed,
      expectedTotalIncludingWarmup: expectedTotal,
      errors: verificationErrors,
    },
    errorSamples,
  };

  const resultDirectory = join("tests", "load", "results");
  const resultPath = join(
    resultDirectory,
    `consumption-${runId}.json`,
  );

  await mkdir(resultDirectory, { recursive: true });
  await writeFile(
    resultPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.table([metrics]);
  console.log(`Report saved: ${resultPath}`);

  if (!passed) {
    console.error("Load test failed.", {
      errorSamples,
      verificationErrors,
    });

    process.exitCode = 1;
    return;
  }

  console.log("PASS: account usage, user usage and history verified.");
}

void main().catch((error: unknown) => {
  console.error("Load test setup or warm-up failed:", errorMessage(error));
  process.exitCode = 1;
});