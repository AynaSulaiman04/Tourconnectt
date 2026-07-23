create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.profiles (id) on delete cascade,
  operator_id uuid references public.profiles (id) on delete set null,
  listing_id uuid references public.tour_listings (id) on delete set null,
  inquiry_id uuid references public.inquiries (id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists reviews_inquiry_id_unique_idx
  on public.reviews (inquiry_id)
  where inquiry_id is not null;

create index if not exists reviews_traveler_id_created_at_idx
  on public.reviews (traveler_id, created_at desc);

create index if not exists reviews_operator_id_created_at_idx
  on public.reviews (operator_id, created_at desc);

create index if not exists reviews_listing_id_created_at_idx
  on public.reviews (listing_id, created_at desc);

create or replace function public.set_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_reviews_updated_at();

alter table public.reviews enable row level security;

drop policy if exists "Reviews are readable by participants and staff" on public.reviews;
create policy "Reviews are readable by participants and staff"
  on public.reviews
  for select
  using (
    auth.uid() = traveler_id
    or auth.uid() = operator_id
    or exists (
      select 1
      from public.tour_listings as listing
      where listing.id = listing_id
        and listing.operator_id = auth.uid()
    )
    or exists (
      select 1
      from public.inquiries as inquiry
      where inquiry.id = inquiry_id
        and inquiry.operator_id = auth.uid()
    )
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Reviews are insertable by the traveler" on public.reviews;
create policy "Reviews are insertable by the traveler"
  on public.reviews
  for insert
  with check (
    auth.uid() = traveler_id
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Reviews are editable by the traveler" on public.reviews;
create policy "Reviews are editable by the traveler"
  on public.reviews
  for update
  using (
    auth.uid() = traveler_id
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  )
  with check (
    auth.uid() = traveler_id
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Reviews are deletable by the traveler" on public.reviews;
create policy "Reviews are deletable by the traveler"
  on public.reviews
  for delete
  using (
    auth.uid() = traveler_id
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );
