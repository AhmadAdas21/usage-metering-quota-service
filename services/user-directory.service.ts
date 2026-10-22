import type { Repository } from "typeorm";
import type { User } from "../models/user.model";

/** Read-only, account-scoped directory used by the browser dashboard. */
export class UserDirectoryService {
  constructor(private readonly users: Repository<User>) {}

  async listUsers(accountId: string, page: number, pageSize: number) {
    const [users, totalItems] = await this.users.findAndCount({
      where: { accountId },
      select: {
        id: true,
        accountId: true,
        externalId: true,
        planId: true,
        createdAt: true,
      },
      order: { createdAt: "DESC", id: "ASC" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      users: users.map((user) => ({
        id: user.id,
        accountId: user.accountId,
        externalId: user.externalId,
        planId: user.planId,
        createdAt: user.createdAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }
}
