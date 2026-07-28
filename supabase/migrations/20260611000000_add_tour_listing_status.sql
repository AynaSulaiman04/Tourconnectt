alter table public.tour_listings
  add column if not exists status text;

update public.tour_listings
set status = case
  when is_active then 'live'
  else 'under_review'
end
where status is null;

alter table public.tour_listings
  alter column status set default 'under_review',
  alter column status set not null;

alter table public.tour_listings
  drop constraint if exists tour_listings_status_check;

alter table public.tour_listings
  add constraint tour_listings_status_check
  check (status in ('draft', 'under_review', 'live', 'rejected'));

create index if not exists tour_listings_status_created_at_idx
  on public.tour_listings (status, created_at desc);
