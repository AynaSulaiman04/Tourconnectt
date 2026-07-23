alter table public.operator_listing_drafts
  add column if not exists image_base64 text;

alter table public.tour_listings
  add column if not exists image_base64 text;
