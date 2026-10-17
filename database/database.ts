import "dotenv/config";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing");
}

export const pool = new Pool({
  connectionString: databaseUrl, max: 10,connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

pool.on("error", (error) => {
  console.error("Database connection error:", error);
});