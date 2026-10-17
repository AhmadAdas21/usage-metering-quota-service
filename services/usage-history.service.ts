import type { DataSource } from "typeorm";

import type {
  UsageHistoryQuery,
  UsageHistoryResponse,
} from "../dtos/usage-history.dto";
import { ApplicationError } from "../error/application-error";
import { ConsumptionRequest } from "../models/consumption-request.model";
import { User } from "../models/user.model";

export class UsageHistoryService {
  constructor(
    private readonly dataSource: DataSource,
  ) {}

  async getHistory(
    accountId: string,
    query: UsageHistoryQuery,
  ): Promise<UsageHistoryResponse> {
    return this.dataSource.transaction(
      "REPEATABLE READ",
      async (manager) => {
        if (query.userId !== undefined) {
          const user = await manager
            .getRepository(User)
            .findOneBy({
              id: query.userId,
              accountId,
            });

          if (!user) {
            throw new ApplicationError(
              "USER_NOT_FOUND",
              "User was not found.",
            );
          }
        }

        const historyQuery = manager
          .getRepository(ConsumptionRequest)
          .createQueryBuilder("request")
          .where("request.accountId = :accountId", {
            accountId,
          })
          .andWhere("request.result ->> 'month' = :month", {
            month: query.month,
          });

        if (query.userId !== undefined) {
          historyQuery.andWhere(
            "request.userId = :userId",
            { userId: query.userId },
          );
        }

        const totalItems = await historyQuery
          .clone()
          .getCount();

        const requests = await historyQuery
          .select([
            "request.id",
            "request.createdAt",
            "request.result",
          ])
          .orderBy("(request.result ->> 'processedAt')::timestamptz","DESC",)
          .addOrderBy("request.id", "DESC")
          .skip((query.page - 1) * query.pageSize)
          .take(query.pageSize)
          .getMany();

        return {
          accountId,
          month: query.month,
          items: requests.map((request) => request.result),
          pagination: {
            page: query.page,
            pageSize: query.pageSize,
            totalItems,
            totalPages: Math.ceil(
              totalItems / query.pageSize,
            ),
          },
        };
      },
    );
  }
}