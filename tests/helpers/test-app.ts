import "reflect-metadata";

import { createServer } from "node:http";
import type { Server } from "node:http";

import { createApp } from "../../app";
import {
  createTestDataSource,
  initializeTestDatabase,
} from "./test-data-source";

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });

    server.closeIdleConnections();
  });
}

export async function startTestApp() {
  const dataSource = createTestDataSource();

  await initializeTestDatabase(dataSource);

  const server = createServer(createApp(dataSource));

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);

      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Could not determine the test server port");
    }

    return {
      dataSource,
      baseUrl: `http://127.0.0.1:${address.port}`,

      async stop(): Promise<void> {
        try {
          await closeServer(server);
        } finally {
          if (dataSource.isInitialized) {
            await dataSource.destroy();
          }
        }
      },
    };
  } catch (error) {
    try {
      await closeServer(server);
    } finally {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }

    throw error;
  }
}

export type TestApp = Awaited<ReturnType<typeof startTestApp>>;