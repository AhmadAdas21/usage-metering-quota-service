import type { DataSource } from "typeorm";

import type {
  AccountUsageResponse,
  UserUsageResponse,
  UsageQuery,
} from "../dtos/usage.dto";
import { ApplicationError } from "../error/application-error";
import { Account } from "../models/account.model";
import {
  AccountMonthlyUsage,
  UserMonthlyUsage,
} from "../models/monthly-usage.model";
import { Plan } from "../models/plan.model";
import { User } from "../models/user.model";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UsageService {
  constructor(
    private readonly dataSource: DataSource,
  ) {}

  async getAccountUsage(
    accountId: string,
    query: UsageQuery,
  ): Promise<AccountUsageResponse> {
    return this.dataSource.transaction(
      "REPEATABLE READ",
      async (manager) => {
        const account = await manager
          .getRepository(Account)
          .findOneBy({ id: accountId });

        if (!account) {
          throw new ApplicationError(
            "ACCOUNT_NOT_FOUND",
            "Account was not found.",
          );
        }

        const plan = await manager
          .getRepository(Plan)
          .findOneBy({
            id: account.planId,
            scope: "account",
          });

        if (!plan) {
          throw new ApplicationError(
            "PLAN_NOT_FOUND",
            "Account plan was not found.",
          );
        }

        const monthlyUsage = await manager
          .getRepository(AccountMonthlyUsage)
          .findOneBy({
            accountId,
            month: query.month,
          });

        const used = monthlyUsage?.consumedUnits ?? 0;
        const monthlyAllowance = plan.rules.monthlyAllowance;

        return {
          accountId,
          month: query.month,
          usage: {
            used,
            remaining: Math.max(0, monthlyAllowance - used),
            monthlyAllowance,
          },
        };
      },
    );
  }

  async getUserUsage(
    accountId: string,
    userId: string,
    query: UsageQuery,
  ): Promise<UserUsageResponse> {
    if (!UUID_PATTERN.test(userId)) {
      throw new ApplicationError(
        "INVALID_USER_ID",
        "User ID must be a valid UUID.",
      );
    }

    return this.dataSource.transaction(
      "REPEATABLE READ",
      async (manager) => {
        const user = await manager
          .getRepository(User)
          .findOneBy({
            id: userId,
            accountId,
          });

        if (!user) {
          throw new ApplicationError(
            "USER_NOT_FOUND",
            "User was not found.",
          );
        }

        const plan = await manager
          .getRepository(Plan)
          .findOneBy({
            id: user.planId,
            scope: "user",
          });

        if (!plan) {
          throw new ApplicationError(
            "PLAN_NOT_FOUND",
            "User plan was not found.",
          );
        }

        const monthlyUsage = await manager
          .getRepository(UserMonthlyUsage)
          .findOneBy({
            accountId,
            userId: user.id,
            month: query.month,
          });

        const used = monthlyUsage?.consumedUnits ?? 0;
        const monthlyAllowance = plan.rules.monthlyAllowance;

        return {
          accountId,
          userId: user.id,
          month: query.month,
          usage: {
            used,
            remaining: Math.max(0, monthlyAllowance - used),
            monthlyAllowance,
          },
        };
      },
    );
  }
}