import { IsNull, QueryFailedError } from "typeorm";
import type { Repository } from "typeorm";

import type {
  CreateUserRequest,
  CreateUserResponse,
} from "../dtos/user.dto";
import type { ChangePlanRequest } from "../dtos/change-plan.dto";
import { ApplicationError } from "../error/application-error";
import { Plan } from "../models/plan.model";
import { User } from "../models/user.model";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDuplicateUserError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError: unknown = error.driverError;

  return (
    typeof driverError === "object" &&
    driverError !== null &&
    "code" in driverError &&
    driverError.code === "23505" &&
    "constraint" in driverError &&
    driverError.constraint === "UQ_users_account_external"
  );
}

export class UserService {
  constructor(
    private readonly userRepository: Repository<User>,
    private readonly planRepository: Repository<Plan>,
  ) {}

  async createUser(
    accountId: string,
    request: CreateUserRequest,
  ): Promise<CreateUserResponse> {
    const externalId = request.externalId.trim();

    if (externalId.length === 0 || externalId.length > 100) {
      throw new ApplicationError(
        "INVALID_EXTERNAL_ID",
        "External ID must contain between 1 and 100 characters.",
      );
    }

    if (!UUID_PATTERN.test(request.planId)) {
      throw new ApplicationError(
        "INVALID_PLAN_ID",
        "Plan ID must be a valid UUID.",
      );
    }

    const plan = await this.planRepository.findOneBy([
      {
        id: request.planId,
        scope: "user",
        ownerAccountId: IsNull(),
      },
      {
        id: request.planId,
        scope: "user",
        ownerAccountId: accountId,
      },
    ]);

    if (!plan) {
      throw new ApplicationError(
        "PLAN_NOT_AVAILABLE",
        "Choose an available user plan owned by your account or a predefined user plan.",
      );
    }

    const user = this.userRepository.create({
      accountId,
      externalId,
      planId: plan.id,
    });

    let savedUser: User;

    try {
      savedUser = await this.userRepository.save(user);
    } catch (error: unknown) {
      if (isDuplicateUserError(error)) {
        throw new ApplicationError(
          "USER_ALREADY_EXISTS",
          "A user with this external ID already exists in your account.",
        );
      }

      throw error;
    }

    return {
      user: {
        id: savedUser.id,
        accountId: savedUser.accountId,
        externalId: savedUser.externalId,
        planId: savedUser.planId,
        createdAt: savedUser.createdAt.toISOString(),
      },
    };
  }

  // Scope by accountId before fetching the user's assigned plan.
  async getUser(accountId: string, userId: string) {
    if (!UUID_PATTERN.test(userId)) {
      throw new ApplicationError(
        "INVALID_USER_ID",
        "User ID must be a valid UUID.",
      );
    }

    return this.userRepository.manager.transaction(
      "REPEATABLE READ",
      async (manager) => {
        const user = await manager.getRepository(User).findOneBy({
          id: userId,
          accountId,
        });

        if (!user) {
          throw new ApplicationError(
            "USER_NOT_FOUND",
            "User was not found.",
          );
        }

        const plan = await manager.getRepository(Plan).findOneBy({
          id: user.planId,
          scope: "user",
        });

        if (!plan) {
          throw new ApplicationError(
            "PLAN_NOT_FOUND",
            "User plan was not found.",
          );
        }

        return {
          user: {
            id: user.id,
            accountId: user.accountId,
            externalId: user.externalId,
            planId: user.planId,
            createdAt: user.createdAt.toISOString(),
          },
          plan: {
            id: plan.id,
            name: plan.name,
            scope: plan.scope,
            rules: plan.rules,
            version: plan.version,
            isPredefined: plan.ownerAccountId === null,
          },
        };
      },
    );
  }

  async changePlan(
    accountId: string,
    userId: string,
    request: ChangePlanRequest,
  ) {
    if (!UUID_PATTERN.test(userId)) {
      throw new ApplicationError(
        "INVALID_USER_ID",
        "User ID must be a valid UUID.",
      );
    }

    if (!UUID_PATTERN.test(request.planId)) {
      throw new ApplicationError(
        "INVALID_PLAN_ID",
        "Plan ID must be a valid UUID.",
      );
    }

    return this.userRepository.manager.transaction(
      async (manager) => {
        const userRepository = manager.getRepository(User);
        const planRepository = manager.getRepository(Plan);

        const user = await userRepository.findOne({
          where: { id: userId, accountId },
          lock: { mode: "pessimistic_write" },
        });

        if (!user) {
          throw new ApplicationError(
            "USER_NOT_FOUND",
            "User was not found.",
          );
        }

        const plan = await planRepository.findOneBy([
          {
            id: request.planId,
            scope: "user",
            ownerAccountId: IsNull(),
          },
          {
            id: request.planId,
            scope: "user",
            ownerAccountId: accountId,
          },
        ]);

        if (!plan) {
          throw new ApplicationError(
            "PLAN_NOT_AVAILABLE",
            "Choose an available user plan.",
          );
        }

        await userRepository.update(
          { id: userId, accountId },
          { planId: plan.id },
        );

        return {
          user: {
            id: user.id,
            accountId: user.accountId,
            externalId: user.externalId,
            planId: plan.id,
            createdAt: user.createdAt.toISOString(),
          },
        };
      },
    );
  }
}
