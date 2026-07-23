create table if not exists public.concierge_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.concierge_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.concierge_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  sources jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.concierge_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  title text not null,
  content text not null,
  url text,
  metadata jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists concierge_conversations_user_id_idx
  on public.concierge_conversations (user_id, updated_at desc);

create index if not exists concierge_messages_conversation_id_idx
  on public.concierge_messages (conversation_id, created_at asc);

create index if not exists concierge_knowledge_sources_source_type_idx
  on public.concierge_knowledge_sources (source_type, is_active, updated_at desc);

create index if not exists concierge_knowledge_sources_is_active_idx
  on public.concierge_knowledge_sources (is_active, updated_at desc);

create or replace function public.set_concierge_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.set_concierge_knowledge_sources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.touch_concierge_conversation_on_message_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.concierge_conversations
    set updated_at = timezone('utc', now())
    where id = coalesce(new.conversation_id, old.conversation_id);

  return null;
end;
$$;

alter table public.concierge_conversations enable row level security;
alter table public.concierge_messages enable row level security;
alter table public.concierge_knowledge_sources enable row level security;

drop policy if exists "Concierge conversations are readable by owners and staff" on public.concierge_conversations;
create policy "Concierge conversations are readable by owners and staff"
  on public.concierge_conversations
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

drop policy if exists "Concierge conversations are insertable by authenticated users" on public.concierge_conversations;
create policy "Concierge conversations are insertable by authenticated users"
  on public.concierge_conversations
  for insert
  with check (
    auth.uid() = user_id
  );

drop policy if exists "Concierge conversations are editable by owners and staff" on public.concierge_conversations;
create policy "Concierge conversations are editable by owners and staff"
  on public.concierge_conversations
  for update
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role in ('operator', 'admin')
    )
  )
  with check (
    auth.uid() = user_id
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role in ('operator', 'admin')
    )
  );

drop policy if exists "Concierge conversations are deletable by owners and staff" on public.concierge_conversations;
create policy "Concierge conversations are deletable by owners and staff"
  on public.concierge_conversations
  for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role in ('operator', 'admin')
    )
  );

drop policy if exists "Concierge messages are readable by conversation owners and staff" on public.concierge_messages;
create policy "Concierge messages are readable by conversation owners and staff"
  on public.concierge_messages
  for select
  using (
    exists (
      select 1
      from public.concierge_conversations as conversation
      where conversation.id = conversation_id
        and (
          conversation.user_id = auth.uid()
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role in ('operator', 'admin')
          )
        )
    )
  );

drop policy if exists "Concierge messages are insertable by conversation owners and staff" on public.concierge_messages;
create policy "Concierge messages are insertable by conversation owners and staff"
  on public.concierge_messages
  for insert
  with check (
    exists (
      select 1
      from public.concierge_conversations as conversation
      where conversation.id = conversation_id
        and (
          conversation.user_id = auth.uid()
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role in ('operator', 'admin')
          )
        )
    )
  );

drop policy if exists "Concierge messages are editable by staff" on public.concierge_messages;
create policy "Concierge messages are editable by staff"
  on public.concierge_messages
  for update
  using (
    exists (
      select 1
      from public.concierge_conversations as conversation
      where conversation.id = conversation_id
        and (
          conversation.user_id = auth.uid()
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role in ('operator', 'admin')
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.concierge_conversations as conversation
      where conversation.id = conversation_id
        and (
          conversation.user_id = auth.uid()
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role in ('operator', 'admin')
          )
        )
    )
  );

drop policy if exists "Concierge messages are deletable by staff" on public.concierge_messages;
create policy "Concierge messages are deletable by staff"
  on public.concierge_messages
  for delete
  using (
    exists (
      select 1
      from public.concierge_conversations as conversation
      where conversation.id = conversation_id
        and (
          conversation.user_id = auth.uid()
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role in ('operator', 'admin')
          )
        )
    )
  );

drop policy if exists "Concierge knowledge sources are publicly readable when active" on public.concierge_knowledge_sources;
create policy "Concierge knowledge sources are publicly readable when active"
  on public.concierge_knowledge_sources
  for select
  using (is_active = true);

drop policy if exists "Concierge knowledge sources are manageable by admins" on public.concierge_knowledge_sources;
create policy "Concierge knowledge sources are manageable by admins"
  on public.concierge_knowledge_sources
  for all
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop trigger if exists concierge_conversations_set_updated_at on public.concierge_conversations;
create trigger concierge_conversations_set_updated_at
  before update on public.concierge_conversations
  for each row execute function public.set_concierge_conversations_updated_at();

drop trigger if exists concierge_knowledge_sources_set_updated_at on public.concierge_knowledge_sources;
create trigger concierge_knowledge_sources_set_updated_at
  before update on public.concierge_knowledge_sources
  for each row execute function public.set_concierge_knowledge_sources_updated_at();

drop trigger if exists concierge_messages_touch_conversation on public.concierge_messages;
create trigger concierge_messages_touch_conversation
  after insert or update or delete on public.concierge_messages
  for each row execute function public.touch_concierge_conversation_on_message_change();
