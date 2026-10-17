import "reflect-metadata";
import "dotenv/config";

import { createServer } from "node:http";
import { createApp } from "./app";
import { AppDataSource } from "./database/data-source";

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? "3000");

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  await AppDataSource.initialize();
  console.log("Database connected");

  const app = createApp(AppDataSource);
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);

    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.log(`API running at http://localhost:${port}`);

  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`${signal} received. Shutting down...`);

    const timeout = setTimeout(() => {
      console.error("Shutdown timed out");
      process.exit(1);
    }, 10_000);

    timeout.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      await AppDataSource.destroy();
      console.log("Server stopped and database connection closed");
    } catch (error) {
      console.error("Shutdown failed:", error);
      process.exitCode = 1;
    } finally {
      clearTimeout(timeout);
    }
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void bootstrap().catch(async (error: unknown) => {
  console.error("Failed to start the API:", error);
  process.exitCode = 1;

  if (AppDataSource.isInitialized) {
    try {
      await AppDataSource.destroy();
    } catch (cleanupError) {
      console.error("Failed to close database connection:", cleanupError);
    }
  }
});