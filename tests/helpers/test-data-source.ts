import "reflect-metadata";

import { join } from "node:path";
import { DataSource } from "typeorm";

import { Account } from "../../models/account.model";
import { ConsumptionRequest } from "../../models/consumption-request.model";
import {
  AccountMonthlyUsage,
  UserMonthlyUsage,
} from "../../models/monthly-usage.model";
import { Plan } from "../../models/plan.model";
import { User } from "../../models/user.model";
import { seedPredefinedPlans } from "../../database/seeds/initial-plans.seed";

export function createTestDataSource(): DataSource {
  return new DataSource({
    type: "postgres",
    host: "127.0.0.1",
    port: 5434,
    username: "usage_test",
    password: "local_test_password",
    database: "usage_metering_test",
    entities: [
      Plan,
      Account,
      User,
      AccountMonthlyUsage,
      UserMonthlyUsage,
      ConsumptionRequest,
    ],
    migrations: [
      join(
        __dirname,
        "../../database/migrations/*.{ts,js}",
      ).replace(/\\/g, "/"),
    ],
    synchronize: false,
    logging: false,
  });
}

export async function initializeTestDatabase(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.initialize();

  try {
    await dataSource.runMigrations();
    await seedPredefinedPlans(dataSource);
  } catch (error) {
    await dataSource.destroy();
    throw error;
  }
}