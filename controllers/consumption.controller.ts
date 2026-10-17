import type {
  Request,
  Response,
  NextFunction,
} from "express";

import type { ConsumptionService } from "../services/consumption.service";
import { validateConsumeUnits } from "../validation/consume-units.validation";

export class ConsumptionController {
  constructor(
    private readonly consumptionService: ConsumptionService,
  ) {}

  consume = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const request = validateConsumeUnits(req.body);

      const result = await this.consumptionService.consume(
        res.locals.account.id,
        request,
      );

      res.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  };
}