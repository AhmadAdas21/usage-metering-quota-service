import type { PlanRules, PlanScope } from "./plan.model";
import type { UsageMonth } from "./monthly-usage.model";

export type RejectionRule =
  | "monthly_allowance"
  | "max_units_per_request";

export interface RejectionReason {
  scope: PlanScope;
  rule: RejectionRule;
  limit: number;
  usedBefore: number;
}

export interface Usage {
  used: number;
  remaining: number;
}

export interface PlanSnapshot {
  id: string;
  version: number;
  rules: PlanRules;
}

export interface ConsumptionResult {
  requestId: string;
  userId: string;
  units: number;
  month: UsageMonth;
  processedAt: string;

  accepted: boolean;
  rejection: RejectionReason | null;

  accountUsage: Usage;
  userUsage: Usage;
}

export interface ConsumptionRequest {
  id: string;
  accountId: string;
  userId: string;
  requestId: string;
  units: number;
  payloadHash: string;

  accountPlan: PlanSnapshot;
  userPlan: PlanSnapshot;
  result: ConsumptionResult;

  createdAt: Date;
}