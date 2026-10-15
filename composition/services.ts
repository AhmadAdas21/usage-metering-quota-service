import type { DataSource } from "typeorm";

import { Account } from "../models/account.model";
import { Plan } from "../models/plan.model";
import { User } from "../models/user.model";

import { AccountService } from "../services/account.service";
import { UserService } from "../services/user.service";

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

  return {
    accountService,
    userService,
  };
}