import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUsageAndRequests1791875283901 implements MigrationInterface {
    name = 'CreateUsageAndRequests1791875283901'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "account_monthly_usage" ("accountId" uuid NOT NULL, "month" date NOT NULL, "consumedUnits" integer NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_account_usage_month" CHECK (EXTRACT(DAY FROM "month") = 1), CONSTRAINT "CHK_account_usage_nonnegative" CHECK ("consumedUnits" >= 0), CONSTRAINT "PK_6073f87f074f9a02df44467b523" PRIMARY KEY ("accountId", "month"))`);
        await queryRunner.query(`CREATE TABLE "user_monthly_usage" ("accountId" uuid NOT NULL, "userId" uuid NOT NULL, "month" date NOT NULL, "consumedUnits" integer NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_user_usage_month" CHECK (EXTRACT(DAY FROM "month") = 1), CONSTRAINT "CHK_user_usage_nonnegative" CHECK ("consumedUnits" >= 0), CONSTRAINT "PK_e883940f755b4ba7aa7168b71de" PRIMARY KEY ("accountId", "userId", "month"))`);
        await queryRunner.query(`CREATE TABLE "consumption_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "accountId" uuid NOT NULL, "userId" uuid NOT NULL, "requestId" character varying(128) NOT NULL, "units" integer NOT NULL, "payloadHash" character varying(64) NOT NULL, "accountPlan" jsonb NOT NULL, "userPlan" jsonb NOT NULL, "result" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_requests_account_request" UNIQUE ("accountId", "requestId"), CONSTRAINT "CHK_request_positive_units" CHECK ("units" > 0), CONSTRAINT "PK_8b06b97a19d4ed0bccdd74265bc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_requests_user_history" ON "consumption_requests"  ("accountId", "userId", "createdAt", "id") `);
        await queryRunner.query(`CREATE INDEX "IDX_requests_account_history" ON "consumption_requests"  ("accountId", "createdAt", "id") `);
        await queryRunner.query(`ALTER TABLE "account_monthly_usage" ADD CONSTRAINT "FK_02d6d4a54d8ff88a4356792f0e8" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_monthly_usage" ADD CONSTRAINT "FK_f760f9f83decca0bbe8c42bc616" FOREIGN KEY ("userId", "accountId") REFERENCES "users"("id","accountId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "consumption_requests" ADD CONSTRAINT "FK_d72ae73a26383655b789d157195" FOREIGN KEY ("userId", "accountId") REFERENCES "users"("id","accountId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "consumption_requests" DROP CONSTRAINT "FK_d72ae73a26383655b789d157195"`);
        await queryRunner.query(`ALTER TABLE "user_monthly_usage" DROP CONSTRAINT "FK_f760f9f83decca0bbe8c42bc616"`);
        await queryRunner.query(`ALTER TABLE "account_monthly_usage" DROP CONSTRAINT "FK_02d6d4a54d8ff88a4356792f0e8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_requests_account_history"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_requests_user_history"`);
        await queryRunner.query(`DROP TABLE "consumption_requests"`);
        await queryRunner.query(`DROP TABLE "user_monthly_usage"`);
        await queryRunner.query(`DROP TABLE "account_monthly_usage"`);
    }

}
