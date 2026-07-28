alter table public.tour_listings
  add column if not exists operator_id uuid references public.profiles (id) on delete set null,
  add column if not exists price text;

alter table public.inquiries
  add column if not exists operator_id uuid references public.profiles (id) on delete set null;

create index if not exists tour_listings_operator_id_created_at_idx
  on public.tour_listings (operator_id, created_at desc);

create index if not exists inquiries_operator_id_created_at_idx
  on public.inquiries (operator_id, created_at desc);

-- Legacy display names are not ownership credentials. Existing orphaned rows
-- remain unassigned until an administrator maps them to an immutable profile ID.

create table if not exists public.operator_listing_drafts (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles (id) on delete cascade,
  title text,
  location text,
  country text,
  duration text,
  summary text,
  category text,
  price text,
  availability text,
  capacity integer,
  itinerary text,
  inclusions text,
  exclusions text,
  contact_name text,
  contact_email text,
  contact_phone text,
  image_url text,
  is_published boolean not null default false,
  published_listing_id uuid references public.tour_listings (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists operator_listing_drafts_operator_id_updated_at_idx
  on public.operator_listing_drafts (operator_id, updated_at desc);

create index if not exists operator_listing_drafts_operator_id_published_idx
  on public.operator_listing_drafts (operator_id, is_published, updated_at desc);

create or replace function public.set_operator_listing_drafts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists operator_listing_drafts_set_updated_at on public.operator_listing_drafts;
create trigger operator_listing_drafts_set_updated_at
  before update on public.operator_listing_drafts
  for each row execute function public.set_operator_listing_drafts_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'operator-listing-images',
  'operator-listing-images',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.operator_listing_drafts enable row level security;

drop policy if exists "Operator listing drafts are readable by owner" on public.operator_listing_drafts;
create policy "Operator listing drafts are readable by owner"
  on public.operator_listing_drafts
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

drop policy if exists "Operator listing drafts are insertable by owner" on public.operator_listing_drafts;
create policy "Operator listing drafts are insertable by owner"
  on public.operator_listing_drafts
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

drop policy if exists "Operator listing drafts are editable by owner" on public.operator_listing_drafts;
create policy "Operator listing drafts are editable by owner"
  on public.operator_listing_drafts
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

drop policy if exists "Operator listing drafts are deletable by owner" on public.operator_listing_drafts;
create policy "Operator listing drafts are deletable by owner"
  on public.operator_listing_drafts
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

drop policy if exists "Inquiries are readable by owners and staff" on public.inquiries;
create policy "Inquiries are readable by owners and staff"
  on public.inquiries
  for select
  using (
    auth.uid() = user_id
    or operator_id = auth.uid()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role in ('operator', 'admin')
    )
  );
