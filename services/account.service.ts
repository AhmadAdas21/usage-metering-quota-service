import { IsNull } from "typeorm";
import type { Repository } from "typeorm";

import type {
  CreateAccountRequest,
  CreateAccountResponse,
} from "../dtos/account.dto";
import { ApplicationError } from "../error/application-error";
import { Account } from "../models/account.model";
import { Plan } from "../models/plan.model";
import type { ChangePlanRequest } from "../dtos/change-plan.dto";
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
  async changePlan(
  accountId: string,
  request: ChangePlanRequest,
) {
  if (!UUID_PATTERN.test(request.planId)) {
    throw new ApplicationError(
      "INVALID_PLAN_ID",
      "Plan ID must be a valid UUID.",
    );
  }

  return this.accountRepository.manager.transaction(
    async (manager) => {
      const accountRepository = manager.getRepository(Account);
      const planRepository = manager.getRepository(Plan);

      const account = await accountRepository.findOne({
        where: {
          id: accountId,
        },
        lock: {
          mode: "pessimistic_write",
        },
      });

      if (!account) {
        throw new ApplicationError(
          "ACCOUNT_NOT_FOUND",
          "Account was not found.",
        );
      }

      const plan = await planRepository.findOneBy([
        {
          id: request.planId,
          scope: "account",
          ownerAccountId: IsNull(),
        },
        {
          id: request.planId,
          scope: "account",
          ownerAccountId: accountId,
        },
      ]);

      if (!plan) {
        throw new ApplicationError(
          "PLAN_NOT_AVAILABLE",
          "Choose an available account plan owned by your account or a predefined account plan.",
        );
      }

      await accountRepository.update(
        { id: accountId },
        { planId: plan.id },
      );

      return {
        account: {
          id: account.id,
          name: account.name,
          planId: plan.id,
          createdAt: account.createdAt.toISOString(),
        },
      };
    },
  );
}
  
}