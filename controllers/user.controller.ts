import type {
  Request,
  Response,
  NextFunction,
} from "express";

import type { UserService } from "../services/user.service";
import { validateCreateUser } from "../validation/create-user.validation";

export class UserController {
  constructor(
    private readonly userService: UserService,
  ) {}

  createUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const request = validateCreateUser(req.body);

      const result = await this.userService.createUser(
        res.locals.account.id,
        request,
      );

      res.status(201).json(result);
    } catch (error: unknown) {
      next(error);
    }
  };
}