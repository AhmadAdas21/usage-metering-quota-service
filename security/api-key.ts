import { createHash, randomBytes } from "node:crypto";

export function generateApiKey(): string {
  return `umq_${randomBytes(32).toString("hex")}`;
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256")
    .update(apiKey, "utf8")
    .digest("hex");
}