import express from "express";
import type { Express } from "express";
import type { DataSource } from "typeorm";

import { createServices } from "./composition/services";
import { createAccountRouter } from "./routes/account.routes";
import { errorHandler } from "./middleware/error-handler";

export function createApp(dataSource: DataSource): Express {
  const app = express();
  const services = createServices(dataSource);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use( "/accounts",createAccountRouter(services.accountService),);
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