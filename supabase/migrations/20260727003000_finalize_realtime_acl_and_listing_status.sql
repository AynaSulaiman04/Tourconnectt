-- The original status migration added a NOT NULL default before its backfill,
-- so legacy active seed listings were left under_review even though the
-- previous public policy treated every active row as published. These two
-- immutable production IDs were audited as the affected legacy seed rows.
-- Keep the correction explicit so a pending listing can never be promoted by
-- a broad status predicate in another environment.
update public.tour_listings
set status = 'live'
where id in (
    'df60c000-f11f-404e-95b2-255ae53b0da8'::uuid,
    'f2f50d42-e820-4e64-b6fe-623eb130b43c'::uuid
  )
  and is_active = true
  and status = 'under_review';

-- Remove residual Supabase default privileges such as TRUNCATE, REFERENCES,
-- and TRIGGER. Re-grant only the reads required for browser realtime.
revoke all privileges on table public.inquiries from anon, authenticated;
grant select on table public.inquiries to authenticated;

revoke all privileges on table public.traveler_operator_conversations from anon, authenticated;
revoke all privileges on table public.traveler_operator_messages from anon, authenticated;
grant select on table public.traveler_operator_conversations to authenticated;
grant select on table public.traveler_operator_messages to authenticated;

revoke all privileges on table public.operator_listing_drafts from anon, authenticated;
grant select on table public.operator_listing_drafts to authenticated;

revoke all privileges on table public.platform_notifications from anon, authenticated;
grant select on table public.platform_notifications to authenticated;
grant update (read_at) on table public.platform_notifications to authenticated;

revoke all privileges on table public.tour_listings from anon, authenticated;
grant select on table public.tour_listings to anon, authenticated;
