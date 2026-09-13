import { createClient } from "@supabase/supabase-js";
import { config, requireAllowedRpc } from "@/lib/config";

function getClient() {
  if (!config.supabaseUrl || !config.supabaseKey) throw new Error("Supabase is not configured.");
  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export async function callAllowedRpc(name: string, args: Record<string, unknown>) {
  const rpc = requireAllowedRpc(name);
  const { data, error } = await getClient().rpc(rpc, args);
  if (error) throw new Error(error.message);
  return data;
}
