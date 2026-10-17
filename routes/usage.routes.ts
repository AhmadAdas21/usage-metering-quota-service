import { Router } from "express";

import { UsageController } from "../controllers/usage.controller";
import { UsageHistoryController } from "../controllers/usage-history.controller";
import type { UsageService } from "../services/usage.service";
import type { UsageHistoryService } from "../services/usage-history.service";

export function createUsageRouter(
  usageService: UsageService,
  usageHistoryService: UsageHistoryService,
): Router {
  const router = Router();

  const usageController = new UsageController(usageService);
  const historyController = new UsageHistoryController(
    usageHistoryService,
  );

  router.get("/account", usageController.getAccountUsage);
  router.get("/users/:userId", usageController.getUserUsage);
  router.get("/history", historyController.getHistory);

  return router;
}