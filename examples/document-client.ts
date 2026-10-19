import { randomUUID } from "node:crypto";

import type {
  CreateAccountResponse,
} from "../dtos/account.dto";
import type {
  CreateUserResponse,
} from "../dtos/user.dto";
import type {
  ConsumptionResult,
} from "../models/consumption-request.model";

interface DemoPlan {
  id: string;
  version: number;
  name: string;
  scope: "account" | "user";
  rules: {
    monthlyAllowance: number;
    maxUnitsPerRequest: number;
  };
}

interface PlanResponse {
  plan: DemoPlan;
}

interface UsageResponse {
  usage: {
    used: number;
    remaining: number;
    monthlyAllowance: number;
  };
}

class MeteringClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};

    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined
        ? undefined
        : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    const result: unknown = await response.json();

    if (!response.ok) {
      throw new Error(
        `${method} ${path} failed (${response.status}): ${
          JSON.stringify(result)
        }`,
      );
    }

    return result as T;
  }

  async createPlan(
    name: string,
    scope: "account" | "user",
    monthlyAllowance: number,
    maxUnitsPerRequest: number,
  ): Promise<DemoPlan> {
    const response = await this.request<PlanResponse>(
      "POST",
      "/plans",
      {
        name,
        scope,
        rules: {
          monthlyAllowance,
          maxUnitsPerRequest,
        },
      },
    );

    return response.plan;
  }
}

function ensure(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`Demo verification failed: ${message}`);
  }
}

async function processDocument(
  client: MeteringClient,
  user: CreateUserResponse["user"],
  documentName: string,
  units: number,
): Promise<ConsumptionResult> {
  const result = await client.request<ConsumptionResult>(
    "POST",
    "/consumption",
    {
      userId: user.id,
      requestId: randomUUID(),
      units,
    },
  );

  console.log(`\n${user.externalId}: ${documentName}`);

  if (result.accepted) {
    console.log("ACCEPTED - document processing simulated.");
  } else {
    console.log(
      `REJECTED - ${result.rejection.scope}: ${
        result.rejection.rule
      }. Document was not processed.`,
    );
  }

  console.table([
    {
      scope: "Account",
      used: result.accountUsage.used,
      remaining: result.accountUsage.remaining,
    },
    {
      scope: user.externalId,
      used: result.userUsage.used,
      remaining: result.userUsage.remaining,
    },
  ]);

  return result;
}

async function main(): Promise<void> {
  const baseUrl = (
    process.env.API_BASE_URL ?? "http://localhost:3000"
  ).replace(/\/+$/, "");

  const publicClient = new MeteringClient(baseUrl);

  console.log(`Usage Metering Demo: ${baseUrl}`);

  const created = await publicClient.request<CreateAccountResponse>(
    "POST",
    "/accounts",
    {
      name: `Document Demo ${randomUUID().slice(0, 8)}`,
      planId: "00000000-0000-4000-8000-000000000001",
    },
  );

  // Keep the key in memory; do not print it.
  const client = new MeteringClient(baseUrl, created.apiKey);

  console.log(`Created demo account: ${created.account.id}`);

  const accountPlan = await client.createPlan(
    "Document Team",
    "account",
    30,
    100,
  );

  const alicePlan = await client.createPlan(
    "Light Reader",
    "user",
    10,
    10,
  );

  const bobPlan = await client.createPlan(
    "Power Reader",
    "user",
    100,
    50,
  );

  await client.request("PUT", "/accounts/me/plan", {
    planId: accountPlan.id,
  });

  const { user: alice } =
    await client.request<CreateUserResponse>(
      "POST",
      "/users",
      {
        externalId: "Alice",
        planId: alicePlan.id,
      },
    );

  const { user: bob } =
    await client.request<CreateUserResponse>(
      "POST",
      "/users",
      {
        externalId: "Bob",
        planId: bobPlan.id,
      },
    );

  console.table([
    { owner: "Account", monthlyAllowance: 30, perRequest: 100 },
    { owner: "Alice", monthlyAllowance: 10, perRequest: 10 },
    { owner: "Bob", monthlyAllowance: 100, perRequest: 50 },
  ]);

  const first = await processDocument(
    client,
    alice,
    "report.pdf",
    10,
  );

  ensure(first.accepted, "Alice's first request should succeed");

  const userRejection = await processDocument(
    client,
    alice,
    "extra-page.pdf",
    1,
  );

  ensure(
    !userRejection.accepted &&
      userRejection.rejection.scope === "user" &&
      userRejection.rejection.rule === "monthly_allowance",
    "Alice should be blocked by her monthly allowance",
  );

  const sharedUsage = await processDocument(
    client,
    bob,
    "large-report.pdf",
    20,
  );

  ensure(sharedUsage.accepted, "Bob's 20-unit request should succeed");
  ensure(
    sharedUsage.accountUsage.used === 30,
    "Account usage should equal Alice's 10 plus Bob's 20",
  );

  const accountRejection = await processDocument(
    client,
    bob,
    "summary.pdf",
    1,
  );

  ensure(
    !accountRejection.accepted &&
      accountRejection.rejection.scope === "account" &&
      accountRejection.rejection.rule === "monthly_allowance",
    "Bob should be blocked by the shared account allowance",
  );

  console.log("\nUpdating the account allowance: 30 -> 50");

  const updated = await client.request<PlanResponse>(
    "PUT",
    `/plans/${accountPlan.id}`,
    {
      name: accountPlan.name,
      expectedVersion: accountPlan.version,
      rules: {
        monthlyAllowance: 50,
        maxUnitsPerRequest: 100,
      },
    },
  );

  ensure(
    updated.plan.version === accountPlan.version + 1,
    "Plan version should increase",
  );

  // A new action needs a new request ID.
  // Replaying the rejected ID would return its original rejection.
  const afterUpgrade = await processDocument(
    client,
    bob,
    "summary-after-upgrade.pdf",
    1,
  );

  ensure(afterUpgrade.accepted, "Bob should succeed after the upgrade");
  ensure(
    afterUpgrade.accountUsage.used === 31 &&
      afterUpgrade.accountUsage.remaining === 19,
    "Plan update must preserve the previous 30 consumed units",
  );

  const month = afterUpgrade.month.slice(0, 7);

  const accountUsage = await client.request<UsageResponse>(
    "GET",
    `/usage/account?month=${month}`,
  );

  const aliceUsage = await client.request<UsageResponse>(
    "GET",
    `/usage/users/${alice.id}?month=${month}`,
  );

  const bobUsage = await client.request<UsageResponse>(
    "GET",
    `/usage/users/${bob.id}?month=${month}`,
  );

  ensure(
    accountUsage.usage.used === 31 &&
      aliceUsage.usage.used === 10 &&
      bobUsage.usage.used === 21,
    "Final usage endpoints should match the accepted actions",
  );

  console.log("\nFinal monthly usage:");

  console.table([
    { owner: "Account", ...accountUsage.usage },
    { owner: "Alice", ...aliceUsage.usage },
    { owner: "Bob", ...bobUsage.usage },
  ]);

  console.log("\nDemo completed successfully.");
}

void main().catch((error: unknown) => {
  console.error(
    "\nDemo failed:",
    error instanceof Error ? error.message : error,
  );

  process.exitCode = 1;
});