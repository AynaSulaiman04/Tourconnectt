alter table public.inquiries
  add column if not exists referral_code text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text;

create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in (
      'profile_view',
      'inquiry_submitted',
      'inquiry_reviewed',
      'inquiry_confirmed',
      'inquiry_closed',
      'listing_approved',
      'listing_rejected',
      'listing_featured',
      'document_uploaded',
      'document_shared',
      'user_status_changed',
      'admin_profile_updated',
      'admin_settings_updated',
      'referral_click',
      'referral_conversion'
    )
  ),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  actor_role text,
  target_profile_id uuid references public.profiles (id) on delete set null,
  listing_id uuid references public.tour_listings (id) on delete set null,
  inquiry_id uuid references public.inquiries (id) on delete set null,
  document_id uuid references public.operator_documents (id) on delete set null,
  referral_campaign_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists platform_events_event_type_created_at_idx
  on public.platform_events (event_type, created_at desc);

create index if not exists platform_events_actor_profile_id_created_at_idx
  on public.platform_events (actor_profile_id, created_at desc);

create index if not exists platform_events_target_profile_id_created_at_idx
  on public.platform_events (target_profile_id, created_at desc);

create index if not exists platform_events_inquiry_id_created_at_idx
  on public.platform_events (inquiry_id, created_at desc);

create index if not exists platform_events_listing_id_created_at_idx
  on public.platform_events (listing_id, created_at desc);

create table if not exists public.referral_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  partner_name text not null,
  landing_page text not null default '/Inquiry',
  utm_source text not null,
  utm_medium text not null default 'referral',
  utm_campaign text not null,
  commission_rate numeric(5,2) not null default 12.50,
  usage_count integer not null default 0,
  conversion_count integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.platform_events
  drop constraint if exists platform_events_referral_campaign_id_fkey;

alter table public.platform_events
  add constraint platform_events_referral_campaign_id_fkey
  foreign key (referral_campaign_id) references public.referral_campaigns (id) on delete set null;

create index if not exists referral_campaigns_is_active_created_at_idx
  on public.referral_campaigns (is_active, created_at desc);

create or replace function public.set_referral_campaigns_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists referral_campaigns_set_updated_at on public.referral_campaigns;
create trigger referral_campaigns_set_updated_at
  before update on public.referral_campaigns
  for each row execute function public.set_referral_campaigns_updated_at();

create or replace function public.bump_referral_campaign_totals()
returns trigger
language plpgsql
as $$
begin
  if new.referral_campaign_id is not null then
    if new.event_type = 'referral_click' or new.event_type = 'inquiry_submitted' then
      update public.referral_campaigns
      set usage_count = usage_count + 1
      where id = new.referral_campaign_id;
    end if;

    if new.event_type in ('inquiry_submitted', 'inquiry_confirmed', 'referral_conversion') then
      update public.referral_campaigns
      set conversion_count = conversion_count + 1
      where id = new.referral_campaign_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists platform_events_referral_totals on public.platform_events;
create trigger platform_events_referral_totals
  after insert on public.platform_events
  for each row execute function public.bump_referral_campaign_totals();

create table if not exists public.admin_workspace_settings (
  id smallint primary key default 1,
  approval_intensity text not null default 'balanced' check (approval_intensity in ('strict', 'balanced', 'fast')),
  notification_mode text not null default 'realtime' check (notification_mode in ('realtime', 'digest')),
  moderation_window_hours integer not null default 24 check (moderation_window_hours > 0),
  default_visibility text not null default 'private_until_approved' check (default_visibility in ('private_until_approved', 'manual', 'public')),
  critical_approvals_enabled boolean not null default true,
  listing_rejects_enabled boolean not null default true,
  booking_escalations_enabled boolean not null default true,
  system_alerts_enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_admin_workspace_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists admin_workspace_settings_set_updated_at on public.admin_workspace_settings;
create trigger admin_workspace_settings_set_updated_at
  before update on public.admin_workspace_settings
  for each row execute function public.set_admin_workspace_settings_updated_at();

insert into public.admin_workspace_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.operator_document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.operator_documents (id) on delete cascade,
  shared_with_profile_id uuid not null references public.profiles (id) on delete cascade,
  shared_by_profile_id uuid references public.profiles (id) on delete set null,
  access_level text not null default 'viewer' check (access_level in ('viewer', 'editor')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (document_id, shared_with_profile_id)
);

create index if not exists operator_document_shares_document_id_idx
  on public.operator_document_shares (document_id, created_at desc);

alter table public.operator_documents
  add column if not exists booking_id uuid references public.inquiries (id) on delete set null,
  add column if not exists access_level text not null default 'private' check (access_level in ('private', 'shared', 'restricted'));

alter table public.operator_documents enable row level security;
alter table public.operator_document_shares enable row level security;
alter table public.platform_events enable row level security;
alter table public.referral_campaigns enable row level security;
alter table public.admin_workspace_settings enable row level security;

drop policy if exists "Operator documents are readable by owner" on public.operator_documents;
create policy "Operator documents are readable by owner"
  on public.operator_documents
  for select
  using (
    operator_id = auth.uid()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
    or exists (
      select 1
      from public.operator_document_shares as share
      where share.document_id = operator_documents.id
        and share.shared_with_profile_id = auth.uid()
    )
  );

drop policy if exists "Operator documents are insertable by owner" on public.operator_documents;
create policy "Operator documents are insertable by owner"
  on public.operator_documents
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

drop policy if exists "Operator documents are editable by owner" on public.operator_documents;
create policy "Operator documents are editable by owner"
  on public.operator_documents
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

drop policy if exists "Operator documents are deletable by owner" on public.operator_documents;
create policy "Operator documents are deletable by owner"
  on public.operator_documents
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

drop policy if exists "Document shares are readable by participants" on public.operator_document_shares;
create policy "Document shares are readable by participants"
  on public.operator_document_shares
  for select
  using (
    shared_with_profile_id = auth.uid()
    or shared_by_profile_id = auth.uid()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Document shares are managed by owners" on public.operator_document_shares;
create policy "Document shares are managed by owners"
  on public.operator_document_shares
  for all
  using (
    shared_by_profile_id = auth.uid()
    or exists (
      select 1
      from public.operator_documents as document
      where document.id = operator_document_shares.document_id
        and document.operator_id = auth.uid()
    )
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  )
  with check (
    shared_by_profile_id = auth.uid()
    or exists (
      select 1
      from public.operator_documents as document
      where document.id = operator_document_shares.document_id
        and document.operator_id = auth.uid()
    )
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Admin workspace settings are readable by admins" on public.admin_workspace_settings;
create policy "Admin workspace settings are readable by admins"
  on public.admin_workspace_settings
  for select
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Admin workspace settings are editable by admins" on public.admin_workspace_settings;
create policy "Admin workspace settings are editable by admins"
  on public.admin_workspace_settings
  for update
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Referral campaigns are readable by admins" on public.referral_campaigns;
create policy "Referral campaigns are readable by admins"
  on public.referral_campaigns
  for select
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Referral campaigns are editable by admins" on public.referral_campaigns;
create policy "Referral campaigns are editable by admins"
  on public.referral_campaigns
  for all
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Platform events are readable by admins" on public.platform_events;
create policy "Platform events are readable by admins"
  on public.platform_events
  for select
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

insert into public.referral_campaigns (
  code,
  partner_name,
  landing_page,
  utm_source,
  utm_medium,
  utm_campaign,
  commission_rate,
  metadata
)
select
  'TT-' || upper(regexp_replace(coalesce(nullif(trim(full_name), ''), 'PARTNER'), '[^a-zA-Z0-9]+', '-', 'g')),
  full_name,
  '/Inquiry',
  lower(regexp_replace(coalesce(nullif(trim(full_name), ''), 'partner'), '[^a-zA-Z0-9]+', '-', 'g')),
  'referral',
  lower(regexp_replace(coalesce(nullif(trim(full_name), ''), 'partner'), '[^a-zA-Z0-9]+', '-', 'g')) || '-launch',
  12.50,
  jsonb_build_object('seeded_from', 'operator-profile')
from public.profiles
where role = 'operator'
on conflict (code) do nothing;
