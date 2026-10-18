import type { RequestHandler } from "express";
import type { Repository } from "typeorm";

import type { Account } from "../models/account.model";
import { hashApiKey } from "../security/api-key";

export function createApiKeyAuth(
  accountRepository: Repository<Account>,
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    try {
      const apiKey = req.get("x-api-key");

      if (!apiKey || apiKey.trim().length === 0) {
        res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "A valid API key is required.",
          },
        });
        return;
      }

      const account = await accountRepository.findOne({
        where: {
          apiKeyHash: hashApiKey(apiKey),
        },
        select: {
          id: true,
          name: true,
          planId: true,
          createdAt: true,
        },
      });

      if (!account) {
        res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "A valid API key is required.",
          },
        });
        return;
      }

      res.locals.account = {
        id: account.id,
        name: account.name,
        planId: account.planId,
        createdAt: account.createdAt.toISOString(),
      };

      res.setHeader("Cache-Control", "no-store");
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}