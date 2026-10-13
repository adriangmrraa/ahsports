import "server-only";

import { getCurrentUser, requireRole } from "@/lib/auth";

/**
 * Authorization boundary for agent administration (config, channels,
 * conversations). Enforces the previously-unused `requireRole` helper so that
 * agent surfaces are never reachable with an inherited full-admin session.
 *
 * Service-principal seam (P7): machine callers (channel webhooks, cron) will
 * authenticate with a bearer token / API key instead of a session cookie. The
 * guard is intentionally session-only for P0.
 */

export const AGENT_ADMIN_ROLES = ["admin", "gerencia"] as const;
export type AgentAdminRole = (typeof AGENT_ADMIN_ROLES)[number];

type AgentAdminUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Server components / server actions: redirects unauthenticated or
 * unauthorized users through the existing admin boundary.
 */
export async function requireAgentAdmin(): Promise<AgentAdminUser> {
  return requireRole([...AGENT_ADMIN_ROLES]);
}

export type AgentApiAuthorization =
  | { ok: true; user: AgentAdminUser }
  | { ok: false; status: 401 | 403 };

/**
 * Route handlers: returns a discriminated result so callers can answer with a
 * plain status code instead of a redirect.
 */
export async function authorizeAgentApi(): Promise<AgentApiAuthorization> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401 };
  if (!AGENT_ADMIN_ROLES.includes(user.role as AgentAdminRole)) return { ok: false, status: 403 };
  return { ok: true, user };
}
