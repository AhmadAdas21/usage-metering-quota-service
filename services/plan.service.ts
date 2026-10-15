import { IsNull } from "typeorm";
import type { Repository } from "typeorm";
import type { CreatePlanRequest } from "../dtos/plan.dtp";
import { Plan } from "../models/plan.model";

export class PlanService {
  constructor(
    private readonly planRepository: Repository<Plan>,
  ) {}

  async listPlans(accountId: string) {
    const plans = await this.planRepository.find({
      where: [
        { ownerAccountId: IsNull() },
        { ownerAccountId: accountId },
      ],
      order: {
        scope: "ASC",
        name: "ASC",
        id: "ASC",
      },
    });

    return {
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        scope: plan.scope,
        rules: plan.rules,
        version: plan.version,
        isPredefined: plan.ownerAccountId === null,
      })),
    };
  }
  async createPlan(
  accountId: string,
  request: CreatePlanRequest,
) {
  const plan = this.planRepository.create({
    name: request.name,
    scope: request.scope,
    ownerAccountId: accountId,
    rules: {
      monthlyAllowance: request.rules.monthlyAllowance,
      maxUnitsPerRequest: request.rules.maxUnitsPerRequest,
    },
    version: 1,
  });

  const savedPlan = await this.planRepository.save(plan);

  return {
    plan: {
      id: savedPlan.id,
      name: savedPlan.name,
      scope: savedPlan.scope,
      rules: savedPlan.rules,
      version: savedPlan.version,
      isPredefined: false,
    },
  };
}
}