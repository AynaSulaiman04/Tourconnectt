create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  title text not null,
  body text not null,
  href text,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.platform_notifications
  add column if not exists recipient_profile_id uuid,
  add column if not exists actor_profile_id uuid,
  add column if not exists kind text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists href text,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists metadata jsonb,
  add column if not exists read_at timestamptz,
  add column if not exists created_at timestamptz;

update public.platform_notifications
set metadata = coalesce(metadata, '{}'::jsonb);

alter table public.platform_notifications
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

alter table public.platform_notifications
  alter column created_at set default timezone('utc', now());

alter table public.platform_notifications
  alter column recipient_profile_id set not null,
  alter column kind set not null,
  alter column title set not null,
  alter column body set not null,
  alter column created_at set not null;

create index if not exists platform_notifications_recipient_created_at_idx
  on public.platform_notifications (recipient_profile_id, created_at desc);

create index if not exists platform_notifications_recipient_read_at_idx
  on public.platform_notifications (recipient_profile_id, read_at, created_at desc);

alter table public.platform_notifications enable row level security;

drop policy if exists "Platform notifications are readable by recipients" on public.platform_notifications;
create policy "Platform notifications are readable by recipients"
  on public.platform_notifications
  for select
  using (
    recipient_profile_id = auth.uid()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Platform notifications are editable by recipients" on public.platform_notifications;
create policy "Platform notifications are editable by recipients"
  on public.platform_notifications
  for update
  using (
    recipient_profile_id = auth.uid()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  )
  with check (
    recipient_profile_id = auth.uid()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.platform_notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;
