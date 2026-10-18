
import type { ConsumeUnitsRequest } from "../dtos/consume-units.dto";
import { ApplicationError } from "../error/application-error";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateConsumeUnits(
  body: unknown,
): ConsumeUnitsRequest {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new ApplicationError(
      "INVALID_UNITS",
      "Request body must be a JSON object.",
    );
  }

  if (
    !("userId" in body) ||
    typeof body.userId !== "string" ||
    !UUID_PATTERN.test(body.userId)
  ) {
    throw new ApplicationError(
      "INVALID_USER_ID",
      "User ID must be a valid UUID.",
    );
  }

  if (
    !("requestId" in body) ||
    typeof body.requestId !== "string" ||
    body.requestId.trim().length === 0 ||
    body.requestId.length > 128
  ) {
    throw new ApplicationError(
      "INVALID_REQUEST_ID",
      "Request ID must contain between 1 and 128 characters.",
    );
  }

  if (
    !("units" in body) ||
    typeof body.units !== "number" ||
    !Number.isSafeInteger(body.units) ||
    body.units <= 0 ||
    body.units > 2147483647
  ) {
    throw new ApplicationError(
      "INVALID_UNITS",
      "Units must be a positive integer within the allowed range.",
    );
  }

  return {
    userId: body.userId,
    requestId: body.requestId,
    units: body.units,
  };
}
