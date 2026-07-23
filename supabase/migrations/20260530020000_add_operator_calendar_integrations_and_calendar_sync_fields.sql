create table if not exists public.operator_calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  access_token text,
  refresh_token text not null,
  expires_at timestamptz,
  calendar_id text not null default 'primary',
  sync_token text,
  connected_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint operator_calendar_integrations_operator_provider_key unique (operator_id, provider)
);

alter table public.inquiries
  add column if not exists google_calendar_event_id text,
  add column if not exists google_calendar_synced_at timestamptz,
  add column if not exists ical_uid text,
  add column if not exists calendar_sync_status text;

alter table public.inquiries
  add constraint inquiries_calendar_sync_status_check
  check (calendar_sync_status is null or calendar_sync_status in ('synced', 'failed', 'skipped', 'conflict', 'deleted'));

create index if not exists operator_calendar_integrations_operator_id_idx
  on public.operator_calendar_integrations (operator_id);

create index if not exists operator_calendar_integrations_provider_idx
  on public.operator_calendar_integrations (provider);

create index if not exists inquiries_operator_status_start_date_idx
  on public.inquiries (operator_id, status, preferred_start_date desc);

create index if not exists inquiries_google_calendar_event_id_idx
  on public.inquiries (google_calendar_event_id);

create or replace function public.set_operator_calendar_integrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists operator_calendar_integrations_set_updated_at on public.operator_calendar_integrations;
create trigger operator_calendar_integrations_set_updated_at
  before update on public.operator_calendar_integrations
  for each row execute function public.set_operator_calendar_integrations_updated_at();

alter table public.operator_calendar_integrations enable row level security;

drop policy if exists "Operator calendar integrations are readable by owner" on public.operator_calendar_integrations;
create policy "Operator calendar integrations are readable by owner"
  on public.operator_calendar_integrations
  for select
  using (
    operator_id = auth.uid()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Operator calendar integrations are insertable by owner" on public.operator_calendar_integrations;
create policy "Operator calendar integrations are insertable by owner"
  on public.operator_calendar_integrations
  for insert
  with check (
    operator_id = auth.uid()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Operator calendar integrations are editable by owner" on public.operator_calendar_integrations;
create policy "Operator calendar integrations are editable by owner"
  on public.operator_calendar_integrations
  for update
  using (
    operator_id = auth.uid()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  )
  with check (
    operator_id = auth.uid()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Operator calendar integrations are deletable by owner" on public.operator_calendar_integrations;
create policy "Operator calendar integrations are deletable by owner"
  on public.operator_calendar_integrations
  for delete
  using (
    operator_id = auth.uid()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );
