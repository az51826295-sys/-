/**
 * URL safety and normalization for anything the employee fetches.
 *
 * Everything here runs server-side. Research URLs come from a search provider,
 * i.e. from outside the system, so they are treated as untrusted input: the
 * guard below is what stops a crafted result from turning our server into an
 * SSRF proxy against the private network or the cloud metadata endpoint.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "metadata.goog",
]);

/** Query params that identify a visit rather than a document. */
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "ref",
  "ref_src",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "s_kwcid",
];

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;

  const octets = parts.map((part) => Number(part));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

  const [a, b] = octets;

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this network"
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved

  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique local
  if (host.startsWith("fe80")) return true; // link-local

  // IPv4-mapped addresses would otherwise slip past the v4 check. The URL
  // parser rewrites ::ffff:169.254.169.254 into hex (::ffff:a9fe:a9fe), so
  // both spellings have to be recognised.
  const dotted = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateIPv4(dotted[1]);

  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    const octets = [high >> 8, high & 0xff, low >> 8, low & 0xff];
    return isPrivateIPv4(octets.join("."));
  }

  return false;
}

export type UrlCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

/**
 * Validates a URL before we fetch it. Must be called again on the final URL
 * after any redirect — a public URL is allowed to redirect to a private one.
 */
export function checkUrlSafety(rawUrl: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "malformed_url" };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: `blocked_protocol:${url.protocol}` };
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: "blocked_host" };
  }
  if (hostname.endsWith(".localhost") || hostname.endsWith(".internal")) {
    return { ok: false, reason: "blocked_host" };
  }
  if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    return { ok: false, reason: "private_address" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials_in_url" };
  }

  return { ok: true, url };
}

/**
 * Canonical form used for deduplication: drops tracking params, the fragment,
 * a default port, and a trailing slash, and lowercases scheme and host.
 */
export function normalizeUrl(rawUrl: string): string {
  const check = checkUrlSafety(rawUrl);
  if (!check.ok) return rawUrl;

  const url = check.url;

  for (const param of TRACKING_PARAMS) {
    url.searchParams.delete(param);
  }
  url.searchParams.sort();
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }

  // Strip the trailing slash on the path itself, not the serialized string —
  // a query string would otherwise hide it (".../Path/?a=1" ends in "1").
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  let normalized = url.toString();
  if (url.pathname === "/" && !url.search) {
    normalized = normalized.replace(/\/$/, "");
  }

  return normalized;
}

export function domainOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
