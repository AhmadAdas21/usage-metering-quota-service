import { pool } from "./database"

async function checkConnection(): Promise<void> {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, NOW() AS time",
    );

    console.log("Database connected:", result.rows[0]);
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkConnection();