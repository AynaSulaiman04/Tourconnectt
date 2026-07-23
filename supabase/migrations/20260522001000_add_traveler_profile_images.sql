alter table public.profiles
  add column if not exists profile_image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'traveler-profile-images',
  'traveler-profile-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Traveler profile images are publicly readable" on storage.objects;
create policy "Traveler profile images are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'traveler-profile-images');

drop policy if exists "Travelers can upload their own profile images" on storage.objects;
create policy "Travelers can upload their own profile images"
  on storage.objects
  for insert
  with check (
    bucket_id = 'traveler-profile-images'
    and auth.uid()::text = split_part(name, '/', 1)
  );

drop policy if exists "Travelers can update their own profile images" on storage.objects;
create policy "Travelers can update their own profile images"
  on storage.objects
  for update
  using (
    bucket_id = 'traveler-profile-images'
    and auth.uid()::text = split_part(name, '/', 1)
  )
  with check (
    bucket_id = 'traveler-profile-images'
    and auth.uid()::text = split_part(name, '/', 1)
  );

drop policy if exists "Travelers can delete their own profile images" on storage.objects;
create policy "Travelers can delete their own profile images"
  on storage.objects
  for delete
  using (
    bucket_id = 'traveler-profile-images'
    and auth.uid()::text = split_part(name, '/', 1)
  );
