export type PlanScope = "account" | "user";

export interface PlanRules {
  monthlyAllowance: number;
  maxUnitsPerRequest: number;
}

export interface Plan {
  id: string;
  name: string;

  
  scope: PlanScope;

  
  ownerAccountId: string | null;

  rules: PlanRules;

 
  version: number;

  createdAt: Date;
  updatedAt: Date;
}