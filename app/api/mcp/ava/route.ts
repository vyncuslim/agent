import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  isAvaSupportConfigured,
  requestFullNameChange,
  confirmFullNameChange,
  submitAccountSupportCase
} from "@/lib/ava-account-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This dedicated MCP server intentionally exposes ONLY the three support
// tools. The existing general-purpose MCP bearer token cannot access it.
const handler = createMcpHandler((server) => {
  server.registerTool(
    "ava_request_full_name_otp",
    {
      title: "Ava — Email code for exact full-name change",
      description: "Use ONLY when the user explicitly asks to change their own Vynalth AI full name. Request their CURRENT registered account email and exact desired full name, then send a one-time email code. Never claim the email was delivered unless confirmed by delivery evidence. The code is never returned to the agent. This tool is NOT a login/password/email-change or account-recovery tool.",
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
      title: "Ava — Verify email OTP and apply bound full-name change",
      description: "Verify a user's six-digit code from the dedicated Ava verification email. Use requestId returned by ava_request_full_name_otp in THIS conversation. The backend validates the OTP and atomically updates ONLY the originally requested full_name. Do not repeat or store the OTP. Never claim success if this tool fails.",
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
      title: "Ava — Escalate account issue for official human review",
      description: "Submit a manual review case ONLY when asked, or when login-email change, account recovery, password, roles, deletion, billing or other unsupported issues need support. A case is NOT proof of account ownership. Never include credentials, passwords, OTPs, tokens, identity documents, full addresses, or card data.",
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
}, {
  serverInfo: { name: "Vynalth AI Ava Account Support MCP", version: "1.0.0" },
  instructions: "Ava is an AI support agent. The user may reply to Ava with the one-time code emailed for ONE explicitly requested, low-risk profile change. The trusted server validates it. Do NOT reveal or repeat codes, and never claim changes unless the tool confirms. Never use OTP alone for login email, password, MFA, permissions, account deletion or financial actions. Those require human review."
});

function authenticated(request: Request): boolean {
  const secret = process.env.AVA_MCP_GATEWAY_TOKEN ?? "";
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!secret || !supplied) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(supplied);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function route(request: Request): Promise<Response> {
  if (!process.env.AVA_MCP_GATEWAY_TOKEN || !isAvaSupportConfigured()) {
    return Response.json({ error: "AVA_SUPPORT_NOT_CONFIGURED" }, {
      status: 503, headers: { "Cache-Control": "no-store" }
    });
  }
  if (!authenticated(request)) {
    return Response.json({ error: "UNAUTHORIZED" }, {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" }
    });
  }
  return handler(request);
}

export { route as GET, route as POST, route as DELETE };
