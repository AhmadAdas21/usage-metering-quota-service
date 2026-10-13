import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Account } from "./account.model";
import { Plan } from "./plan.model";

@Entity("users")
@Unique("UQ_users_account_external", ["accountId", "externalId"])
@Unique("UQ_users_account_id", ["accountId", "id"])
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  accountId!: string;

  @ManyToOne(() => Account, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "accountId" })
  account!: Relation<Account>;

  @Column({ type: "varchar", length: 100 })
  externalId!: string;

  @Index()
  @Column({ type: "uuid" })
  planId!: string;

  @ManyToOne(() => Plan, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "planId" })
  plan!: Relation<Plan>;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}