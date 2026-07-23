create table if not exists public.traveler_care_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone_number text,
  allergies text,
  dietary_restrictions text,
  mobility_requirements text,
  medical_notes text,
  can_walk_15_minutes boolean,
  default_pickup_location text,
  preferred_pickup_time text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint traveler_care_profiles_phone_length check (char_length(coalesce(phone_number, '')) <= 32),
  constraint traveler_care_profiles_allergies_length check (char_length(coalesce(allergies, '')) <= 1000),
  constraint traveler_care_profiles_dietary_length check (char_length(coalesce(dietary_restrictions, '')) <= 1000),
  constraint traveler_care_profiles_mobility_length check (char_length(coalesce(mobility_requirements, '')) <= 1000),
  constraint traveler_care_profiles_medical_length check (char_length(coalesce(medical_notes, '')) <= 2000),
  constraint traveler_care_profiles_pickup_location_length check (char_length(coalesce(default_pickup_location, '')) <= 300),
  constraint traveler_care_profiles_pickup_time_length check (char_length(coalesce(preferred_pickup_time, '')) <= 120)
);

create or replace function public.set_traveler_care_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists traveler_care_profiles_set_updated_at on public.traveler_care_profiles;
create trigger traveler_care_profiles_set_updated_at
  before update on public.traveler_care_profiles
  for each row execute function public.set_traveler_care_profiles_updated_at();

alter table public.traveler_care_profiles enable row level security;

drop policy if exists "Travelers can read their care profile" on public.traveler_care_profiles;
create policy "Travelers can read their care profile"
  on public.traveler_care_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Travelers can create their care profile" on public.traveler_care_profiles;
create policy "Travelers can create their care profile"
  on public.traveler_care_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Travelers can update their care profile" on public.traveler_care_profiles;
create policy "Travelers can update their care profile"
  on public.traveler_care_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Admins can manage traveler care profiles" on public.traveler_care_profiles;
create policy "Admins can manage traveler care profiles"
  on public.traveler_care_profiles for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Assigned operators can read traveler care profiles" on public.traveler_care_profiles;
create policy "Assigned operators can read traveler care profiles"
  on public.traveler_care_profiles for select
  using (
    exists (
      select 1 from public.inquiries
      where inquiries.user_id = traveler_care_profiles.user_id
        and inquiries.operator_id = auth.uid()
    )
  );

