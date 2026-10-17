import type { UsageHistoryQuery } from "../dtos/usage-history.dto";
import { ApplicationError } from "../error/application-error";
import { validateUsageQuery } from "./usage-query.validation";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface HistoryQueryInput {
  month?: unknown;
  page?: unknown;
  pageSize?: unknown;
  userId?: unknown;
}

function parsePositiveInteger(
  value: unknown,
  defaultValue: number,
  maxValue: number,
  errorCode: "INVALID_PAGE" | "INVALID_PAGE_SIZE",
  fieldName: string,
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (
    typeof value !== "string" ||
    !/^[1-9][0-9]*$/.test(value)
  ) {
    throw new ApplicationError(
      errorCode,
      `${fieldName} must be a positive integer.`,
    );
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed > maxValue) {
    throw new ApplicationError(
      errorCode,
      `${fieldName} must be between 1 and ${maxValue}.`,
    );
  }

  return parsed;
}

export function validateUsageHistoryQuery(
  query: HistoryQueryInput,
): UsageHistoryQuery {
  const { month } = validateUsageQuery(query.month);

  const page = parsePositiveInteger(
    query.page,
    1,
    1_000_000,
    "INVALID_PAGE",
    "Page",
  );

  const pageSize = parsePositiveInteger(
    query.pageSize,
    20,
    100,
    "INVALID_PAGE_SIZE",
    "Page size",
  );

  const result: UsageHistoryQuery = {
    month,
    page,
    pageSize,
  };

  if (query.userId !== undefined) {
    if (
      typeof query.userId !== "string" ||
      !UUID_PATTERN.test(query.userId)
    ) {
      throw new ApplicationError(
        "INVALID_USER_ID",
        "User ID must be a valid UUID.",
      );
    }

    result.userId = query.userId.toLowerCase();
  }

  return result;
}