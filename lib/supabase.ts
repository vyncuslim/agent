import { createClient } from "@supabase/supabase-js";
import { config, requireAllowedTable } from "@/lib/config";

function getClient() {
  if (!config.supabaseUrl || !config.supabaseKey) throw new Error("Supabase is not configured.");
  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export async function supabaseSelect(args: {
  table: string;
  columns?: string;
  limit?: number;
  filters?: Array<{ column: string; value: string }>;
}) {
  const table = requireAllowedTable(args.table);
  // Static denylist takes precedence over configuration allowlists: service-role
  // reads of these user tables must never be accessible to an LLM agent.
  if (table === "profiles" || table.startsWith("ava_")) {
    throw new Error("Restricted account table; use purpose-built support tools.");
  }
  let query = getClient()
    .from(table)
    .select(args.columns?.trim() || "*")
    .limit(Math.min(Math.max(args.limit ?? 20, 1), config.maxDbRows));

  for (const filter of args.filters ?? []) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(filter.column)) throw new Error("Invalid filter column.");
    query = query.eq(filter.column, filter.value);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
