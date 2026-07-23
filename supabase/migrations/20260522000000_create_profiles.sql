create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  preferred_inquiry_area text,
  role text not null default 'traveler' check (role in ('traveler', 'operator', 'admin')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_preferred_inquiry_area_check
    check (
      preferred_inquiry_area is null
      or preferred_inquiry_area in ('desert', 'coastal', 'arctic')
    )
);

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
    role
  )
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(coalesce(metadata ->> 'full_name', '')), ''), split_part(coalesce(new.email, ''), '@', 1)),
    nullif(trim(coalesce(metadata ->> 'preferred_inquiry_area', '')), ''),
    coalesce(nullif(trim(coalesce(metadata ->> 'role', '')), ''), 'traveler')
  );

  return new;
end;
$$;

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profile_updated_at();

insert into public.profiles (
  id,
  email,
  full_name,
  preferred_inquiry_area,
  role
)
select
  u.id,
  u.email,
  coalesce(
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'preferred_inquiry_area', '')), ''),
  coalesce(nullif(trim(coalesce(u.raw_user_meta_data ->> 'role', '')), ''), 'traveler')
from auth.users as u
on conflict (id) do nothing;

alter table public.profiles enable row level security;

drop policy if exists "Profiles are readable by owners" on public.profiles;
create policy "Profiles are readable by owners"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "Profiles are editable by owners" on public.profiles;
create policy "Profiles are editable by owners"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
