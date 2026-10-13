import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import { Plan } from "../models/plan.model";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing");
}

export const AppDataSource = new DataSource({
  type: "postgres",
  url: databaseUrl,
  entities: [Plan],
  migrations: [__dirname + "/migrations/*.{ts,js}"],
  synchronize: false,
});