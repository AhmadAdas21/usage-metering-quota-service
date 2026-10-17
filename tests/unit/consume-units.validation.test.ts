import { test } from "node:test";
import assert from "node:assert/strict";

import { ApplicationError } from "../../error/application-error";
import { validateConsumeUnits } from "../../validation/consume-units.validation";

const validRequest = {
  userId: "00000000-0000-4000-8000-000000000010",
  requestId: "test-request-001",
  units: 10,
};

test("accepts a valid consumption request", () => {
  const result = validateConsumeUnits({ ...validRequest });

  assert.deepEqual(result, validRequest);
});

test("rejects an invalid user ID", () => {
  assert.throws(
    () =>
      validateConsumeUnits({
        ...validRequest,
        userId: "invalid-id",
      }),
    (error: unknown) =>
      error instanceof ApplicationError &&
      error.code === "INVALID_USER_ID",
  );
});

test("rejects a blank request ID", () => {
  assert.throws(
    () =>
      validateConsumeUnits({
        ...validRequest,
        requestId: "   ",
      }),
    (error: unknown) =>
      error instanceof ApplicationError &&
      error.code === "INVALID_REQUEST_ID",
  );
});

test("rejects a request ID longer than 128 characters", () => {
  assert.throws(
    () =>
      validateConsumeUnits({
        ...validRequest,
        requestId: "a".repeat(129),
      }),
    (error: unknown) =>
      error instanceof ApplicationError &&
      error.code === "INVALID_REQUEST_ID",
  );
});

const invalidUnits: Array<{
  label: string;
  value: unknown;
}> = [
  { label: "zero", value: 0 },
  { label: "negative", value: -1 },
  { label: "fractional", value: 1.5 },
  { label: "string", value: "10" },
  { label: "missing", value: undefined },
  { label: "above the database integer limit", value: 2_147_483_648 },
];

for (const { label, value } of invalidUnits) {
  test(`rejects units that are ${label}`, () => {
    assert.throws(
      () =>
        validateConsumeUnits({
          ...validRequest,
          units: value,
        }),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "INVALID_UNITS",
    );
  });
}