// Internal production build-time diagnostics only. Never log environment values.
if (process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production") {
  const names = [
    "AVA_MCP_GATEWAY_TOKEN",
    "SUPABASE_URL",
    "SUPABASE_SUPPORT_SERVICE_ROLE_KEY",
    "SUPPORT_OTP_HMAC_SECRET",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL"
  ];
  const failed = names.filter((name) => !process.env[name]?.trim())
    .map((name) => name + "_MISSING_OR_EMPTY");
  const pepper = process.env.SUPPORT_OTP_HMAC_SECRET?.trim() ?? "";
  if (pepper && pepper.length < 32) {
    failed.push("SUPPORT_OTP_HMAC_SECRET_TOO_SHORT");
  }
  // Only show identifiers / validation codes, not sensitive values or lengths.
  console.log("AVA_BUILD_CONFIG_CHECK", JSON.stringify({result: failed.length ? "INCOMPLETE" : "VALID_BASIC_SHAPE", issues: failed}));
}
