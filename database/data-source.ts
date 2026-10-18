import "reflect-metadata";
import "dotenv/config";

import { DataSource } from "typeorm";
import { Account } from "../models/account.model";
import { ConsumptionRequest } from "../models/consumption-request.model";
import {
  AccountMonthlyUsage,
  UserMonthlyUsage,
} from "../models/monthly-usage.model";
import { Plan } from "../models/plan.model";
import { User } from "../models/user.model";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing");
}
export const AppDataSource = new DataSource({
  type: "postgres",
  url: databaseUrl,
  entities: [
    Plan,
    Account,
    User,
    AccountMonthlyUsage,
    UserMonthlyUsage,
    ConsumptionRequest,
  ],
  migrations: [__dirname + "/migrations/*.{ts,js}"],
  synchronize: false,
});