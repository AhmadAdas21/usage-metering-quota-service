import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAccountsAndUsers1791874343132 implements MigrationInterface {
    name = 'CreateAccountsAndUsers1791874343132'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "planId" uuid NOT NULL, "apiKeyHash" character varying(64) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_335d2a63b7faeb3f5f097c6afd1" UNIQUE ("apiKeyHash"), CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "accountId" uuid NOT NULL, "externalId" character varying(100) NOT NULL, "planId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_users_account_id" UNIQUE ("accountId", "id"), CONSTRAINT "UQ_users_account_external" UNIQUE ("accountId", "externalId"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_56f2aa669ddbe83eab8a25898b" ON "users"  ("planId") `);
        await queryRunner.query(`ALTER TABLE "plans" ADD CONSTRAINT "FK_911721eecaa99839f5abc7fa7dc" FOREIGN KEY ("ownerAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "accounts" ADD CONSTRAINT "FK_9c2217745e2047def253ac8e0ad" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_42bba679e348de51a699fb0a803" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_56f2aa669ddbe83eab8a25898b2" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_56f2aa669ddbe83eab8a25898b2"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_42bba679e348de51a699fb0a803"`);
        await queryRunner.query(`ALTER TABLE "accounts" DROP CONSTRAINT "FK_9c2217745e2047def253ac8e0ad"`);
        await queryRunner.query(`ALTER TABLE "plans" DROP CONSTRAINT "FK_911721eecaa99839f5abc7fa7dc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_56f2aa669ddbe83eab8a25898b"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "accounts"`);
    }

}
