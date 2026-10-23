import { NextRequest, NextResponse } from "next/server";
import dns from "dns/promises";
import http from "node:http";
import https from "node:https";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";
import { isPrivateIp } from "./helpers";

interface OgData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const MAX_HTML_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const LINK_PREVIEW_RATE_LIMIT = 30;
const LINK_PREVIEW_RATE_BUCKET = 200;

const PRIVATE_HOSTNAME = /^(localhost|.*\.localhost|.*\.internal|.*\.local)$/i;

interface ResolvedTarget {
  address: string;
  family: 4 | 6;
}

/**
 * Resolves the hostname and validates EVERY answer — a multi-record rotation
 * must not smuggle an internal IP past a single lookup. Returns the address
 * the connection will be pinned to, or null when the target is unsafe.
 */
async function resolveSafeTarget(hostname: string): Promise<ResolvedTarget | null> {
  if (PRIVATE_HOSTNAME.test(hostname) || isPrivateIp(hostname)) return null;
  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0) return null;
    if (addresses.some((a) => isPrivateIp(a.address))) return null;
    const first = addresses[0];
    return { address: first.address, family: first.family as 4 | 6 };
  } catch {
    return null;
  }
}

/**
 * Fetches `url` with DNS pinned to the already-validated address: the
 * socket's lookup() is overridden, closing the rebind window between "check"
 * and "connect" that a separate fetch() re-resolution leaves open. TLS SNI
 * and cert validation still use the URL hostname. Redirects are refused and
 * the body is capped at MAX_HTML_BYTES (declared or actual).
 */
function fetchPinned(url: URL, target: ResolvedTarget): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(
      url,
      {
        lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AHSportsBot/1.0)",
          Accept: "text/html",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          reject(new Error(`redirect refused (${status})`));
          return;
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > MAX_HTML_BYTES) {
          res.resume();
          reject(new Error("content-length exceeds cap"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_HTML_BYTES) {
            req.destroy(new Error("response exceeds cap"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/**
 * B-08 — GET /api/link-preview?url=...
 * Authenticated users only: it is a server-side fetch (SSRF surface).
 * Per-IP rate limit in its own bucket; private hostnames/IPs blocked at DNS;
 * redirects refused; body + timeout capped; only OG/title metadata is
 * returned — fetch internals never leak.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rate = await checkRateLimit(`link-preview:${clientIpFromRequest(request)}`, {
    bucket: "link-preview",
    limit: LINK_PREVIEW_RATE_LIMIT,
    bucketLimit: LINK_PREVIEW_RATE_BUCKET,
  });
  if (!rate.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Invalid url scheme" }, { status: 400 });
  }

  const target = await resolveSafeTarget(parsed.hostname);
  if (!target) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const { status, body: html } = await fetchPinned(parsed, target);
    if (status < 200 || status >= 300) {
      return NextResponse.json({ url, title: null, description: null, image: null, siteName: null });
    }

    const og: OgData = {
      url,
      title: extractMeta(html, "og:title") || extractMeta(html, "twitter:title") || "",
      description: extractMeta(html, "og:description") || extractMeta(html, "twitter:description") || "",
      image: extractMeta(html, "og:image") || extractMeta(html, "twitter:image") || null,
      siteName: extractMeta(html, "og:site_name") || null,
    };
    if (!og.title) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      og.title = titleMatch?.[1]?.trim() ?? null;
    }
    return NextResponse.json(og, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ url, title: null, description: null, image: null, siteName: null });
  }
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}
