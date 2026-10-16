import type {
  Request,
  Response,
  NextFunction,
} from "express";
import { validateCreatePlan } from "../validation/create_plan.validation";
import type { PlanService } from "../services/plan.service";
import { validateUpdatePlan } from "../validation/update_plan.validation";
import { ApplicationError } from "../error/application-error";
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
updatePlan = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const planId = req.params.planId;

    if (typeof planId !== "string") {
      throw new ApplicationError(
        "INVALID_PLAN_ID",
        "Plan ID must be a valid UUID.",
      );
    }

    const request = validateUpdatePlan(req.body);

    const result = await this.planService.updatePlan(
      res.locals.account.id,
      planId,
      request,
    );

    res.status(200).json(result);
  } catch (error: unknown) {
    next(error);
  }
};
}