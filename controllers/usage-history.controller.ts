import type {
  Request,
  Response,
  NextFunction,
} from "express";

import type { UsageHistoryService } from "../services/usage-history.service";
import { validateUsageHistoryQuery } from "../validation/usage-history-query.validation";

export class UsageHistoryController {
  constructor(
    private readonly usageHistoryService: UsageHistoryService,
  ) {}

  getHistory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = validateUsageHistoryQuery({
        month: req.query.month,
        page: req.query.page,
        pageSize: req.query.pageSize,
        userId: req.query.userId,
      });

      const result = await this.usageHistoryService.getHistory(
        res.locals.account.id,
        query,
      );

      res.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  };
}