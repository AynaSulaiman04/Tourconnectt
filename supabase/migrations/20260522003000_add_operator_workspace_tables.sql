alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists status_reason text,
  add column if not exists last_seen_at timestamptz;

create table if not exists public.operator_settings (
  id uuid primary key references public.profiles (id) on delete cascade,
  response_cadence text not null default 'fast_turnaround' check (response_cadence in ('fast_turnaround', 'same_day', 'daily')),
  booking_workflow text not null default 'inquiry_first' check (booking_workflow in ('inquiry_first', 'review_then_confirm', 'manual_hold')),
  customer_records text not null default 'documented' check (customer_records in ('documented', 'concierge_notes', 'shared_vault')),
  communication_mode text not null default 'email_whatsapp' check (communication_mode in ('email', 'whatsapp', 'email_whatsapp')),
  inquiry_received_enabled boolean not null default true,
  booking_approved_enabled boolean not null default true,
  guest_message_enabled boolean not null default true,
  customer_note_enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.operator_documents (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles (id) on delete cascade,
  inquiry_id uuid references public.inquiries (id) on delete set null,
  guest_name text not null,
  document_type text not null,
  file_name text not null,
  file_path text not null unique,
  file_url text not null,
  mime_type text not null,
  status text not null default 'pending' check (status in ('pending', 'shared', 'complete', 'sensitive', 'archived')),
  notes text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists operator_documents_operator_id_created_at_idx
  on public.operator_documents (operator_id, created_at desc);

create index if not exists operator_documents_inquiry_id_created_at_idx
  on public.operator_documents (inquiry_id, created_at desc);

create or replace function public.set_operator_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.set_operator_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_operator_profile_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'operator' then
    insert into public.operator_settings (id)
    values (new.id)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists operator_settings_set_updated_at on public.operator_settings;
create trigger operator_settings_set_updated_at
  before update on public.operator_settings
  for each row execute function public.set_operator_settings_updated_at();

drop trigger if exists operator_documents_set_updated_at on public.operator_documents;
create trigger operator_documents_set_updated_at
  before update on public.operator_documents
  for each row execute function public.set_operator_documents_updated_at();

drop trigger if exists profiles_operator_settings on public.profiles;
create trigger profiles_operator_settings
  after insert or update of role on public.profiles
  for each row execute function public.handle_operator_profile_settings();

insert into public.operator_settings (id)
select id
from public.profiles
where role = 'operator'
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'operator-documents',
  'operator-documents',
  true,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
