import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Plan } from "./plan.model";

@Entity("accounts")
export class Account {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "uuid" })
  planId!: string;

  @ManyToOne(() => Plan, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "planId" })
  plan!: Relation<Plan>;

  @Column({
    type: "varchar",
    length: 64,
    unique: true,
    select: false,
  })
  apiKeyHash!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}