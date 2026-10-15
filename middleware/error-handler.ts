import type {
  Request,
  Response,
  NextFunction,
} from "express";

import { ApplicationError } from "../error/application-error";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApplicationError) {
  const status =
    error.code === "USER_ALREADY_EXISTS" ? 409 : 400;

  res.status(status).json({
    error: {
      code: error.code,
      message: error.message,
    },
  });
  return;
}

  if (
    error instanceof SyntaxError &&
    "type" in error &&
    error.type === "entity.parse.failed"
  ) {
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must contain valid JSON.",
      },
    });
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body exceeds the allowed size.",
      },
    });
    return;
  }

  console.error(
    "Unhandled request error:", error instanceof Error ? error.name : "UnknownError", );

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  });
}