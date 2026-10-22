import { Router } from "express";
import type { UserDirectoryService } from "../services/user-directory.service";
import { ApplicationError } from "../error/application-error";

function positiveInteger(value: unknown, fallback: number, maximum: number,
  code: "INVALID_PAGE" | "INVALID_PAGE_SIZE"): number {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new ApplicationError(code, "Pagination values must be positive integers.");
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new ApplicationError(code, `Pagination value must not exceed ${maximum}.`);
  }
  return parsed;
}

/** Mount this router AFTER x-api-key authentication, before the existing user router. */
export function createUserDirectoryRouter(service: UserDirectoryService): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const page = positiveInteger(req.query.page, 1, 1_000_000, "INVALID_PAGE");
      const pageSize = positiveInteger(req.query.pageSize, 20, 100, "INVALID_PAGE_SIZE");
      const result = await service.listUsers(res.locals.account.id, page, pageSize);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
