/**
 * Hop count for Express `trust proxy`.
 *
 * Railway terminates TLS and appends the client to X-Forwarded-For.
 * Trusting exactly one hop makes `req.ip` the client address the rate limiter
 * keys on. Trusting every hop (`true`) would let a caller spoof that address.
 */
export function resolveTrustProxy(input: {
  nodeEnv: string;
  raw?: string;
  /** Set when the process is behind Railway's edge proxy. */
  railwayEnvironment?: string;
}): false | number {
  const behindProxy =
    input.nodeEnv === 'production' ||
    input.nodeEnv === 'staging' ||
    Boolean(input.railwayEnvironment);
  const fallback: false | number = behindProxy ? 1 : false;
  const raw = input.raw?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'false' || raw === 'off' || raw === '0') return false;
  // A literal `true` means "one known proxy", not Express trust-all.
  if (raw === 'true' || raw === 'on') return 1;
  const hops = Number(raw);
  if (Number.isInteger(hops) && hops >= 1 && hops <= 5) return hops;
  return fallback;
}
