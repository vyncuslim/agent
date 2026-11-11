-- Ava OTP records are short-lived and retained for a limited audit window.
-- Only privileged postgres-owned cron jobs run this cleanup; no user RPC.
-- Keep support cases until they are explicitly resolved/reviewed.
select cron.schedule(
  'vynalth_ava_otp_retention',
  '7 2 * * *',
  $$delete from ava_private.ava_account_otp
    where expires_at < now() - interval '7 days'$$
);
