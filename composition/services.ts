import type { DataSource } from "typeorm";

import { Account } from "../models/account.model";
import { Plan } from "../models/plan.model";
import { AccountService } from "../services/account.service";

export function createServices(dataSource: DataSource) {
  const accountService = new AccountService(
    dataSource.getRepository(Account),
    dataSource.getRepository(Plan),
  );

  return {
    accountService,
  };
}