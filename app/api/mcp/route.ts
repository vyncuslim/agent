import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { config } from "@/lib/config";
import { vynalthSearch, vynalthSearchHealth } from "@/lib/search";
import { supabaseSelect } from "@/lib/supabase";
import { callAllowedRpc } from "@/lib/supabase-rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filterSchema = z.object({
  column: z.string().min(1).max(80),
  value: z.string().max(500)
});

const rpcArgsSchema = z.record(z.string(), z.unknown()).default({});

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "gateway_status",
      {
        title: "Vynalth MCP Gateway Status",
        description: "Check which Vynalth MCP capabilities are configured without exposing secrets.",
        inputSchema: z.object({})
      },
      async () => ({
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: true,
            service: "vynalth-mcp-gateway",
            version: "2.1.0",
            transport: "streamable-http",
            capabilities: {
              webSearch: Boolean(config.vynalthSearchBaseUrl),
              supabaseRead: Boolean(config.supabaseUrl && config.supabaseKey && config.allowedTables.size),
              supabaseRpc: Boolean(config.supabaseUrl && config.supabaseKey && config.allowedRpcs.size)
            },
            allowedRpcs: [...config.allowedRpcs]
          })
        }]
      })
    );

    server.registerTool(
      "web_search",
      {
        title: "Search the Web with Vynalth AI Search",
        description: "Search Vynalth AI's own web index. Use this for fresh public web information and return the indexed sources.",
        inputSchema: z.object({
          query: z.string().min(1).max(300),
          page: z.number().int().min(1).max(100).default(1),
          perPage: z.number().int().min(1).max(25).default(10)
        })
      },
      async ({ query, page, perPage }) => {
        const result = await vynalthSearch(query, page, perPage);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );

    server.registerTool(
      "web_search_status",
      {
        title: "Vynalth Search Status",
        description: "Check the live health and index status of Vynalth AI Search.",
        inputSchema: z.object({})
      },
      async () => {
        const result = await vynalthSearchHealth();
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );

    server.registerTool(
      "supabase_select",
      {
        title: "Read Approved Supabase Data",
        description: "Read rows only from Supabase tables explicitly approved in the gateway allowlist. Row Level Security and database grants still apply.",
        inputSchema: z.object({
          table: z.string().min(1).max(80),
          columns: z.string().max(500).default("*"),
          limit: z.number().int().min(1).max(500).default(20),
          filters: z.array(filterSchema).max(10).default([])
        })
      },
      async ({ table, columns, limit, filters }) => {
        const result = await supabaseSelect({ table, columns, limit, filters });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );

    server.registerTool(
      "supabase_rpc",
      {
        title: "Run Approved Supabase Business Action",
        description: "Call only a Supabase RPC explicitly listed in SUPABASE_ALLOWED_RPCS. Use this for controlled business actions such as support tickets, feedback, or partnership inquiries.",
        inputSchema: z.object({
          name: z.string().min(1).max(80),
          args: rpcArgsSchema
        })
      },
      async ({ name, args }) => {
        const result = await callAllowedRpc(name, args);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );
  },
  {
    serverInfo: { name: "Vynalth AI MCP Gateway", version: "2.1.0" },
    instructions: "Use Vynalth Search for public web research. Supabase reads and RPC actions are allowlisted. Never claim a tool succeeded unless its returned result confirms success. Never attempt arbitrary SQL or non-allowlisted database actions."
  }
);

function validToken(supplied: string, expected: string): boolean {
  if (!supplied || !expected) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function protectedHandler(request: Request): Promise<Response> {
  if (!config.gatewayToken) {
    return Response.json({ error: "MCP_NOT_CONFIGURED" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const supplied = bearer || request.headers.get("x-mcp-key") || "";

  if (!validToken(supplied, config.gatewayToken)) {
    return Response.json(
      { error: "UNAUTHORIZED" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  return handler(request);
}

export { protectedHandler as GET, protectedHandler as POST, protectedHandler as DELETE };
