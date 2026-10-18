import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Check,
  UpdateDateColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Account } from "./account.model";
import { User } from "./user.model";
export type UsageMonth = string;

@Entity("account_monthly_usage")
@Check("CHK_account_usage_nonnegative", '"consumedUnits" >= 0')
@Check("CHK_account_usage_month", 'EXTRACT(DAY FROM "month") = 1')
export class AccountMonthlyUsage {
  @PrimaryColumn({ type: "uuid" })
  accountId!: string;

  @PrimaryColumn({ type: "date" })
  month!: UsageMonth;

  @Column({ type: "integer", default: 0 })
  consumedUnits!: number;

  @ManyToOne(() => Account, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "accountId" })
  account!: Relation<Account>;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

@Entity("user_monthly_usage")
@Check("CHK_user_usage_nonnegative", '"consumedUnits" >= 0')
@Check("CHK_user_usage_month", 'EXTRACT(DAY FROM "month") = 1')
export class UserMonthlyUsage {
  @PrimaryColumn({ type: "uuid" })
  accountId!: string;

  @PrimaryColumn({ type: "uuid" })
  userId!: string;

  @PrimaryColumn({ type: "date" })
  month!: UsageMonth;

  @Column({ type: "integer", default: 0 })
  consumedUnits!: number;

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn([
    { name: "accountId", referencedColumnName: "accountId" },
    { name: "userId", referencedColumnName: "id" },
  ])
  user!: Relation<User>;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}