export type PlanScope = "account" | "user";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
export interface PlanRules {
  monthlyAllowance: number;
  maxUnitsPerRequest: number;
}
@Entity("plans")
export class Plan {
  @PrimaryGeneratedColumn("uuid")
  
 id!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "enum", enum: ["account", "user"] })
  scope!: PlanScope;

  @Column({ type: "uuid", nullable: true })
  ownerAccountId!: string | null;

  @Column({ type: "jsonb" })
  rules!: PlanRules;

  @Column({ type: "integer", default: 1 })
  version!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}