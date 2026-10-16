import express from "express";

import type { Express } from "express";
import type { DataSource } from "typeorm";
import { createApiKeyAuth } from "./middleware/api-key-authintication";
import { Account } from "./models/account.model";
import { createServices } from "./composition/services";
import { createAccountRouter } from "./routes/account.routes";
import { errorHandler } from "./middleware/error-handler";
import { createUserRouter } from "./routes/user.routes";
import { createPlanRouter } from "./routes/plan.router";
export function createApp(dataSource: DataSource): Express {
  const app = express();
  const services = createServices(dataSource);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
 // app.use( "/accounts",createAccountRouter(services.accountService),);
  const apiKeyAuth = createApiKeyAuth(
  dataSource.getRepository(Account),
);
app.use("/accounts",createAccountRouter(services.accountService, apiKeyAuth),);

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