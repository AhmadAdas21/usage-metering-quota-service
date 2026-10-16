
import type { DataSource, EntityManager } from "typeorm";

import { Account } from "../models/account.model";
import { User } from "../models/user.model";
import { ApplicationError } from "../error/application-error";
import { Plan } from "../models/plan.model";
import { createHash } from "node:crypto";
import { ConsumptionRequest } from "../models/consumption-request.model";
import type { ConsumptionResult } from "../models/consumption-request.model";
import {
  AccountMonthlyUsage,
  UserMonthlyUsage,
} from "../models/monthly-usage.model";
import type { ConsumeUnitsRequest } from "../dtos/consume-units.dto";
import { evaluateQuota } from "./quota-strategy";
export class ConsumptionService {
  constructor(
    private readonly dataSource: DataSource,
  ) {}

  private async lockAccountAndUser(
    manager: EntityManager,
    accountId: string,
    userId: string,
  ): Promise<{ account: Account; user: User }> {
    const account = await manager.getRepository(Account).findOne({
      where: { id: accountId },
      lock: { mode: "pessimistic_write" },
      
    });
    

    if (!account) {
      throw new ApplicationError(
        "ACCOUNT_NOT_FOUND",
        "Account was not found.",
      );
    }

    const user = await manager.getRepository(User).findOne({
      where: { id: userId, accountId },
      lock: { mode: "pessimistic_write" },
    });

    if (!user) {
      throw new ApplicationError(
        "USER_NOT_FOUND",
        "User was not found.",
      );
      
    }

    return { account, user };
  }
  
private async loadPlans(
  manager: EntityManager,
  account: Account,
  user: User,
): Promise<{ accountPlan: Plan; userPlan: Plan }> {
  const planRepository = manager.getRepository(Plan);

  const accountPlan = await planRepository.findOne({
    where: {
      id: account.planId,
      scope: "account",
    },
    lock: { mode: "pessimistic_read" },
  });

  if (!accountPlan) {
    throw new ApplicationError(
      "PLAN_NOT_FOUND",
      "Account plan was not found.",
    );
  }

  const userPlan = await planRepository.findOne({
    where: {
      id: user.planId,
      scope: "user",
    },
    lock: { mode: "pessimistic_read" },
  });

  if (!userPlan) {
    throw new ApplicationError(
      "PLAN_NOT_FOUND",
      "User plan was not found.",
    );
  }
  

  return { accountPlan, userPlan };
}

private async loadMonthlyUsage(
  manager: EntityManager,
  accountId: string,
  userId: string,
  month: string,
): Promise<{
  accountConsumedUnits: number;
  userConsumedUnits: number;
}> {
  const accountUsage = await manager
    .getRepository(AccountMonthlyUsage)
    .findOneBy({
      accountId,
      month,
    });

  const userUsage = await manager
    .getRepository(UserMonthlyUsage)
    .findOneBy({
      accountId,
      userId,
      month,
    });

  return {
    accountConsumedUnits: accountUsage?.consumedUnits ?? 0,
    userConsumedUnits: userUsage?.consumedUnits ?? 0,
  };
}


private async prepareConsumption(
  manager: EntityManager,
  accountId: string,
  request: ConsumeUnitsRequest,
  month: string,
) {
  const { account, user } = await this.lockAccountAndUser(
    manager,
    accountId,
    request.userId,
  );

  const { accountPlan, userPlan } = await this.loadPlans(
    manager,
    account,
    user,
  );

  const usage = await this.loadMonthlyUsage(
    manager,
    accountId,
    request.userId,
    month,
  );

  const rejection = evaluateQuota({
    units: request.units,
    accountRules: accountPlan.rules,
    userRules: userPlan.rules,
    accountConsumedUnits: usage.accountConsumedUnits,
    userConsumedUnits: usage.userConsumedUnits,
  });

  return {
    accountPlan,
    userPlan,
    usage,
    rejection,
  };
}

private hashPayload(request: ConsumeUnitsRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        userId: request.userId.toLowerCase(),
        units: request.units,
      }),
    )
    .digest("hex");
}

private async findPreviousResult(
  manager: EntityManager,
  accountId: string,
  request: ConsumeUnitsRequest,
): Promise<ConsumptionResult | null> {
  const previous = await manager
    .getRepository(ConsumptionRequest)
    .findOneBy({
      accountId,
      requestId: request.requestId,
    });

  if (!previous) {
    return null;
  }

  if (previous.payloadHash !== this.hashPayload(request)) {
    throw new ApplicationError(
      "REQUEST_ID_CONFLICT",
      "Request ID was already used with different data.",
    );
  }

  return previous.result;
}

}
