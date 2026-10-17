import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
  Check,
  CreateDateColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import type { PlanRules, PlanScope } from "./plan.model";
import type { UsageMonth } from "./monthly-usage.model";
import { User } from "./user.model";

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

export interface ConsumptionResultBase {
  requestId: string;
  userId: string;
  units: number;
  month: UsageMonth;
  processedAt: string;
  accountUsage: Usage;
  userUsage: Usage;
}

export type ConsumptionResult = ConsumptionResultBase &
  (
    | {
        accepted: true;
        rejection: null;
      }
    | {
        accepted: false;
        rejection: RejectionReason;
      }
  );

@Entity("consumption_requests")
@Unique("UQ_requests_account_request", ["accountId", "requestId"])
@Index("IDX_requests_account_history", ["accountId", "createdAt", "id"])
@Index("IDX_requests_user_history", [
  "accountId",
  "userId",
  "createdAt",
  "id",
])
@Check("CHK_request_positive_units", '"units" > 0')
export class ConsumptionRequest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  accountId!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn([
    { name: "accountId", referencedColumnName: "accountId" },
    { name: "userId", referencedColumnName: "id" },
  ])
  user!: Relation<User>;

  @Column({ type: "varchar", length: 128 })
  requestId!: string;

  @Column({ type: "integer" })
  units!: number;

  @Column({ type: "varchar", length: 64 })
  payloadHash!: string;

  @Column({ type: "jsonb" })
  accountPlan!: PlanSnapshot;

  @Column({ type: "jsonb" })
  userPlan!: PlanSnapshot;

  @Column({ type: "jsonb" })
  result!: ConsumptionResult;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}