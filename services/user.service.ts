import { IsNull, QueryFailedError } from "typeorm";
import type { Repository } from "typeorm";

import type {
  CreateUserRequest,
  CreateUserResponse,
} from "../dtos/user.dto";
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
}