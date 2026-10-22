/**
 * Login throttling — port of SocialCRM `src/lib/auth/login-throttle.ts`,
 * adapted to AH Sports' dependency set and scrypt auth.
 *
 * The old limiter counted 5 attempts per minute keyed only by IP in a single
 * unbounded map: anyone could lock the admin out cheaply, there was no
 * per-email bound, and unknown emails returned instantly (no scrypt) which
 * leaked account existence through timing.
 *
 * Three fixed-window buckets now gate every attempt:
 *   - pair  (ip + email): 5/10min — same strictness as before for a single
 *     client hammering one account.
 *   - ip    (any email):   20/10min — bounds credential stuffing from one
 *     source across accounts.
 *   - email (any ip):      30/10min — bounds distributed guessing on one
 *     account while making a sustained admin lockout cost ≥30 attempts from
 *     ≥2 IPs per window.
 *
 * The store is the bounded in-memory map set in all environments: no shared
 * store may be added ad hoc — if distributed limiting is ever needed it comes
 * in through a port of this seam, same contract as `src/lib/infra/rate-limit.ts`.
 */
const WINDOW_MS = 10 * 60 * 1000;
const PAIR_LIMIT = 5;
const IP_LIMIT = 20;
const EMAIL_LIMIT = 30;
const MAP_MAX_ENTRIES = 5000;

/**
 * Constant scrypt hash compared against when the email is unknown, so a
 * nonexistent account pays the same ~scrypt cost as a real one and returns
 * the same generic 401 — no timing oracle, no distinct error. The salt is
 * fixed and public; the hash never needs to match anything (F11 pattern).
 */
export const DUMMY_PASSWORD_HASH =
  "9f3c2a71b84d5e06:68106151bfc53476c619e66460413ff4e3a895805f7d609e974aad8dd2b2e7b2c9bce4fb0e81f7bc56d8a91ec56cf607fed2ba608b03779cf1270779fd6d4cc8";

interface WindowEntry {
  count: number;
  resetAt: number;
}

export interface LoginThrottleVerdict {
  allowed: boolean;
  /** true when the distributed per-email bucket rejected the attempt. */
  emailLimited: boolean;
  /** true when a per-IP bucket rejected the attempt. */
  ipLimited: boolean;
}

export interface MemoryThrottle {
  check(ip: string, email: string): LoginThrottleVerdict;
  sweep(): void;
}

export function createMemoryThrottle(
  deps: {
    now?: () => number;
    windowMs?: number;
    maxEntries?: number;
    limits?: { pair: number; ip: number; email: number };
  } = {},
): MemoryThrottle {
  const now = deps.now ?? (() => Date.now());
  const windowMs = deps.windowMs ?? WINDOW_MS;
  const maxEntries = deps.maxEntries ?? MAP_MAX_ENTRIES;
  const limits = deps.limits ?? {
    pair: PAIR_LIMIT,
    ip: IP_LIMIT,
    email: EMAIL_LIMIT,
  };

  const ipMap = new Map<string, WindowEntry>();
  const pairMap = new Map<string, WindowEntry>();
  const emailMap = new Map<string, WindowEntry>();

  function evictExpired(map: Map<string, WindowEntry>, at: number) {
    for (const [key, entry] of map) {
      if (at >= entry.resetAt) map.delete(key);
    }
  }

  function checkWindow(
    map: Map<string, WindowEntry>,
    key: string,
    limit: number,
  ): boolean {
    const at = now();
    const entry = map.get(key);
    if (!entry || at >= entry.resetAt) {
      if (map.size >= maxEntries) evictExpired(map, at);
      if (map.size >= maxEntries) {
        // Hard bound: evict oldest-reset entries so uniques cannot grow the
        // map without limit between sweeps.
        const oldest = [...map.entries()]
          .sort((a, b) => a[1].resetAt - b[1].resetAt)
          .slice(0, map.size - maxEntries + 1);
        for (const [oldKey] of oldest) map.delete(oldKey);
      }
      map.set(key, { count: 1, resetAt: at + windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  }

  return {
    check(ip, email) {
      const key = email.toLowerCase();
      const pairOk = checkWindow(pairMap, `${ip}|${key}`, limits.pair);
      const ipOk = checkWindow(ipMap, ip, limits.ip);
      const emailOk = checkWindow(emailMap, key, limits.email);
      return {
        allowed: pairOk && ipOk && emailOk,
        ipLimited: !pairOk || !ipOk,
        emailLimited: !emailOk,
      };
    },
    sweep() {
      const at = now();
      evictExpired(ipMap, at);
      evictExpired(pairMap, at);
      evictExpired(emailMap, at);
    },
  };
}

const memoryThrottle = createMemoryThrottle();

if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => memoryThrottle.sweep(), WINDOW_MS);
  // Never keep the process alive for the sweeper (route/module hot reloads,
  // script invocations under tsx).
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}

/**
 * Returns whether a login attempt for (ip, email) may proceed. Callers must
 * still run the credential check (with the dummy hash for unknown users) so
 * throttled and invalid attempts are indistinguishable in cost.
 */
export function checkLoginThrottle(ip: string, email: string): LoginThrottleVerdict {
  return memoryThrottle.check(ip, email);
}
