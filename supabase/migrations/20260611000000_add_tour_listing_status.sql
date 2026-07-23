alter table public.tour_listings
  add column if not exists status text not null default 'under_review' check (status in ('draft', 'under_review', 'live', 'rejected'));

update public.tour_listings
set status = case
  when is_active then 'live'
  else 'under_review'
end
where status is null;

create index if not exists tour_listings_status_created_at_idx
  on public.tour_listings (status, created_at desc);

