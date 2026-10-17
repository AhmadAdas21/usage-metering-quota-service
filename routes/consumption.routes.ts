import { Router } from "express";

import { ConsumptionController } from "../controllers/consumption.controller";
import type { ConsumptionService } from "../services/consumption.service";

export function createConsumptionRouter(
  consumptionService: ConsumptionService,
): Router {
  const router = Router();
  const controller = new ConsumptionController(
    consumptionService,
  );

  router.post("/", controller.consume);

  return router;
}