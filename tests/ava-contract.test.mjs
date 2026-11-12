import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const ava = file('app/api/mcp/ava/route.ts');
const general = file('app/api/mcp/route.ts');
const service = file('lib/ava-account-support.ts');
const sql = file('supabase/migrations/20261111_ava_account_support.sql');
const retention = file('supabase/migrations/20261111_ava_otp_retention.sql');
const config = file('lib/config.ts');
const select = file('lib/supabase.ts');

test('Ava MCP exposes eight purpose-scoped support tools', () => {
  assert.equal((ava.match(/server\.registerTool\(/g) ?? []).length, 8);
  for (const name of ['ava_request_full_name_otp', 'ava_confirm_full_name_otp', 'ava_submit_account_support_case', 'ava_get_official_product_links', 'ava_get_service_status', 'ava_submit_bug_report', 'ava_submit_feature_request', 'ava_submit_partnership_inquiry']) {
    assert.ok(ava.includes('"' + name + '"'));
  }
  for (const disallowed of ['supabase_select', 'supabase_rpc', 'web_search']) {
    assert.ok(!ava.includes('"' + disallowed + '"'));
  }
  assert.ok(ava.includes('AVA_MCP_GATEWAY_TOKEN'));
  assert.ok(!ava.includes('config.gatewayToken'));
  assert.ok(ava.includes('timingSafeEqual'));
});

test('generic MCP gateway cannot trigger an Ava account change', () => {
  assert.ok(!general.includes('ava_request_full_name_otp'));
  assert.ok(!general.includes('ava_confirm_full_name_otp'));
  assert.ok(!general.includes('ava_submit_account_support_case'));
  assert.match(config, /safe\.startsWith\("ava_"\)/);
  assert.match(select, /table === "profiles" \|\| table\.startsWith\("ava_"\)/);
});

test('OTP never leaves the service as a tool response', () => {
  assert.match(service, /randomInt\(0, 10 \*\* OTP_LENGTH\)/);
  assert.match(service, /createHmac\("sha256"/);
  assert.ok(service.includes('p_otp_mac: digest(requestId, otp)'));
  assert.ok(service.includes('await db.rpc("ava_confirm_full_name_change"'));
  assert.ok(!/return\s*\{[^}]*\botp\s*:/s.test(service));
  assert.ok(service.includes('AbortSignal.timeout(SUPPORT_TIMEOUT_MS)'));
});

test('private SQL tables and restricted SECURITY DEFINER business actions', () => {
  assert.ok(sql.includes('create schema if not exists ava_private;'));
  assert.ok(sql.includes('ava_private.ava_account_otp'));
  assert.ok(sql.includes('ava_private.ava_support_cases'));
  assert.ok(sql.includes('alter table ava_private.ava_account_otp enable row level security'));
  assert.ok(sql.includes('alter table ava_private.ava_support_cases enable row level security'));
  assert.ok(sql.includes("current_setting('request.jwt.claim.role', true)"));
  assert.ok(sql.includes("or v_req.attempts >= 5"));
  assert.ok(sql.includes("v_req.expires_at <= now()"));
  assert.ok(sql.includes("set consumed_at=now()"));
  assert.ok(sql.includes("where id=v_req.user_id and coalesce(is_blocked,false)=false"));
  assert.ok(!sql.includes('grant select, insert, update on ava_private.ava_account_otp'));
});

test('privacy retention, no automatic deletion of unresolved support tickets', () => {
  assert.ok(retention.includes('cron.schedule('));
  assert.ok(retention.includes('delete from ava_private.ava_account_otp'));
  assert.ok(retention.includes("interval '7 days'"));
  assert.ok(!retention.includes('delete from ava_private.ava_support_cases'));
});

test('additional public support tools are least-privilege', () => {
  assert.ok(ava.includes('vynalthSearchHealth'));
  assert.ok(ava.includes('otherServicesChecked: false'));
  assert.ok(ava.includes('[PRODUCT BUG]'));
  assert.ok(ava.includes('[FEATURE REQUEST]'));
  assert.ok(ava.includes('[PARTNERSHIP INQUIRY]'));
  assert.equal((ava.match(/submitAccountSupportCase\(/g) ?? []).length, 4);
  for (const blocked of ['"supabase_rpc"', '"supabase_select"', '"execute_shell"', '"deploy"']) {
    assert.ok(!ava.includes(blocked));
  }
});
