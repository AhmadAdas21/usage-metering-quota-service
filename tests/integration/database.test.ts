import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { Plan } from "../../models/plan.model";
import { seedPredefinedPlans } from "../../database/seeds/initial-plans.seed";
import {
  createTestDataSource,
  initializeTestDatabase,
} from "../helpers/test-data-source";

const dataSource = createTestDataSource();

before(async () => {
  await initializeTestDatabase(dataSource);
});

after(async () => {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
});

test("connects to the dedicated test database", async () => {
  const rows: Array<{
    database: string;
    username: string;
  }> = await dataSource.query(`
    SELECT
      current_database() AS database,
      current_user AS username
  `);

  assert.deepEqual(rows, [
    {
      database: "usage_metering_test",
      username: "usage_test",
    },
  ]);
});

test("migrations create all application tables", async () => {
  const rows: Array<{ table_name: string }> =
    await dataSource.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);

  const tables = new Set(
    rows.map((row) => row.table_name),
  );

  const expectedTables = [
    "plans",
    "accounts",
    "users",
    "account_monthly_usage",
    "user_monthly_usage",
    "consumption_requests",
  ];

  for (const table of expectedTables) {
    assert.ok(
      tables.has(table),
      `Expected table "${table}" to exist`,
    );
  }

  assert.equal(
    await dataSource.showMigrations(),
    false,
    "All migrations should have been applied",
  );
});

test("seeds predefined plans without duplicating them", async () => {
  const repository = dataSource.getRepository(Plan);
  const countBefore = await repository.count();

  await seedPredefinedPlans(dataSource);

  assert.equal(
    await repository.count(),
    countBefore,
    "Running the seed again must not add duplicate plans",
  );

  const expectedPlans = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Starter",
      scope: "account",
      monthlyAllowance: 10_000,
      maxUnitsPerRequest: 100,
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Pro",
      scope: "account",
      monthlyAllowance: 100_000,
      maxUnitsPerRequest: 1_000,
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      name: "Basic",
      scope: "user",
      monthlyAllowance: 1_000,
      maxUnitsPerRequest: 20,
    },
    {
      id: "00000000-0000-4000-8000-000000000004",
      name: "Premium",
      scope: "user",
      monthlyAllowance: 10_000,
      maxUnitsPerRequest: 200,
    },
  ];

  for (const expected of expectedPlans) {
    const plan = await repository.findOneBy({
      id: expected.id,
    });

    assert.ok(plan, `${expected.name} should exist`);
    assert.equal(plan.name, expected.name);
    assert.equal(plan.scope, expected.scope);
    assert.equal(plan.ownerAccountId, null);
    assert.equal(plan.version, 1);

    assert.deepEqual(plan.rules, {
      monthlyAllowance: expected.monthlyAllowance,
      maxUnitsPerRequest: expected.maxUnitsPerRequest,
    });
  }
});