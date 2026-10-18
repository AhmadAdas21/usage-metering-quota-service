import type {
  Request,
  Response,
  NextFunction,
} from "express";

import { ApplicationError } from "../error/application-error";
import type { UsageService } from "../services/usage.service";
import { validateUsageQuery } from "../validation/usage-query.validation";

export class UsageController {
  constructor(
    private readonly usageService: UsageService,
  ) {}

  getAccountUsage = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = validateUsageQuery(req.query.month);

      const result = await this.usageService.getAccountUsage(
        res.locals.account.id,
        query,
      );

      res.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  };

  getUserUsage = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.params.userId;

      if (typeof userId !== "string") {
        throw new ApplicationError(
          "INVALID_USER_ID",
          "User ID must be a valid UUID.",
        );
      }

      const query = validateUsageQuery(req.query.month);

      const result = await this.usageService.getUserUsage(
        res.locals.account.id,
        userId,
        query,
      );

      res.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  };
}