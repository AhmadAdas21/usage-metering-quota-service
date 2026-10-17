import type {
  PlanRules,
  PlanScope,
} from "../models/plan.model";

export interface CreatePlanRequest {
  name: string;
  scope: PlanScope;
  rules: PlanRules;
}
export interface UpdatePlanRequest {
  name: string;
  rules: PlanRules;
  expectedVersion: number;
}