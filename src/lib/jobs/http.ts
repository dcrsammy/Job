// Polite HTTP for job ingestion: identifies itself, times out, backs off on
// 429/5xx and (for crawled pages) honours robots.txt.
import { site } from "../config";

export const USER_AGENT = `${site.name}JobBot/1.0 (+job matching; respects robots.txt)`;

export class FetchError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function politeFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number; fetchImpl?: typeof fetch } = {},
): Promise<Response> {
  const { timeoutMs = 20_000, retries = 2, fetchImpl = fetch, ...rest } = init;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        ...rest,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/html;q=0.8", ...(rest.headers ?? {}) },
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        lastErr = new FetchError(`HTTP ${res.status} from ${url}`, res.status);
        if (attempt < retries) {
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1000 * 2 ** attempt);
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) throw new FetchError(`HTTP ${res.status} from ${url}`, res.status);
      return res;
    } catch (err) {
      lastErr = err;
      if (err instanceof FetchError && err.status && err.status < 500 && err.status !== 429) throw err;
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new FetchError(String(lastErr));
}

export async function fetchJson<T>(url: string, opts?: Parameters<typeof politeFetch>[1]): Promise<T> {
  const res = await politeFetch(url, opts);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// robots.txt (used by the career-page crawler)
// ---------------------------------------------------------------------------
interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

export function parseRobots(txt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value || key === "allow") current.rules.push({ allow: key === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function ruleMatches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp("^" + body + (anchored ? "$" : "")).test(path);
}

/** Longest-match semantics per RFC 9309. */
export function isAllowedByRobots(robotsTxt: string, url: string, agent = USER_AGENT): boolean {
  const groups = parseRobots(robotsTxt);
  const ua = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && ua.includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  if (applicable.length === 0) return true;
  const u = new URL(url);
  const path = u.pathname + u.search;
  let best: { allow: boolean; len: number } | null = null;
  for (const g of applicable) {
    for (const r of g.rules) {
      if (ruleMatches(r.path, path)) {
        const len = r.path.length;
        if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
      }
    }
  }
  return best ? best.allow : true;
}

export async function robotsAllows(url: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const origin = new URL(url).origin;
  try {
    const res = await fetchImpl(`${origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT } });
    if (res.status >= 400 && res.status < 500) return true; // no robots.txt = allowed
    if (!res.ok) return false; // server error = be conservative
    return isAllowedByRobots(await res.text(), url);
  } catch {
    return false;
  }
}
