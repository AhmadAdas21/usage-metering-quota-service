import { Router } from "express";

import { AccountController } from "../controllers/account.controller";
import type { AccountService } from "../services/account.service";

export function createAccountRouter(
  accountService: AccountService,
): Router {
  const router = Router();
  const controller = new AccountController(accountService);

  router.post("/", controller.createAccount);

  return router;
}