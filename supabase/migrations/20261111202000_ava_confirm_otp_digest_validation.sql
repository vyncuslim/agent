-- Reject missing and malformed OTP digests before reading a challenge.
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
  if p_id is null or p_otp_mac is null or p_otp_mac !~ '^[0-9a-f]{64}$' then
    return false;
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
