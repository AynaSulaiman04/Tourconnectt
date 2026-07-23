create extension if not exists pgcrypto;

create table if not exists public.tour_listings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text not null,
  country text not null,
  duration text not null,
  summary text not null,
  image_url text,
  operator_name text not null,
  featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  listing_id uuid references public.tour_listings (id) on delete set null,
  traveler_name text not null,
  traveler_email text not null,
  traveler_phone text,
  destination text not null,
  destination_country text not null,
  operator_name text not null,
  preferred_start_date date,
  preferred_end_date date,
  availability text not null default 'flexible',
  notes text,
  status text not null default 'submitted' check (status in ('submitted', 'reviewed', 'confirmed', 'closed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inquiries_availability_check
    check (availability in ('morning', 'afternoon', 'evening', 'flexible'))
);

create index if not exists inquiries_user_id_created_at_idx
  on public.inquiries (user_id, created_at desc);

create index if not exists inquiries_listing_id_created_at_idx
  on public.inquiries (listing_id, created_at desc);

create index if not exists tour_listings_featured_active_idx
  on public.tour_listings (featured desc, is_active desc, created_at desc);

create or replace function public.set_tour_listings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.set_inquiries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists tour_listings_set_updated_at on public.tour_listings;
create trigger tour_listings_set_updated_at
  before update on public.tour_listings
  for each row execute function public.set_tour_listings_updated_at();

drop trigger if exists inquiries_set_updated_at on public.inquiries;
create trigger inquiries_set_updated_at
  before update on public.inquiries
  for each row execute function public.set_inquiries_updated_at();

insert into public.tour_listings (
  title,
  location,
  country,
  duration,
  summary,
  image_url,
  operator_name,
  featured
)
values
  (
    'The Desert Pavilion',
    'Canyon Point, Utah',
    'USA',
    '4 Days',
    'Private stay with concierge support and clear arrival windows.',
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=95',
    'Sahara Expeditions',
    true
  ),
  (
    'The Sandstone Sanctuary',
    'AlUla, Saudi Arabia',
    'Saudi Arabia',
    '7 Days',
    'Quiet luxury retreat with guided access and transfers.',
    'https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=1600&q=95',
    'Luxe Caravan Co.',
    true
  ),
  (
    'The Nomadic Observatory',
    'Wahiba Sands, Oman',
    'Oman',
    '5 Days',
    'Stargazing-forward itinerary with flexible arrival options.',
    'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1600&q=95',
    'Heritage Routes',
    false
  ),
  (
    'The Coastal Archive',
    'Milos, Greece',
    'Greece',
    '6 Days',
    'A coastal escape with soft pacing, private transfers, and sunset dining.',
    'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1600&q=95',
    'Blue Horizon Travel',
    false
  )
on conflict do nothing;

alter table public.tour_listings enable row level security;
alter table public.inquiries enable row level security;

drop policy if exists "Tour listings are publicly readable" on public.tour_listings;
create policy "Tour listings are publicly readable"
  on public.tour_listings
  for select
  using (is_active = true);

drop policy if exists "Inquiries are readable by owners and staff" on public.inquiries;
create policy "Inquiries are readable by owners and staff"
  on public.inquiries
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role in ('operator', 'admin')
    )
  );

drop policy if exists "Inquiries are insertable by visitors and owners" on public.inquiries;
create policy "Inquiries are insertable by visitors and owners"
  on public.inquiries
  for insert
  with check (
    length(trim(traveler_name)) > 0
    and length(trim(traveler_email)) > 0
  );
