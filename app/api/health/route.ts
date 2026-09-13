import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    service: "vynalth-mcp-gateway",
    version: "2.0.0",
    transport: "streamable-http",
    configured: {
      gatewayAuth: Boolean(config.gatewayToken),
      vynalthSearch: Boolean(config.vynalthSearchBaseUrl),
      supabase: Boolean(config.supabaseUrl && config.supabaseKey),
      allowedTables: config.allowedTables.size
    },
    timestamp: new Date().toISOString()
  });
}
