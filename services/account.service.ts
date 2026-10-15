import { IsNull } from "typeorm";
import type { Repository } from "typeorm";

import type {
  CreateAccountRequest,
  CreateAccountResponse,
} from "../dtos/account.dto";
import { ApplicationError } from "../error/application-error";
import { Account } from "../models/account.model";
import { Plan } from "../models/plan.model";
import {
  generateApiKey,
  hashApiKey,
} from "../security/api-key";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AccountService {
  constructor(
    private readonly accountRepository: Repository<Account>,
    private readonly planRepository: Repository<Plan>,
  ) {}

  async createAccount(
    request: CreateAccountRequest,
  ): Promise<CreateAccountResponse> {
    const name = request.name.trim();

    if (name.length === 0 || name.length > 100) {
      throw new ApplicationError(
        "INVALID_ACCOUNT_NAME",
        "Account name must contain between 1 and 100 characters.",
      );
    }

    if (!UUID_PATTERN.test(request.planId)) {
      throw new ApplicationError(
        "INVALID_PLAN_ID",
        "Plan ID must be a valid UUID.",
      );
    }

    const plan = await this.planRepository.findOneBy({
      id: request.planId,
      scope: "account",
      ownerAccountId: IsNull(),
    });

    if (!plan) {
      throw new ApplicationError(
        "PLAN_NOT_AVAILABLE",
        "Choose an available predefined account plan.",
      );
    }

    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    const account = this.accountRepository.create({
      name,
      planId: plan.id,
      apiKeyHash,
    });

    const savedAccount =
      await this.accountRepository.save(account);

    return {
      account: {
        id: savedAccount.id,
        name: savedAccount.name,
        planId: savedAccount.planId,
        createdAt: savedAccount.createdAt.toISOString(),
      },
      apiKey,
    };
  }
}