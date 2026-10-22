import { Router } from "express";
import type { RequestHandler } from "express";

import { AccountController } from "../controllers/account.controller";
import type { AccountService } from "../services/account.service";

export function createAccountRouter(
  accountService: AccountService,
  apiKeyAuth: RequestHandler,
): Router {
  const router = Router();
  const controller = new AccountController(accountService);

  router.post("/", controller.createAccount);
  router.get("/me/plan", apiKeyAuth, controller.getCurrentPlan);
  router.put("/me/plan", apiKeyAuth, controller.changePlan);

  return router;
}
