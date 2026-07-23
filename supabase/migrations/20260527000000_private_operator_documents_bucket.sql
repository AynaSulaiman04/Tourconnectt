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

create or replace function public.set_operator_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists operator_documents_set_updated_at on public.operator_documents;
create trigger operator_documents_set_updated_at
  before update on public.operator_documents
  for each row execute function public.set_operator_documents_updated_at();

alter table public.operator_documents enable row level security;

drop policy if exists "Operator documents are readable by owner" on public.operator_documents;
create policy "Operator documents are readable by owner"
  on public.operator_documents
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

drop policy if exists "Operator documents are insertable by owner" on public.operator_documents;
create policy "Operator documents are insertable by owner"
  on public.operator_documents
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

drop policy if exists "Operator documents are editable by owner" on public.operator_documents;
create policy "Operator documents are editable by owner"
  on public.operator_documents
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

drop policy if exists "Operator documents are deletable by owner" on public.operator_documents;
create policy "Operator documents are deletable by owner"
  on public.operator_documents
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'operator-documents',
  'operator-documents',
  false,
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
