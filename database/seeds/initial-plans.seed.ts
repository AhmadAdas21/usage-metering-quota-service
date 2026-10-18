import type { DataSource } from "typeorm";
import { Plan } from "../../models/plan.model";
import type {
  PlanRules,
  PlanScope,
} from "../../models/plan.model";

interface initialPlan {
  id: string;
  name: string;
  scope: PlanScope;
  ownerAccountId: null;
  rules: PlanRules;
  version: number;
}

const predefinedPlans: initialPlan[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Starter",
    scope: "account",
    ownerAccountId: null,
    rules: {
      monthlyAllowance: 10_000,
      maxUnitsPerRequest: 100,
    },
    version: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Pro",
    scope: "account",
    ownerAccountId: null,
    rules: {
      monthlyAllowance: 100_000,
      maxUnitsPerRequest: 1_000,
    },
    version: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Basic",
    scope: "user",
    ownerAccountId: null,
    rules: {
      monthlyAllowance: 1_000,
      maxUnitsPerRequest: 20,
    },
    version: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    name: "Premium",
    scope: "user",
    ownerAccountId: null,
    rules: {
      monthlyAllowance: 10_000,
      maxUnitsPerRequest: 200,
    },
    version: 1,
  },
];

export async function seedPredefinedPlans(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await manager.createQueryBuilder().insert().into(Plan).values(predefinedPlans).orIgnore().execute();
  });
}