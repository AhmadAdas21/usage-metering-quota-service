import type {
  Request,
  Response,
  NextFunction,
} from "express";
import { validateCreatePlan } from "../validation/create_plan.validation";
import type { PlanService } from "../services/plan.service";

export class PlanController {
  constructor(
    private readonly planService: PlanService,
  ) {}

  listPlans = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.planService.listPlans(
        res.locals.account.id,
      );

      res.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  };
  createPlan = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const request = validateCreatePlan(req.body);

    const result = await this.planService.createPlan(
      res.locals.account.id,
      request,
    );

    res.status(201).json(result);
  } catch (error: unknown) {
    next(error);
  }
};
}