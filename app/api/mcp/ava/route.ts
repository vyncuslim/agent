import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { vynalthSearchHealth } from "@/lib/search";
import {
  isAvaSupportConfigured,
  requestFullNameChange,
  confirmFullNameChange,
  submitAccountSupportCase
} from "@/lib/ava-account-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dedicated purpose-scoped customer support tools.
// The generic MCP bearer token cannot access this endpoint.
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

  server.registerTool(
    "ava_get_official_product_links",
    {
      title: "Ava — Official Vynalth AI links",
      description: "Return curated public product entry points. These are not real-time availability claims.",
      inputSchema: z.object({})
    },
    async () => ({ content: [{ type: "text", text: JSON.stringify({
      products: [
        { name: "Vynalth AI", url: "https://vynalthai.com" },
        { name: "Search", url: "https://search.vynalthai.com" },
        { name: "Chat", url: "https://vynalthai.com/c" },
        { name: "ZoKivo", url: "https://zokivo.xyz" },
        { name: "VynLink", url: "https://vynlink.xyz" }
      ],
      publicStatusPage: "https://vynalthai.com/status",
      note: "Links alone do not prove a service is operational."
    }) }] })
  );

  server.registerTool(
    "ava_get_service_status",
    {
      title: "Ava — Vynalth AI Search health",
      description: "Only checks the public Vynalth AI Search health endpoint. All other services are unverified.",
      inputSchema: z.object({})
    },
    async () => {
      try {
        const health = await vynalthSearchHealth();
        return { content: [{ type: "text", text: JSON.stringify({
          service: "Vynalth AI Search", reachable: true, health,
          otherServicesChecked: false
        }) }] };
      } catch {
        return { content: [{ type: "text", text: JSON.stringify({
          service: "Vynalth AI Search", reachable: false,
          status: "unknown", otherServicesChecked: false,
          note: "A failed check is not proof of an outage."
        }) }] };
      }
    }
  );

  server.registerTool(
    "ava_submit_bug_report",
    {
      title: "Ava — Submit product bug",
      description: "Submit a sanitized product bug to the restricted manual support queue. Never request passwords, OTPs, tokens, private messages or payment details. No fix or reply time is guaranteed.",
      inputSchema: z.object({
        email: z.string().email().max(320),
        product: z.enum(["Search", "Chat", "VynchApp", "ZoKivo", "VynLink", "Other"]),
        description: z.string().trim().min(10).max(800),
        reproductionSteps: z.string().trim().max(400).optional()
      })
    },
    async ({ email, product, description, reproductionSteps }) => {
      const issue = "[PRODUCT BUG] " + product + "\nDescription: " + description
        + (reproductionSteps ? "\nSteps: " + reproductionSteps : "");
      const result = await submitAccountSupportCase(email, issue);
      return { content: [{ type: "text", text: JSON.stringify({
        ...result, type: "bug_report",
        note: "Submitted to the restricted manual support queue, not an engineering tracker."
      }) }] };
    }
  );

  server.registerTool(
    "ava_submit_feature_request",
    {
      title: "Ava — Submit a feature idea",
      description: "Submit a feature idea for manual triage. Do not promise approval, implementation or a release date.",
      inputSchema: z.object({
        email: z.string().email().max(320),
        product: z.enum(["Search", "Chat", "VynchApp", "ZoKivo", "VynLink", "Other"]),
        idea: z.string().trim().min(10).max(900)
      })
    },
    async ({ email, product, idea }) => {
      const result = await submitAccountSupportCase(email,
        "[FEATURE REQUEST] " + product + "\nSuggestion: " + idea);
      return { content: [{ type: "text", text: JSON.stringify({
        ...result, type: "feature_request",
        note: "Manual review only; no implementation commitment."
      }) }] };
    }
  );

  server.registerTool(
    "ava_submit_partnership_inquiry",
    {
      title: "Ava — Submit a partnership inquiry",
      description: "Forward a sanitized partnership proposal for manual review. Never make commercial commitments or disclose private contacts.",
      inputSchema: z.object({
        email: z.string().email().max(320),
        organization: z.string().trim().min(2).max(120),
        proposal: z.string().trim().min(10).max(900)
      })
    },
    async ({ email, organization, proposal }) => {
      const result = await submitAccountSupportCase(email,
        "[PARTNERSHIP INQUIRY] Organization: " + organization
        + "\nProposal: " + proposal);
      return { content: [{ type: "text", text: JSON.stringify({
        ...result, type: "partnership_inquiry",
        note: "Manual review only; no partnership acceptance."
      }) }] };
    }
  );
}, {
  serverInfo: { name: "Vynalth AI Ava Account Support MCP", version: "1.1.0" },
  instructions: "Ava is an AI support agent. The user may reply to Ava with the one-time code emailed for ONE explicitly requested, low-risk profile change. The trusted server validates it. Do NOT reveal or repeat codes, and never claim changes unless the tool confirms. Never use OTP alone for login email, password, MFA, permissions, account deletion or financial actions. Those require human review. Reports and inquiries enter a restricted manual queue; never promise resolution or acceptance."
});

function authenticated(request: Request): boolean {
  const secret = process.env.AVA_MCP_GATEWAY_TOKEN ?? "";
  const header = request.headers.get("authorization") ?? "";
  // ElevenLabs may send a raw secret or a Bearer authorization value.
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
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
