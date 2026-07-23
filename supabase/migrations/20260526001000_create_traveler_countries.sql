create table if not exists public.traveler_countries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  country_name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint traveler_countries_user_country_unique unique (user_id, country_name)
);

create index if not exists traveler_countries_user_id_idx
  on public.traveler_countries (user_id);

alter table public.traveler_countries enable row level security;

drop policy if exists "Traveler countries are readable by owners" on public.traveler_countries;
create policy "Traveler countries are readable by owners"
  on public.traveler_countries
  for select
  using (auth.uid() = user_id);

drop policy if exists "Traveler countries are insertable by owners" on public.traveler_countries;
create policy "Traveler countries are insertable by owners"
  on public.traveler_countries
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Traveler countries are editable by owners" on public.traveler_countries;
create policy "Traveler countries are editable by owners"
  on public.traveler_countries
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Traveler countries are deletable by owners" on public.traveler_countries;
create policy "Traveler countries are deletable by owners"
  on public.traveler_countries
  for delete
  using (auth.uid() = user_id);
