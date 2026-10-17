import { AppDataSource } from "./data-source";
import { seedPredefinedPlans } from "./seeds/initial-plans.seed";

async function initializeDatabase(): Promise<void> {
  try {
    await AppDataSource.initialize();

    const migrations = await AppDataSource.runMigrations();

    console.log(`Applied migrations: ${migrations.length}`);

    await seedPredefinedPlans(AppDataSource);

    console.log("Predefined plans are ready.");
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

initializeDatabase().catch((error: unknown) => {
  console.error("Database initialization failed:", error);
  process.exitCode = 1;
});