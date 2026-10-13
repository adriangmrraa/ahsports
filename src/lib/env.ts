import "server-only";

import { z } from "zod";

/**
 * Server environment contract.
 *
 * Secret material is validated with Zod `safeParse` and, in production, a
 * missing or weak value fails fast instead of silently falling back to a
 * well-known default (the previous `auth.ts` behaviour).
 */

const secretString = (name: string) => z.string().min(16, `${name} must be at least 16 characters`);

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).optional(),
  SESSION_SECRET: secretString("SESSION_SECRET"),
  SECRET_ENCRYPTION_KEY: secretString("SECRET_ENCRYPTION_KEY"),
  // WhatsApp import (P6) is opt-in: only the routes that use these read them,
  // so they are optional here but must be strong when present. No migration.
  WHATSAPP_APP_SECRET: secretString("WHATSAPP_APP_SECRET").optional(),
  WHATSAPP_VERIFY_TOKEN: secretString("WHATSAPP_VERIFY_TOKEN").optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env) {
  return serverEnvSchema.safeParse({
    NODE_ENV: source.NODE_ENV,
    DATABASE_URL: source.DATABASE_URL,
    SESSION_SECRET: source.SESSION_SECRET,
    SECRET_ENCRYPTION_KEY: source.SECRET_ENCRYPTION_KEY,
    WHATSAPP_APP_SECRET: source.WHATSAPP_APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: source.WHATSAPP_VERIFY_TOKEN,
  });
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Validates the server environment. Throws in production when required values
 * are missing or too weak; in development it warns and returns what is present
 * so local workflows keep running.
 */
export function assertServerEnv(): ServerEnv {
  const result = loadServerEnv();
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  if (isProduction()) {
    throw new Error(`Invalid server environment: ${issues}`);
  }
  console.warn(`[env] ${issues}`);
  return {
    NODE_ENV: (process.env.NODE_ENV as ServerEnv["NODE_ENV"]) ?? "development",
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_SECRET: process.env.SESSION_SECRET ?? "",
    SECRET_ENCRYPTION_KEY: process.env.SECRET_ENCRYPTION_KEY ?? "",
  };
}

/** Session signing secret. Throws when unset — no hardcoded fallback. */
export function getSessionSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET is not set. Configure it before starting the server.");
  }
  return value;
}

/** AES-256-GCM master key for the credential secret box. */
export function getSecretEncryptionKey(): string {
  const value = process.env.SECRET_ENCRYPTION_KEY;
  if (!value) {
    throw new Error("SECRET_ENCRYPTION_KEY is not set. Configure it before encrypting credentials.");
  }
  return value;
}
