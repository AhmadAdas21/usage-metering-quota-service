import { IsNull } from "typeorm";
import type { Repository } from "typeorm";
import type {
  CreatePlanRequest,
  UpdatePlanRequest,
} from "../dtos/plan.dtp";

import { ApplicationError } from "../error/application-error";
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
async updatePlan(
  accountId: string,
  planId: string,
  request: UpdatePlanRequest,
) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(planId)) {
    throw new ApplicationError(
      "INVALID_PLAN_ID",
      "Plan ID must be a valid UUID.",
    );
  }

  return this.planRepository.manager.transaction(
    async (manager) => {
      const planRepository = manager.getRepository(Plan);

      const plan = await planRepository.findOne({
        where: {
          id: planId,
          ownerAccountId: accountId,
        },
        lock: {
          mode: "pessimistic_write",
        },
      });

      if (!plan) {
        throw new ApplicationError(
          "PLAN_NOT_FOUND",
          "Editable plan was not found in your account.",
        );
      }

      if (plan.version !== request.expectedVersion) {
        throw new ApplicationError(
          "PLAN_VERSION_CONFLICT",
          "Plan has changed. Fetch the latest version and try again.",
        );
      }

      plan.name = request.name;
      plan.rules = {
        monthlyAllowance: request.rules.monthlyAllowance,
        maxUnitsPerRequest: request.rules.maxUnitsPerRequest,
      };
      plan.version += 1;

      const savedPlan = await planRepository.save(plan);

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
    },
  );
}
}