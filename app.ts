import express from "express";
import type { Express } from "express";
import type { DataSource } from "typeorm";

import { createServices } from "./composition/services";
import { createApiKeyAuth } from "./middleware/api-key-authintication";
import { errorHandler } from "./middleware/error-handler";
import { Account } from "./models/account.model";
import { createAccountRouter } from "./routes/account.routes";
import { createConsumptionRouter } from "./routes/consumption.routes";
import { createPlanRouter } from "./routes/plan.router";
import { createUsageRouter } from "./routes/usage.routes";
import { createUserRouter } from "./routes/user.routes";

export function createApp(dataSource: DataSource): Express {
  const app = express();
  const services = createServices(dataSource);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");

    try {
      await dataSource.query("SELECT 1");

      res.status(200).json({
        status: "ok",
      });
    } catch {
      res.status(503).json({
        status: "unavailable",
      });
    }
  });

  const apiKeyAuth = createApiKeyAuth(
    dataSource.getRepository(Account),
  );

  app.use(
    "/accounts",
    createAccountRouter(services.accountService, apiKeyAuth),
  );

  app.get("/accounts/me", apiKeyAuth, (_req, res) => {
    res.status(200).json({
      account: res.locals.account,
    });
  });

  app.use(
    "/users",
    apiKeyAuth,
    createUserRouter(services.userService),
  );

  app.use(
    "/plans",
    apiKeyAuth,
    createPlanRouter(services.planService),
  );

  app.use(
    "/consumption",
    apiKeyAuth,
    createConsumptionRouter(services.consumptionService),
  );

  app.use(
    "/usage",
    apiKeyAuth,
    createUsageRouter(
      services.usageService,
      services.usageHistoryService,
    ),
  );

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "The requested route does not exist.",
      },
    });
  });

  app.use(errorHandler);

  return app;
}