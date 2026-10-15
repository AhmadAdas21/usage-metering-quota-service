import type { Request, Response, NextFunction } from "express";

import type { AccountService } from "../services/account.service";
import { validateCreateAccount } from "../validation/create-account.validation";

export class AccountController {
  constructor(
    private readonly accountService: AccountService,
  ) {}

  createAccount = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const request = validateCreateAccount(req.body);

      const result =
        await this.accountService.createAccount(request);

      res.setHeader("Cache-Control", "no-store");
      res.status(201).json(result);
    } catch (error: unknown) {
      next(error);
    }
  };
}