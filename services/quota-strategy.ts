
import type {
  PlanRules,
  PlanScope,
} from "../models/plan.model";

import type {
  RejectionReason,
} from "../models/consumption-request.model";

export interface QuotaEvaluationInput {
  units: number;
  accountRules: PlanRules;
  userRules: PlanRules;
  accountConsumedUnits: number;
  userConsumedUnits: number;
}

interface QuotaLevel {
  scope: PlanScope;
  rules: PlanRules;
  consumedUnits: number;
}

type RuleEvaluator = (
  level: QuotaLevel,
  units: number,
) => RejectionReason | null;

const maxUnitsRule: RuleEvaluator = (level, units) => {
  if (units <= level.rules.maxUnitsPerRequest) {
    return null;
  }

  return {
    scope: level.scope,
    rule: "max_units_per_request",
    limit: level.rules.maxUnitsPerRequest,
    usedBefore: level.consumedUnits,
  };
};

const monthlyAllowanceRule: RuleEvaluator = (
  level,
  units,
) => {
  const remaining = Math.max(
    0,
    level.rules.monthlyAllowance - level.consumedUnits,
  );

  if (units <= remaining) {
    return null;
  }

  return {
    scope: level.scope,
    rule: "monthly_allowance",
    limit: level.rules.monthlyAllowance,
    usedBefore: level.consumedUnits,
  };
};

const ruleEvaluators: RuleEvaluator[] = [
  maxUnitsRule,
  monthlyAllowanceRule,
];

export function evaluateQuota(
  input: QuotaEvaluationInput,
): RejectionReason | null {
  const levels: QuotaLevel[] = [
    {
      scope: "account",
      rules: input.accountRules,
      consumedUnits: input.accountConsumedUnits,
    },
    {
      scope: "user",
      rules: input.userRules,
      consumedUnits: input.userConsumedUnits,
    },
  ];

  for (const evaluator of ruleEvaluators) {
    for (const level of levels) {
      const rejection = evaluator(level, input.units);

      if (rejection !== null) {
        return rejection;
      }
    }
  }

  return null;
}
