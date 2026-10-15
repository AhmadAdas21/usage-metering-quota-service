import type {
  PlanRules,
  PlanScope,
} from "../models/plan.model";

export interface CreatePlanRequest {
  name: string;
  scope: PlanScope;
  rules: PlanRules;
}