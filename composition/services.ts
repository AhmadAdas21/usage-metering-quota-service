import type { DataSource } from "typeorm";

import { Account } from "../models/account.model";
import { Plan } from "../models/plan.model";
import { User } from "../models/user.model";
import { ConsumptionService } from "../services/consumption.service";
import { AccountService } from "../services/account.service";
import { PlanService } from "../services/plan.service";
import { UserService } from "../services/user.service";
import { UsageService } from "../services/usage.service";
export function createServices(dataSource: DataSource) {
  const planRepository = dataSource.getRepository(Plan);

  const accountService = new AccountService(
    dataSource.getRepository(Account),
    planRepository,
  );

  const userService = new UserService(
    dataSource.getRepository(User),
    planRepository,
  );

  const planService = new PlanService(planRepository);
  const consumptionService = new ConsumptionService(dataSource);
  const usageService = new UsageService(dataSource);
  return {
    accountService,
    userService,
    planService,
    usageService,
    consumptionService,
  };
}