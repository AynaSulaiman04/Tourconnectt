-- Profile roles and account status are controlled by trusted server-side flows.
-- Public Supabase sign-up metadata must never be able to grant operator/admin access.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    preferred_inquiry_area,
    role,
    is_active,
    status_reason
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(trim(coalesce(metadata ->> 'full_name', '')), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    nullif(trim(coalesce(metadata ->> 'preferred_inquiry_area', '')), ''),
    'traveler',
    true,
    null
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop policy if exists "Profiles are editable by owners" on public.profiles;
revoke update on table public.profiles from anon, authenticated;
grant update (
  full_name,
  preferred_inquiry_area,
  profile_image_url,
  avatar_base64
) on table public.profiles to authenticated;

create policy "Profiles are editable by owners"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated'
    and auth.uid() = old.id
    and (
      new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.status_reason is distinct from old.status_reason
    )
  then
    raise exception 'Profile role and account status can only be changed by an administrator.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();
