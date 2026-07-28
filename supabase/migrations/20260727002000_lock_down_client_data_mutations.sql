-- Sensitive workflow state is written only by trusted server routes using the
-- service role. Browser Supabase clients retain the minimum read access needed
-- for realtime UI updates.

-- The production privileged accounts were reviewed before this migration.
-- Abort instead of silently preserving an unexpected legacy account that may
-- have self-selected a privileged role under the original signup trigger.
do $$
declare
  unexpected_profile uuid;
begin
  select profile.id
  into unexpected_profile
  from public.profiles as profile
  left join auth.users as auth_user on auth_user.id = profile.id
  where profile.role in ('admin', 'operator')
    and not (
      (
        profile.id = 'c54c85b8-b9a9-4eda-9b6f-44c5e1dc940a'::uuid
        and profile.role = 'admin'
        and lower(profile.email) = 'admin@ttconnect.com'
        and lower(auth_user.email) = 'admin@ttconnect.com'
      )
      or (
        profile.id = '00ac796e-7f5d-45cb-99c3-4af3219752de'::uuid
        and profile.role = 'admin'
        and lower(profile.email) = 'ayna@test.com'
        and lower(auth_user.email) = 'ayna@test.com'
      )
      or (
        profile.id = '6f4559a3-add0-46d2-ac62-83fa0afd17a8'::uuid
        and profile.role = 'operator'
        and lower(profile.email) = 'operator.demo.20260522@example.com'
        and lower(auth_user.email) = 'operator.demo.20260522@example.com'
      )
    )
  limit 1;

  if unexpected_profile is not null then
    raise exception 'Unexpected legacy privileged profile requires manual review: %', unexpected_profile;
  end if;
end
$$;

revoke all privileges on table public.wipay_payments from anon, authenticated;

drop policy if exists "WiPay payments are insertable by owners and staff" on public.wipay_payments;
drop policy if exists "WiPay payments are editable by owners and staff" on public.wipay_payments;
drop policy if exists "WiPay payments are deletable by owners and staff" on public.wipay_payments;
drop policy if exists "WiPay payments are readable by owners and staff" on public.wipay_payments;
drop policy if exists "WiPay payments are readable by authorized participants" on public.wipay_payments;

revoke all privileges on table public.inquiries from anon;
revoke insert, update, delete on table public.inquiries from authenticated;
grant select on table public.inquiries to authenticated;

alter table public.inquiries
  add column if not exists submission_fingerprint text;

create index if not exists inquiries_submission_fingerprint_created_at_idx
  on public.inquiries (submission_fingerprint, created_at desc)
  where submission_fingerprint is not null;

create index if not exists inquiries_traveler_email_created_at_idx
  on public.inquiries (traveler_email, created_at desc);

drop policy if exists "Inquiries are insertable by visitors and owners" on public.inquiries;
drop policy if exists "Inquiries are readable by owners and staff" on public.inquiries;
create policy "Inquiries are readable by authorized participants"
  on public.inquiries
  for select
  using (
    (
      user_id = auth.uid()
      and exists (
        select 1 from public.profiles as profile
        where profile.id = auth.uid()
          and profile.role = 'traveler'
          and profile.is_active = true
      )
    )
    or (
      operator_id = auth.uid()
      and exists (
        select 1 from public.profiles as profile
        where profile.id = auth.uid()
          and profile.role = 'operator'
          and profile.is_active = true
      )
    )
    or exists (
      select 1 from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
        and profile.is_active = true
    )
  );

revoke all privileges on table public.traveler_operator_conversations from anon;
revoke all privileges on table public.traveler_operator_messages from anon;
revoke insert, update, delete on table public.traveler_operator_conversations from authenticated;
revoke insert, update, delete on table public.traveler_operator_messages from authenticated;
grant select on table public.traveler_operator_conversations to authenticated;
grant select on table public.traveler_operator_messages to authenticated;

drop policy if exists "Traveler operator conversations are insertable by traveler" on public.traveler_operator_conversations;
drop policy if exists "Traveler operator conversations are editable by participants and staff" on public.traveler_operator_conversations;
drop policy if exists "Traveler operator conversations are deletable by staff" on public.traveler_operator_conversations;
drop policy if exists "Traveler operator conversations are readable by participants and staff" on public.traveler_operator_conversations;
create policy "Traveler operator conversations are readable by active participants"
  on public.traveler_operator_conversations
  for select
  using (
    (
      traveler_id = auth.uid()
      and exists (
        select 1 from public.profiles as profile
        where profile.id = auth.uid()
          and profile.role = 'traveler'
          and profile.is_active = true
      )
    )
    or (
      operator_id = auth.uid()
      and exists (
        select 1 from public.profiles as profile
        where profile.id = auth.uid()
          and profile.role = 'operator'
          and profile.is_active = true
      )
    )
    or exists (
      select 1 from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
        and profile.is_active = true
    )
  );

drop policy if exists "Traveler operator messages are insertable by participants and staff" on public.traveler_operator_messages;
drop policy if exists "Traveler operator messages are editable by staff" on public.traveler_operator_messages;
drop policy if exists "Traveler operator messages are deletable by staff" on public.traveler_operator_messages;
drop policy if exists "Traveler operator messages are readable by participants and staff" on public.traveler_operator_messages;
create policy "Traveler operator messages are readable by active participants"
  on public.traveler_operator_messages
  for select
  using (
    exists (
      select 1
      from public.traveler_operator_conversations as conversation
      where conversation.id = conversation_id
        and (
          (
            conversation.traveler_id = auth.uid()
            and exists (
              select 1 from public.profiles as profile
              where profile.id = auth.uid()
                and profile.role = 'traveler'
                and profile.is_active = true
            )
          )
          or (
            conversation.operator_id = auth.uid()
            and exists (
              select 1 from public.profiles as profile
              where profile.id = auth.uid()
                and profile.role = 'operator'
                and profile.is_active = true
            )
          )
          or exists (
            select 1 from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role = 'admin'
              and profile.is_active = true
          )
        )
    )
  );

drop policy if exists "Travelers can read their care profile" on public.traveler_care_profiles;
create policy "Active travelers can read their care profile"
  on public.traveler_care_profiles for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'traveler'
        and profiles.is_active = true
    )
  );

drop policy if exists "Travelers can create their care profile" on public.traveler_care_profiles;
create policy "Active travelers can create their care profile"
  on public.traveler_care_profiles for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'traveler'
        and profiles.is_active = true
    )
  );

drop policy if exists "Travelers can update their care profile" on public.traveler_care_profiles;
create policy "Active travelers can update their care profile"
  on public.traveler_care_profiles for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'traveler'
        and profiles.is_active = true
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'traveler'
        and profiles.is_active = true
    )
  );

drop policy if exists "Admins can manage traveler care profiles" on public.traveler_care_profiles;
create policy "Active admins can manage traveler care profiles"
  on public.traveler_care_profiles for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
        and profiles.is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
        and profiles.is_active = true
    )
  );

drop policy if exists "Assigned operators can read traveler care profiles" on public.traveler_care_profiles;
create policy "Active assigned operators can read traveler care profiles"
  on public.traveler_care_profiles for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'operator'
        and profiles.is_active = true
    )
    and exists (
      select 1 from public.inquiries
      where inquiries.user_id = traveler_care_profiles.user_id
        and inquiries.operator_id = auth.uid()
    )
  );

-- OAuth credentials and non-realtime workspace records are server-only.
revoke all privileges on table public.operator_calendar_integrations from anon, authenticated;
drop policy if exists "Operator calendar integrations are readable by owner" on public.operator_calendar_integrations;
drop policy if exists "Operator calendar integrations are insertable by owner" on public.operator_calendar_integrations;
drop policy if exists "Operator calendar integrations are editable by owner" on public.operator_calendar_integrations;
drop policy if exists "Operator calendar integrations are deletable by owner" on public.operator_calendar_integrations;

alter table public.operator_settings enable row level security;
revoke all privileges on table public.operator_settings from anon, authenticated;

revoke all privileges on table public.operator_documents from anon, authenticated;
revoke all privileges on table public.operator_document_shares from anon, authenticated;
drop policy if exists "Operator documents are readable by owner" on public.operator_documents;
drop policy if exists "Operator documents are insertable by owner" on public.operator_documents;
drop policy if exists "Operator documents are editable by owner" on public.operator_documents;
drop policy if exists "Operator documents are deletable by owner" on public.operator_documents;
drop policy if exists "Document shares are readable by participants" on public.operator_document_shares;
drop policy if exists "Document shares are managed by owners" on public.operator_document_shares;

revoke all privileges on table public.concierge_conversations from anon, authenticated;
revoke all privileges on table public.concierge_messages from anon, authenticated;
revoke all privileges on table public.concierge_knowledge_sources from anon, authenticated;
drop policy if exists "Concierge conversations are readable by owners and staff" on public.concierge_conversations;
drop policy if exists "Concierge conversations are insertable by authenticated users" on public.concierge_conversations;
drop policy if exists "Concierge conversations are editable by owners and staff" on public.concierge_conversations;
drop policy if exists "Concierge conversations are deletable by owners and staff" on public.concierge_conversations;
drop policy if exists "Concierge messages are readable by conversation owners and staff" on public.concierge_messages;
drop policy if exists "Concierge messages are insertable by conversation owners and staff" on public.concierge_messages;
drop policy if exists "Concierge messages are editable by staff" on public.concierge_messages;
drop policy if exists "Concierge messages are deletable by staff" on public.concierge_messages;
drop policy if exists "Concierge knowledge sources are publicly readable when active" on public.concierge_knowledge_sources;
drop policy if exists "Concierge knowledge sources are manageable by admins" on public.concierge_knowledge_sources;

revoke all privileges on table public.reviews from anon, authenticated;
drop policy if exists "Reviews are readable by participants and staff" on public.reviews;
drop policy if exists "Reviews are insertable by the traveler" on public.reviews;
drop policy if exists "Reviews are editable by the traveler" on public.reviews;
drop policy if exists "Reviews are deletable by the traveler" on public.reviews;

revoke all privileges on table public.traveler_countries from anon, authenticated;
drop policy if exists "Traveler countries are readable by owners" on public.traveler_countries;
drop policy if exists "Traveler countries are insertable by owners" on public.traveler_countries;
drop policy if exists "Traveler countries are editable by owners" on public.traveler_countries;
drop policy if exists "Traveler countries are deletable by owners" on public.traveler_countries;

revoke all privileges on table public.admin_workspace_settings from anon, authenticated;
revoke all privileges on table public.referral_campaigns from anon, authenticated;
revoke all privileges on table public.platform_events from anon, authenticated;
drop policy if exists "Admin workspace settings are readable by admins" on public.admin_workspace_settings;
drop policy if exists "Admin workspace settings are editable by admins" on public.admin_workspace_settings;
drop policy if exists "Referral campaigns are readable by admins" on public.referral_campaigns;
drop policy if exists "Referral campaigns are editable by admins" on public.referral_campaigns;
drop policy if exists "Platform events are readable by admins" on public.platform_events;

-- Listing drafts are read by browser realtime, but all mutations already pass
-- through an authenticated server route.
revoke all privileges on table public.operator_listing_drafts from anon;
revoke insert, update, delete on table public.operator_listing_drafts from authenticated;
grant select on table public.operator_listing_drafts to authenticated;
drop policy if exists "Operator listing drafts are insertable by owner" on public.operator_listing_drafts;
drop policy if exists "Operator listing drafts are editable by owner" on public.operator_listing_drafts;
drop policy if exists "Operator listing drafts are deletable by owner" on public.operator_listing_drafts;
drop policy if exists "Operator listing drafts are readable by owner" on public.operator_listing_drafts;
create policy "Operator listing drafts are readable by active owner"
  on public.operator_listing_drafts
  for select
  using (
    (
      operator_id = auth.uid()
      and exists (
        select 1 from public.profiles as profile
        where profile.id = auth.uid()
          and profile.role = 'operator'
          and profile.is_active = true
      )
    )
    or exists (
      select 1 from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
        and profile.is_active = true
    )
  );

-- Public clients may only see published, active experiences.
drop policy if exists "Tour listings are publicly readable" on public.tour_listings;
create policy "Tour listings are publicly readable"
  on public.tour_listings
  for select
  using (is_active = true and status = 'live');
grant select on table public.tour_listings to anon, authenticated;

-- Profile edits are already column-limited; suspended profiles cannot use the
-- owner policy while an old access token remains valid.
drop policy if exists "Profiles are editable by owners" on public.profiles;
create policy "Profiles are editable by active owners"
  on public.profiles
  for update
  using (auth.uid() = id and is_active = true)
  with check (auth.uid() = id and is_active = true);

-- NotificationCenter needs direct realtime reads and a narrow read_at update.
revoke all privileges on table public.platform_notifications from anon;
revoke insert, update, delete on table public.platform_notifications from authenticated;
grant select on table public.platform_notifications to authenticated;
grant update (read_at) on table public.platform_notifications to authenticated;
drop policy if exists "Platform notifications are readable by recipients" on public.platform_notifications;
create policy "Platform notifications are readable by active recipients"
  on public.platform_notifications
  for select
  using (
    recipient_profile_id = auth.uid()
    and exists (
      select 1 from public.profiles as profile
      where profile.id = auth.uid()
        and profile.is_active = true
    )
  );

drop policy if exists "Platform notifications are editable by recipients" on public.platform_notifications;
create policy "Platform notification read state is editable by active recipients"
  on public.platform_notifications
  for update
  using (
    recipient_profile_id = auth.uid()
    and exists (
      select 1 from public.profiles as profile
      where profile.id = auth.uid()
        and profile.is_active = true
    )
  )
  with check (
    recipient_profile_id = auth.uid()
    and exists (
      select 1 from public.profiles as profile
      where profile.id = auth.uid()
        and profile.is_active = true
    )
  );
