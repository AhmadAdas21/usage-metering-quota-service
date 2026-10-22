import { Router } from "express";

import { UserController } from "../controllers/user.controller";
import type { UserService } from "../services/user.service";

export function createUserRouter(
  userService: UserService,
): Router {
  const router = Router();
  const controller = new UserController(userService);

  router.post("/", controller.createUser);
  router.get("/:userId", controller.getUser);
  router.put("/:userId/plan", controller.changePlan);

  return router;
}
