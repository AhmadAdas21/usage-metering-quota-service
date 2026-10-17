import { Router } from "express";

import { PlanController } from "../controllers/plan.controller";
import type { PlanService } from "../services/plan.service";

export function createPlanRouter(
  planService: PlanService,
): Router {
  const router = Router();
  const controller = new PlanController(planService);

  router.get("/", controller.listPlans);
  router.post("/", controller.createPlan);
  router.put("/:planId", controller.updatePlan);
  return router;
}