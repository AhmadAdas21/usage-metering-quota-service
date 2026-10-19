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

interface Scenario {
  name: string;
  accountAllowance: number;
  userAllowance: number;
  uniqueRequests: number;
  repetitions: number;
  expectedAccepted: number;
  rejectionScope: "account" | "user" | null;
}

interface HistoryResponse {
  items: ConsumptionResult[];
  pagination: {
    totalItems: number;
    totalPages: number;
  };
}

const USER_COUNT = 10;
const CONCURRENCY = 50;

const scenarios: Scenario[] = [
  {
    name: "shared-account-quota",
    accountAllowance: 250,
    userAllowance: 1_000,
    uniqueRequests: 1_000,
    repetitions: 1,
    expectedAccepted: 250,
    rejectionScope: "account",
  },
  {
    name: "individual-user-quotas",
    accountAllowance: 2_000,
    userAllowance: 25,
    uniqueRequests: 1_000,
    repetitions: 1,
    expectedAccepted: 250,
    rejectionScope: "user",
  },
  {
    name: "concurrent-idempotent-retries",
    accountAllowance: 1_000,
    userAllowance: 1_000,
    uniqueRequests: 100,
    repetitions: 10,
    expectedAccepted: 100,
    rejectionScope: null,
  },
];

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

async function runScenario(baseUrl: string, scenario: Scenario) {
  const scenarioId = randomUUID();
  const month = new Date().toISOString().slice(0, 7);
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

  const account = await request<CreateAccountResponse>(
    "POST",
    "/accounts",
    {
      name: `Contention ${scenarioId}`,
      planId: "00000000-0000-4000-8000-000000000001",
    },
  );

  apiKey = account.apiKey;

  async function createPlan(
    scope: "account" | "user",
    monthlyAllowance: number,
  ): Promise<string> {
    const response = await request<{ plan: { id: string } }>(
      "POST",
      "/plans",
      {
        name: `Contention ${scope}`,
        scope,
        rules: {
          monthlyAllowance,
          maxUnitsPerRequest: 1,
        },
      },
    );

    return response.plan.id;
  }

  const accountPlanId = await createPlan(
    "account",
    scenario.accountAllowance,
  );

  const userPlanId = await createPlan(
    "user",
    scenario.userAllowance,
  );

  await request("PUT", "/accounts/me/plan", {
    planId: accountPlanId,
  });

  const users: string[] = [];

  for (let index = 0; index < USER_COUNT; index++) {
    const response = await request<CreateUserResponse>(
      "POST",
      "/users",
      {
        externalId: `user-${index}`,
        planId: userPlanId,
      },
    );

    users.push(response.user.id);
  }

  const payloads = Array.from(
    { length: scenario.uniqueRequests },
    (_, index) => ({
      requestId: randomUUID(),
      userId: users[index % USER_COUNT],
      units: 1,
    }),
  );

  const attempts = scenario.uniqueRequests * scenario.repetitions;
  const results = new Map<string, ConsumptionResult>();
  const latencies: number[] = [];
  const errorSamples: string[] = [];

  let nextIndex = 0;
  let acceptedResponses = 0;
  let rejectedResponses = 0;
  let failedAttempts = 0;

  console.log(`Running ${scenario.name}: ${attempts} attempts`);

  async function worker(): Promise<void> {
    while (nextIndex < attempts) {
      const index = nextIndex++;

      // Adjacent attempts repeat the same payload, causing retries
      // to overlap while several workers are active.
      const payload = payloads[
        Math.floor(index / scenario.repetitions)
      ];

      const started = performance.now();

      try {
        const result = await request<ConsumptionResult>(
          "POST",
          "/consumption",
          payload,
        );

        assert.equal(result.requestId, payload.requestId);
        assert.equal(result.userId, payload.userId);
        assert.equal(result.units, payload.units);
        assert.equal(result.month.slice(0, 7), month);

        if (result.accepted) {
          assert.equal(result.rejection, null);
        } else {
          assert.notEqual(
            scenario.rejectionScope,
            null,
            "Retries should all return accepted results",
          );

          assert.equal(
            result.rejection.scope,
            scenario.rejectionScope,
          );

          assert.equal(result.rejection.rule, "monthly_allowance");
        }

        const previous = results.get(result.requestId);

        if (previous) {
          assert.deepEqual(
            result,
            previous,
            "Retry did not return the original result",
          );
        } else {
          results.set(result.requestId, result);
        }

        if (result.accepted) {
          acceptedResponses++;
        } else {
          rejectedResponses++;
        }
      } catch (error) {
        failedAttempts++;

        if (errorSamples.length < 5) {
          errorSamples.push(message(error));
        }
      } finally {
        latencies.push(performance.now() - started);
      }
    }
  }

  const started = performance.now();

  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker()),
  );

  const durationMs = performance.now() - started;
  const verificationErrors: string[] = [];

  async function verify(
    label: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      verificationErrors.push(`${label}: ${message(error)}`);
    }
  }

  const uniqueAccepted = [...results.values()].filter(
    (result) => result.accepted,
  );

  await verify("Decisions", async () => {
    assert.equal(results.size, scenario.uniqueRequests);
    assert.equal(uniqueAccepted.length, scenario.expectedAccepted);

    assert.equal(
      acceptedResponses,
      scenario.expectedAccepted * scenario.repetitions,
    );

    assert.equal(
      rejectedResponses,
      (scenario.uniqueRequests - scenario.expectedAccepted) *
        scenario.repetitions,
    );
  });

  await verify("Account usage", async () => {
    const response = await request<AccountUsageResponse>(
      "GET",
      `/usage/account?month=${month}`,
    );

    assert.equal(response.usage.used, scenario.expectedAccepted);
    assert.equal(
      response.usage.monthlyAllowance,
      scenario.accountAllowance,
    );
    assert.equal(
      response.usage.remaining,
      scenario.accountAllowance - scenario.expectedAccepted,
    );
  });

  for (const userId of users) {
    await verify(`User ${userId}`, async () => {
      const expectedUsed = uniqueAccepted.filter(
        (result) => result.userId === userId,
      ).length;

      const response = await request<UserUsageResponse>(
        "GET",
        `/usage/users/${userId}?month=${month}`,
      );

      assert.equal(response.usage.used, expectedUsed);
      assert.equal(
        response.usage.monthlyAllowance,
        scenario.userAllowance,
      );
      assert.equal(
        response.usage.remaining,
        scenario.userAllowance - expectedUsed,
      );

      if (scenario.rejectionScope === "user") {
        assert.equal(response.usage.used, 25);
      }
    });
  }

  await verify("Stored history", async () => {
    const seen = new Set<string>();
    const expectedPages = Math.ceil(scenario.uniqueRequests / 100);

    for (let page = 1; page <= expectedPages; page++) {
      const response = await request<HistoryResponse>(
        "GET",
        `/usage/history?month=${month}&page=${page}&pageSize=100`,
      );

      assert.equal(
        response.pagination.totalItems,
        scenario.uniqueRequests,
      );
      assert.equal(response.pagination.totalPages, expectedPages);

      for (const item of response.items) {
        assert.equal(seen.has(item.requestId), false);
        assert.deepEqual(item, results.get(item.requestId));
        seen.add(item.requestId);
      }
    }

    assert.equal(seen.size, scenario.uniqueRequests);
  });

  await verify("UTC month", async () => {
    assert.equal(
      new Date().toISOString().slice(0, 7),
      month,
      "Month changed during the scenario; repeat the test",
    );
  });

  latencies.sort((left, right) => left - right);

  function percentile(percent: number): number {
    const index = Math.ceil((percent / 100) * latencies.length) - 1;
    return round(latencies[Math.max(0, index)]);
  }

  const passed =
    failedAttempts === 0 &&
    verificationErrors.length === 0;

  return {
    scenario: scenario.name,
    accountId: account.account.id,
    configuration: {
      ...scenario,
      userCount: USER_COUNT,
      concurrency: CONCURRENCY,
      unitsPerRequest: 1,
      warmupRequests: 0,
    },
    metrics: {
      attempts,
      acceptedResponses,
      rejectedResponses,
      failedAttempts,
      uniqueAccepted: uniqueAccepted.length,
      durationSeconds: round(durationMs / 1_000),
      completedRequestsPerSecond: round(
        attempts / (durationMs / 1_000),
      ),
      latencyP50Ms: percentile(50),
      latencyP95Ms: percentile(95),
      latencyP99Ms: percentile(99),
    },
    verification: {
      passed,
      errors: verificationErrors,
    },
    errorSamples,
  };
}

async function main(): Promise<void> {
  const baseUrl = (
    process.env.API_BASE_URL ?? "http://localhost:3000"
  ).replace(/\/+$/, "");

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const reports: Awaited<ReturnType<typeof runScenario>>[] = [];
  const setupErrors: string[] = [];

  for (const scenario of scenarios) {
    try {
      reports.push(await runScenario(baseUrl, scenario));
    } catch (error) {
      setupErrors.push(`${scenario.name}: ${message(error)}`);
      break;
    }
  }

  const passed =
    reports.length === scenarios.length &&
    reports.every((report) => report.verification.passed);

  const directory = join("tests", "load", "results");
  const resultPath = join(directory, `contention-${runId}.json`);

  await mkdir(directory, { recursive: true });

  await writeFile(
    resultPath,
    `${JSON.stringify(
      {
        runId,
        startedAt,
        finishedAt: new Date().toISOString(),
        baseUrl,
        loadModel: "closed-loop-fixed-workers",
        client: {
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
        },
        passed,
        reports,
        setupErrors,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.table(
    reports.map((report) => ({
      scenario: report.scenario,
      ...report.metrics,
      passed: report.verification.passed,
    })),
  );

  console.log(`Report saved: ${resultPath}`);

  if (!passed) {
    console.error("FAIL:", {
      setupErrors,
      scenarios: reports
        .filter((report) => !report.verification.passed)
        .map((report) => ({
          scenario: report.scenario,
          errors: report.verification.errors,
          errorSamples: report.errorSamples,
        })),
    });

    process.exitCode = 1;
    return;
  }

  console.log("PASS: quota contention and concurrent retries verified.");
}

void main().catch((error: unknown) => {
  console.error("Contention test failed:", message(error));
  process.exitCode = 1;
});