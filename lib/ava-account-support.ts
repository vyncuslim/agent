import { createHmac, randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPPORT_TIMEOUT_MS = 10000;
const OTP_LENGTH = 6;

// This service intentionally uses its own isolated, server-side Supabase key.
// It does not share the generic Supabase read/RPC capability exposed to MCP.
function settings() {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const key = process.env.SUPABASE_SUPPORT_SERVICE_ROLE_KEY?.trim() ?? "";
  const pepper = process.env.SUPPORT_OTP_HMAC_SECRET?.trim() ?? "";
  const resendKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const sender = process.env.RESEND_FROM_EMAIL?.trim() ?? "";
  if (!url || !key || pepper.length < 32 || !resendKey || !sender) {
    throw new Error("AVA_ACCOUNT_SUPPORT_NOT_CONFIGURED");
  }
  return { url, key, pepper, resendKey, sender };
}

export function isAvaSupportConfigured(): boolean {
  try { settings(); return true; } catch { return false; }
}

function supportDb() {
  const { url, key } = settings();
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
}

function digest(requestId: string, otp: string): string {
  return createHmac("sha256", settings().pepper)
    .update(requestId + ":" + otp, "utf8")
    .digest("hex");
}

function safeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function genericMailReply(requestId: string) {
  return {
    accepted: true,
    requestId,
    message: "If this is an eligible verified Vynalth AI account, Ava has requested a 6-digit code to its registered email. Ask the user to reply with the code. It expires in 5 minutes. Never ask for a password."
  };
}

/**
 * Ava initiates an OTP from the conversation. The code is delivered only via
 * Resend to the currently registered + verified address; never returned to
 * the model, MCP client, logs or public UI. The specific value is frozen in DB.
 */
export async function requestFullNameChange(email: string, fullName: string) {
  const requestId = randomUUID();
  const otp = randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
  const normalized = normalizeEmail(email);
  const proposed = fullName.trim();
  const db = supportDb();

  const { data: created, error } = await db.rpc("ava_start_full_name_change", {
    p_id: requestId,
    p_email: normalized,
    p_full_name: proposed,
    p_otp_mac: digest(requestId, otp)
  });
  if (error) throw new Error("AVA_ACCOUNT_SUPPORT_UNAVAILABLE");

  // Avoid account enumeration: a missing account, block or rate limit gets
  // exactly the same assistant-visible response and a random tracking ID.
  if (!created) return genericMailReply(requestId);

  const text = [
    "Vynalth AI — Ava account support",
    "",
    "You requested this specific account change:",
    "Change your full name to: " + proposed,
    "",
    "Your one-time confirmation code: " + otp,
    "Expires in 5 minutes. You may reply with it ONLY in the Ava support conversation you started.",
    "Do not share this code with other people. If you did not request this, ignore this email.",
    "",
    "This code is not a sign-in code and cannot change your password, login email, permissions or billing."
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + settings().resendKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: settings().sender,
        to: [normalized],
        subject: "Your Vynalth AI Ava account-change verification code",
        text,
        html: "<p>Vynalth AI — Ava account support</p>"
          + "<p>Request: change your full name to <strong>" + safeHtml(proposed) + "</strong>.</p>"
          + "<p>Your one-time code: <strong>" + otp + "</strong></p>"
          + "<p>Expires in 5 minutes. Enter it only in your ongoing Ava support chat.</p>"
          + "<p>This code cannot authorize login email, password, permissions or billing changes. Ignore if unrequested.</p>"
      }),
      signal: AbortSignal.timeout(SUPPORT_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error("Email delivery rejected");
    const { data: marked, error: markError } = await db.rpc("ava_mark_otp_sent", { p_id: requestId });
    if (markError || !marked) throw new Error("Failed to activate OTP");
  } catch {
    try { await db.rpc("ava_cancel_otp", { p_id: requestId }); } catch { /* Best-effort cancellation. */ }
    // Deliberately do not return email-provider or account-existence details.
    return genericMailReply(requestId);
  }
  return genericMailReply(requestId);
}

/** Single-use, transactionally validated code; action is applied IN the SQL RPC. */
export async function confirmFullNameChange(requestId: string, otp: string) {
  const db = supportDb();
  const { data, error } = await db.rpc("ava_confirm_full_name_change", {
    p_id: requestId,
    p_otp_mac: digest(requestId, otp)
  });
  if (error) throw new Error("AVA_ACCOUNT_SUPPORT_UNAVAILABLE");
  if (data !== true) {
    return { success: false, message: "Code invalid, expired, already used, or the change was not authorized. Do not claim the profile was updated." };
  }
  return {
    success: true,
    field: "full_name",
    message: "The requested full name has been updated. No other account fields were changed."
  };
}

export async function submitAccountSupportCase(email: string, issue: string) {
  // Does not verify identity or grant any account access.
  const db = supportDb();
  const { data, error } = await db.rpc("ava_create_support_case", {
    p_email: normalizeEmail(email),
    p_issue: issue.trim()
  });
  if (error) throw new Error("AVA_SUPPORT_CASE_UNAVAILABLE");
  if (!data) {
    return { created: false, message: "Unable to create a case right now. Please contact official support directly." };
  }
  return {
    created: true,
    caseId: data as string,
    message: "A support case was created for manual review. This does not confirm the email belongs to the user."
  };
}
