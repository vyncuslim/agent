const splitList = (value: string | undefined): Set<string> =>
  new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean));

const asInt = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

export const config = {
  gatewayToken: process.env.MCP_GATEWAY_TOKEN ?? "",
  vynalthSearchBaseUrl: process.env.VYNALTH_SEARCH_BASE_URL ?? "https://search.vynalthai.com",
  searchTimeoutMs: asInt(process.env.VYNALTH_SEARCH_TIMEOUT_MS, 12000, 1000, 30000),
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseKey: process.env.SUPABASE_KEY ?? "",
  allowedTables: splitList(process.env.SUPABASE_ALLOWED_TABLES),
  allowedRpcs: splitList(process.env.SUPABASE_ALLOWED_RPCS),
  maxSearchResults: asInt(process.env.MCP_MAX_SEARCH_RESULTS, 10, 1, 25),
  maxDbRows: asInt(process.env.MCP_MAX_DB_ROWS, 100, 1, 500),
  maxFetchBytes: asInt(process.env.MCP_MAX_FETCH_BYTES, 400000, 10000, 1000000)
};

export function assertIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

export function requireAllowedTable(table: string): string {
  const safe = assertIdentifier(table, "table name");
  if (!config.allowedTables.has(safe)) throw new Error(`Table '${safe}' is not allowed.`);
  return safe;
}

export function requireAllowedRpc(name: string): string {
  const safe = assertIdentifier(name, "RPC name");
  if (!config.allowedRpcs.has(safe)) throw new Error(`RPC '${safe}' is not allowed.`);
  return safe;
}
