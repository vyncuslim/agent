import { config } from "@/lib/config";

export async function vynalthSearch(query: string, page = 1, perPage = 10): Promise<unknown> {
  const cleanQuery = query.trim().slice(0, 300);
  if (!cleanQuery) throw new Error("Search query is required.");

  const base = new URL(config.vynalthSearchBaseUrl);
  if (base.protocol !== "https:") throw new Error("Vynalth Search must use HTTPS.");

  const url = new URL("/api/search", base);
  url.searchParams.set("q", cleanQuery);
  url.searchParams.set("page", String(Math.max(1, Math.trunc(page))));
  url.searchParams.set("perPage", String(Math.min(Math.max(1, Math.trunc(perPage)), config.maxSearchResults)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.searchTimeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "VynalthMCP/2.0" },
      cache: "no-store",
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Vynalth Search returned ${response.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function vynalthSearchHealth(): Promise<unknown> {
  const base = new URL(config.vynalthSearchBaseUrl);
  const url = new URL("/api/health", base);
  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Vynalth Search health returned ${response.status}.`);
  return response.json();
}
