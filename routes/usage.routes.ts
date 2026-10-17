import { Router } from "express";

import { UsageController } from "../controllers/usage.controller";
import type { UsageService } from "../services/usage.service";

export function createUsageRouter(
  usageService: UsageService,
): Router {
  const router = Router();
  const controller = new UsageController(usageService);

  router.get("/account", controller.getAccountUsage);
  router.get("/users/:userId", controller.getUserUsage);

  return router;
}