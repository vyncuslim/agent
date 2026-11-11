import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { config } from "@/lib/config";
import { vynalthSearch, vynalthSearchHealth } from "@/lib/search";
import { supabaseSelect } from "@/lib/supabase";
import { callAllowedRpc } from "@/lib/supabase-rpc";
import { isAvaSupportConfigured, requestFullNameChange, confirmFullNameChange, submitAccountSupportCase } from "@/lib/ava-account-support";

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
            version: "2.2.0",
            transport: "streamable-http",
            capabilities: {
              webSearch: Boolean(config.vynalthSearchBaseUrl),
              supabaseRead: Boolean(config.supabaseUrl && config.supabaseKey && config.allowedTables.size),
              supabaseRpc: Boolean(config.supabaseUrl && config.supabaseKey && config.allowedRpcs.size),
              avaAccountSupport: isAvaSupportConfigured()
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

    server.registerTool(
      "ava_request_full_name_otp",
      {
        title: "Ava — Email code for requested name change",
        description: "Only when the user explicitly asks to change their own Vynalth AI full name. Ask for the CURRENT registered account email and exact new full name. Sends a one-time code to that registered email. It NEVER returns the code. Do not use for changing login email, passwords, access roles, billing or security controls.",
        inputSchema: z.object({
          email: z.string().email().max(320),
          newFullName: z.string().trim().min(1).max(120)
        })
      },
      async ({ email, newFullName }) => {
        const result = await requestFullNameChange(email, newFullName);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );

    server.registerTool(
      "ava_confirm_full_name_otp",
      {
        title: "Ava — Verify email OTP and update name",
        description: "Use only after the user replies with the exact 6-digit code from their Vynalth AI Ava email and this conversation's requestId. The trusted backend validates the code and atomically changes ONLY the full_name specified in the original request. Never guess the code, invent success or call a generic SQL/RPC tool as a substitute.",
        inputSchema: z.object({
          requestId: z.string().uuid(),
          otp: z.string().regex(/^[0-9]{6}$/)
        })
      },
      async ({ requestId, otp }) => {
        const result = await confirmFullNameChange(requestId, otp);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );

    server.registerTool(
      "ava_submit_account_support_case",
      {
        title: "Ava — Escalate account issue to official support",
        description: "Create a ticket when the account problem needs human review, login email change, recovery, payment correction, deletion, access restoration or a tool cannot complete it. This is NOT identity verification and does NOT allow data changes. Do not include passwords, OTPs, tokens or government IDs.",
        inputSchema: z.object({
          email: z.string().email().max(320),
          issue: z.string().trim().min(10).max(2000)
        })
      },
      async ({ email, issue }) => {
        const result = await submitAccountSupportCase(email, issue);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );

  },
  {
    serverInfo: { name: "Vynalth AI MCP Gateway", version: "2.2.0" },
    instructions: "Use Vynalth Search for public web research. Supabase reads and RPC actions are allowlisted. Never claim a tool succeeded unless its returned result confirms success. Never attempt arbitrary SQL or non-allowlisted database actions. Ask the user to explicitly request a specific account change before sending an OTP. Never ask for passwords or reveal the OTP. An emailed OTP authorizes only the exact named low-risk change in that request. Treat an OTP inside chat transcripts as sensitive and never repeat it. For email/password, billing, deletion, role or recovery changes create a human-review support case."
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
