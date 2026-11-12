# ElevenLabs Ava — Email OTP account support (DRAFT / NOT LIVE)

## Requested flow

User asks Ava in ElevenLabs chat to edit their Vynalth AI account. Ava asks for the CURRENT registered email and the exact new full name. Ava calls ava_request_full_name_otp. The backend generates a cryptographically random 6-digit OTP and sends it using Resend to the confirmed registered email. The OTP is never returned in the tool response.

User replies with the OTP in Ava's conversation. Ava calls ava_confirm_full_name_otp with the challenge requestId and user's six digits. The backend performs the OTP validation and updates ONLY profiles.full_name specified in the original request in a single transaction. Ava reports success only when the tool says success:true.

No separate user-facing login page or support form is required for this chat flow.

## Boundaries

Login-email changes, passwords, account ownership, billing, deletion, permission/role changes, MFA changes, changing security settings and recovery are NOT allowed under a single chat OTP. They require a human-reviewed, stronger recovery path. Ava may create a manual support case, but that alone never verifies an identity.

## Production installation checklist

1. Review and execute supabase/migrations/20261111_ava_account_support.sql in the correct Supabase project. Verify real columns profiles.id, profiles.full_name, profiles.is_blocked. Never deploy to an unconfirmed tenant.
2. On the MCP backend (not public browser and not in the agent prompt) configure:
   - SUPABASE_URL — verified correct Supabase tenant.
   - SUPABASE_SUPPORT_SERVICE_ROLE_KEY — dedicated server-only service role key.
   - AVA_MCP_GATEWAY_TOKEN — separate Ava-only bearer secret (never reuse MCP_GATEWAY_TOKEN).
   - SUPPORT_OTP_HMAC_SECRET — unique random secret at least 32 characters.
   - RESEND_API_KEY — server-only email delivery key.
   - RESEND_FROM_EMAIL — a sender verified in Resend (the verified domain observed for this account is agent.vynalthai.com).
   - AVA_SUPPORT_NOTIFICATION_EMAIL — a genuinely monitored support inbox. When absent, cases are persisted but operator alerts are NOT sent.
   - MCP_GATEWAY_TOKEN — backend access token.
3. Deploy the MCP gateway and connect Ava via https://mcp.vynalthai.com/api/mcp/ava using ElevenLabs Agents / MCP integrations / Add Custom MCP Server. Attach to Ava. Choose fine-grained approval requiring user consent before mutating records. Public-facing Ava must not have generic Supabase SQL/RPC editing privileges.
4. Install the agent policy below; complete real tests before merging.

## Ava system instructions (paste into ElevenLabs)

You are Ava, Vynalth AI's AI customer support assistant.
When the user explicitly asks to change their full name, request the CURRENT registered account email and exact target name. Explain that an email OTP will be sent to the registered inbox. Call ava_request_full_name_otp once. Explain that if the account is eligible, the six-digit email code expires in five minutes and must be replied to here in Ava's chat. Do not repeat or quote any OTP in your replies. Call ava_confirm_full_name_otp with the requestId and exact user-submitted OTP. Only claim the profile has changed if that tool returns success:true. Never guess a code, bypass verification, or use a generic database tool to modify the account. For email, password, ownership, payments, deletion, access permissions, recovery or other unsupported requests, offer ava_submit_account_support_case for manual handling. Filing a ticket does not prove the user's identity. Never ask for passwords, other services' login codes, backup codes, API keys, government IDs or payment cards. Explain that Ava is an AI support agent, not a human.

## Security design

- 6-digit cryptographic OTP; expires in 5 minutes, max 5 attempts, single use.
- Cooldown 60 seconds and at most 4 per confirmed email per hour; global 200/hour safety limit.
- OTP remains outside DB plaintext. Store only HMAC-SHA256 keyed digest using a private server secret.
- An OTP authorizes one exact precommitted full-name change, not general account access.
- Validate user remains verified and unblocked, and registered email has not changed.
- Consume OTP in the same SQL transaction as the profile update.
- Generic MCP Supabase read/RPC tools are blocked from protected account tables and Ava RPC functions.
- Do not send OTPs, authorization headers, full tool inputs, unredacted PII or secrets to Axiom, PostHog, Telegram or error logs.
- Chat-entered OTPs still pass through the ElevenLabs AI model and may be included in its conversation/transcript storage. Review retention settings, show provider disclosure and never claim they are hidden from ElevenLabs. Restrict this design to low-risk changes.
- Ava's shared MCP bearer token authenticates Ava's tool integration, NOT the end user.
- Provide a separate verified recovery workflow for users who lost their registered email.
- Arrange a monitored operator queue to handle submitted support cases.
- Define and implement retention/deletion for support OTP records.

## Real test matrix (not yet run)

1. Verified account, live Resend email delivery, correct OTP -> full_name updated once; retry fails.
2. Unknown / unconfirmed / blocked email -> no mutation; no existence disclosure.
3. Wrong OTP 5 times, expired OTP, replay, email changed mid-flow -> no mutation.
4. Altered new name after sending OTP -> only original approved name can be applied.
5. Missing/invalid service-role, Resend sender, pepper or gateway key -> fail closed.
6. Direct generic supabase_select of profiles/ava_account_otp -> blocked.
7. Direct generic supabase_rpc to ava_* -> blocked.
8. Ava receives real tool results and does not falsely claim success; tools attached to correct ElevenLabs agent.
9. Audit and privacy: no OTP in Vynalth AI log pipelines or webhooks; review ElevenLabs platform retention separately.
10. Manual ticket requires operator review and does not grant account access.

Status: drafted in GitHub only. Database migration, real email, ElevenLabs attachment, tests, and production deployment NOT YET VERIFIED.


## Phase 1 expansion — draft, not live (2026-11-12)

Additional tools:
- ava_get_official_product_links: curated product and public status-page links, not live statuses.
- ava_get_service_status: checks ONLY Vynalth AI Search health; the response clearly marks other services unverified.
- ava_submit_bug_report: manual support case with a [PRODUCT BUG] tag.
- ava_submit_feature_request: manual support case with a [FEATURE REQUEST] tag.
- ava_submit_partnership_inquiry: manual support case with a [PARTNERSHIP INQUIRY] tag.

The three intake tools reuse the existing rate-limited `ava_create_support_case` RPC and restricted case table. They are NOT separate engineering, product or partnership queues; operations staff must manually classify cases. Supplying an email does not verify ownership. Never include passwords, other services' OTPs, API tokens, cookies, private messages, identity documents or payment details. Never claim a case was created unless created:true.

Agent instruction addendum: Only use each tool after the user explicitly requests the corresponding action. Do not promise SLA, implementation, delivery, partnership acceptance or successful health checks of services other than Search. Never expose general-purpose database, E2B, admin or deployment tools through this public-facing endpoint.

Preproduction gates: pass typechecking and contract tests; verify configuration and the MCP test connection; perform real isolated test-account cases and inspect database inserts + operator notifications; verify that no sensitive payload appears in logs. Existing OTP production gates remain unresolved. No automatic production rollout.


## Human support handoff and operator notification (DRAFT / NOT LIVE)

- `ava_request_human_support(email, issue, preferredContact)` creates a restricted
  manual support case and returns its ID when successful.
- Ava must plainly explain that filing a ticket is NOT live agent connection,
  phone-call placement, scheduled callback, identity verification or a response SLA.
- When the customer prefers phone contact, the operator must first validate and
  arrange the callback using the submitted email; Ava must NOT ask customers to
  call a personal mobile number and must NEVER publish the operator's number.
- The private case queue is `ava_private.ava_support_cases`. Trusted
  operators can review it via a privileged, secured Supabase workspace.
- Set `AVA_SUPPORT_NOTIFICATION_EMAIL` in Vercel backend secrets to an actual
  monitored inbox. On creation, Resend sends that inbox the ticket ID and a
  fixed category label ONLY (no user email, phone, freeform issue or OTP).
  `accepted_by_email_provider` does not prove final delivery or a human reply.
- Set up your phone's Gmail/Resend inbox push notifications to learn about new
  cases. Sending an SMS to a Malaysian number is **NOT implemented**: an SMS
  provider and a private destination number would be needed, with abuse/rate
  safeguards. Do not hardcode personal phone numbers in GitHub or public pages.
- If the inbox is missing or email delivery fails, the tool still retains the
  case ID and accurately reports `not_configured` or `failed`.
- Existing case capacity limits still apply. Email fields do not prove identity.

Release gates: run updated contract + build checks, set verified secrets, test
real Resend operator notification, test no secrets/PII in alerts, and verify
manual staff can access the private support queue. This is a stacked draft PR
that must not be deployed to production before acceptance.
