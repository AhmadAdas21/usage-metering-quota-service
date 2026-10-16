import type {
  Request,
  Response,
  NextFunction,
} from "express";

import type { UserService } from "../services/user.service";
import { validateCreateUser } from "../validation/create-user.validation";
import { validateChangePlan } from "../validation/change-plan.validation";
import { ApplicationError } from "../error/application-error";
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
  
changePlan = async (
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

    const request = validateChangePlan(req.body);

    const result = await this.userService.changePlan(
      res.locals.account.id,
      userId,
      request,
    );

    res.status(200).json(result);
  } catch (error: unknown) {
    next(error);
  }
};

}