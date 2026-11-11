-- Ava support OTP: one code authorizes one low-risk, precommitted change.
-- Private storage is deliberately outside Supabase exposed API schemas.
create schema if not exists ava_private;
revoke all on schema ava_private from public, anon, authenticated;
-- Run in Supabase SQL Editor, reviewed before deploying the gateway.
-- SECURITY: install as a privileged migration owner (postgres); never execute as anon.
create table if not exists ava_private.ava_account_otp (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  new_full_name text not null,
  otp_mac text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  sent_at timestamptz,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  consumed_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists ava_account_otp_email_created_idx
  on ava_private.ava_account_otp(email, created_at desc);
create index if not exists ava_account_otp_created_idx
  on ava_private.ava_account_otp(created_at desc);
alter table ava_private.ava_account_otp enable row level security;
revoke all on ava_private.ava_account_otp from public, anon, authenticated;
-- Do not grant direct table access; only dedicated RPCs may touch private challenges.

create table if not exists ava_private.ava_support_cases (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  issue text not null check (char_length(issue) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved')),
  created_at timestamptz not null default now()
);
create index if not exists ava_support_cases_email_idx
  on ava_private.ava_support_cases(email, created_at desc);
alter table ava_private.ava_support_cases enable row level security;
revoke all on ava_private.ava_support_cases from public, anon, authenticated;
-- Do not grant direct table access to private support cases.

create or replace function public.ava_start_full_name_change(
  p_id uuid, p_email text, p_full_name text, p_otp_mac text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_user_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'not authorized';
  end if;
  if char_length(v_email) > 320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_full_name <> btrim(p_full_name) or char_length(p_full_name) not between 1 and 120
     or p_otp_mac !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid request';
  end if;
  -- Serialize OTP requests for a given address so cooldown checks are atomic.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ava:' || v_email, 0));
  if (select count(*) from ava_private.ava_account_otp
      where created_at >= now() - interval '1 hour') >= 200
     or (select count(*) from ava_private.ava_account_otp
      where email = v_email and created_at >= now() - interval '1 hour') >= 4
     or exists (select 1 from ava_private.ava_account_otp
      where email = v_email and created_at >= now() - interval '60 seconds') then
    return false;
  end if;
  select u.id into v_user_id from auth.users u
  where lower(u.email) = v_email and u.email_confirmed_at is not null
  and (u.banned_until is null or u.banned_until < now())
  limit 1;
  if v_user_id is null then return false; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id
                 and coalesce(p.is_blocked, false) = false) then
    return false;
  end if;
  -- A new challenge invalidates any earlier pending action for this account.
  update ava_private.ava_account_otp set cancelled_at=now()
  where email=v_email and consumed_at is null and cancelled_at is null;
  insert into ava_private.ava_account_otp(id,user_id,email,new_full_name,otp_mac)
  values(p_id,v_user_id,v_email,p_full_name,p_otp_mac);
  return true;
end $$;

create or replace function public.ava_mark_otp_sent(p_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'not authorized';
  end if;
  update ava_private.ava_account_otp set sent_at = now()
  where id=p_id and sent_at is null and cancelled_at is null
    and consumed_at is null and expires_at > now();
  return found;
end $$;

create or replace function public.ava_cancel_otp(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'not authorized';
  end if;
  update ava_private.ava_account_otp set cancelled_at = now()
  where id=p_id and consumed_at is null;
end $$;

create or replace function public.ava_confirm_full_name_change(
  p_id uuid, p_otp_mac text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_req ava_private.ava_account_otp%rowtype;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'not authorized';
  end if;
  select * into v_req from ava_private.ava_account_otp where id = p_id for update;
  if not found then return false; end if;
  if v_req.sent_at is null or v_req.expires_at <= now()
    or v_req.cancelled_at is not null or v_req.consumed_at is not null
    or v_req.attempts >= 5 then return false; end if;
  if v_req.otp_mac <> p_otp_mac then
    update ava_private.ava_account_otp
    set attempts = attempts + 1,
        cancelled_at = case when attempts + 1 >= 5 then now() else cancelled_at end
    where id=p_id;
    return false;
  end if;
  -- A change of login email invalidates all outstanding challenges.
  if not exists (select 1 from auth.users u where u.id=v_req.user_id
      and lower(u.email)=v_req.email and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now())) then
    update ava_private.ava_account_otp set cancelled_at=now() where id=p_id;
    return false;
  end if;
  update public.profiles set full_name=v_req.new_full_name
    where id=v_req.user_id and coalesce(is_blocked,false)=false;
  if not found then
    update ava_private.ava_account_otp set cancelled_at=now() where id=p_id;
    return false;
  end if;
  update ava_private.ava_account_otp set consumed_at=now() where id=p_id;
  return true;
end $$;

create or replace function public.ava_create_support_case(
  p_email text, p_issue text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_case_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'not authorized';
  end if;
  if char_length(v_email) > 320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or char_length(btrim(p_issue)) not between 10 and 2000 then
    raise exception 'invalid request';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ava-ticket:' || v_email, 0));
  if (select count(*) from ava_private.ava_support_cases where created_at >= now() - interval '1 hour') >= 200
    or (select count(*) from ava_private.ava_support_cases where email=v_email
        and created_at >= now() - interval '1 hour') >= 3 then
    return null;
  end if;
  insert into ava_private.ava_support_cases(email, issue)
  values (v_email, btrim(p_issue)) returning id into v_case_id;
  return v_case_id;
end $$;

revoke all on function public.ava_start_full_name_change(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.ava_mark_otp_sent(uuid) from public,anon,authenticated;
revoke all on function public.ava_cancel_otp(uuid) from public,anon,authenticated;
revoke all on function public.ava_confirm_full_name_change(uuid,text) from public,anon,authenticated;
revoke all on function public.ava_create_support_case(text,text) from public,anon,authenticated;
grant execute on function public.ava_start_full_name_change(uuid,text,text,text) to service_role;
grant execute on function public.ava_mark_otp_sent(uuid) to service_role;
grant execute on function public.ava_cancel_otp(uuid) to service_role;
grant execute on function public.ava_confirm_full_name_change(uuid,text) to service_role;
grant execute on function public.ava_create_support_case(text,text) to service_role;

-- The supplied OTP and the HMAC secret are never stored in this database.
-- Retention: schedule a separate database cron job to remove expired OTP rows
-- after the approved security-audit retention period.

-- Operators can read cases using the privileged Supabase SQL Editor only.
-- Do not add tables to public exposed schemas or grant anon/authenticated access.
