import type { UsageQuery } from "../dtos/usage.dto";
import { ApplicationError } from "../error/application-error";

const MONTH_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

export function validateUsageQuery(
  month: unknown,
): UsageQuery {
  if (month === undefined) {
    return {
      month: `${new Date().toISOString().slice(0, 7)}-01`,
    };
  }

  if (
    typeof month !== "string" ||
    !MONTH_PATTERN.test(month) ||
    month.startsWith("0000-")
  ) {
    throw new ApplicationError(
      "INVALID_USAGE_MONTH",
      "Month must use YYYY-MM format with a year between 0001 and 9999.",
    );
  }

  return {
    month: `${month}-01`,
  };
}