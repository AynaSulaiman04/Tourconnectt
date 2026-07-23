create table if not exists public.traveler_operator_conversations (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.profiles (id) on delete cascade,
  operator_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.tour_listings (id) on delete set null,
  inquiry_id uuid references public.inquiries (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.traveler_operator_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.traveler_operator_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  sender_role text not null check (sender_role in ('traveler', 'operator')),
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists traveler_operator_conversations_traveler_id_idx
  on public.traveler_operator_conversations (traveler_id, updated_at desc);

create index if not exists traveler_operator_conversations_operator_id_idx
  on public.traveler_operator_conversations (operator_id, updated_at desc);

create index if not exists traveler_operator_conversations_listing_id_idx
  on public.traveler_operator_conversations (listing_id, updated_at desc);

create index if not exists traveler_operator_conversations_inquiry_id_idx
  on public.traveler_operator_conversations (inquiry_id, updated_at desc);

create index if not exists traveler_operator_messages_conversation_id_idx
  on public.traveler_operator_messages (conversation_id, created_at asc);

create index if not exists traveler_operator_messages_sender_id_idx
  on public.traveler_operator_messages (sender_id, created_at desc);

create index if not exists traveler_operator_messages_created_at_idx
  on public.traveler_operator_messages (created_at desc);

create or replace function public.set_traveler_operator_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.touch_traveler_operator_conversation_on_message_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_id_value uuid;
begin
  conversation_id_value := coalesce(new.conversation_id, old.conversation_id);

  if conversation_id_value is null then
    return null;
  end if;

  update public.traveler_operator_conversations
    set updated_at = timezone('utc', now()),
        last_message_at = case
          when tg_op = 'DELETE' then last_message_at
          else timezone('utc', now())
        end
    where id = conversation_id_value;

  return null;
end;
$$;

alter table public.traveler_operator_conversations enable row level security;
alter table public.traveler_operator_messages enable row level security;

drop policy if exists "Traveler operator conversations are readable by participants and staff" on public.traveler_operator_conversations;
create policy "Traveler operator conversations are readable by participants and staff"
  on public.traveler_operator_conversations
  for select
  using (
    auth.uid() = traveler_id
    or auth.uid() = operator_id
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Traveler operator conversations are insertable by traveler" on public.traveler_operator_conversations;
create policy "Traveler operator conversations are insertable by traveler"
  on public.traveler_operator_conversations
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

drop policy if exists "Traveler operator conversations are editable by participants and staff" on public.traveler_operator_conversations;
create policy "Traveler operator conversations are editable by participants and staff"
  on public.traveler_operator_conversations
  for update
  using (
    auth.uid() = traveler_id
    or auth.uid() = operator_id
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  )
  with check (
    auth.uid() = traveler_id
    or auth.uid() = operator_id
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Traveler operator conversations are deletable by staff" on public.traveler_operator_conversations;
create policy "Traveler operator conversations are deletable by staff"
  on public.traveler_operator_conversations
  for delete
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop policy if exists "Traveler operator messages are readable by participants and staff" on public.traveler_operator_messages;
create policy "Traveler operator messages are readable by participants and staff"
  on public.traveler_operator_messages
  for select
  using (
    exists (
      select 1
      from public.traveler_operator_conversations as conversation
      where conversation.id = conversation_id
        and (
          conversation.traveler_id = auth.uid()
          or conversation.operator_id = auth.uid()
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role = 'admin'
          )
        )
    )
  );

drop policy if exists "Traveler operator messages are insertable by participants and staff" on public.traveler_operator_messages;
create policy "Traveler operator messages are insertable by participants and staff"
  on public.traveler_operator_messages
  for insert
  with check (
    exists (
      select 1
      from public.traveler_operator_conversations as conversation
      where conversation.id = conversation_id
        and (
          (sender_role = 'traveler' and conversation.traveler_id = auth.uid() and sender_id = auth.uid())
          or (sender_role = 'operator' and conversation.operator_id = auth.uid() and sender_id = auth.uid())
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role = 'admin'
              and sender_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "Traveler operator messages are editable by staff" on public.traveler_operator_messages;
create policy "Traveler operator messages are editable by staff"
  on public.traveler_operator_messages
  for update
  using (
    exists (
      select 1
      from public.traveler_operator_conversations as conversation
      where conversation.id = conversation_id
        and (
          conversation.traveler_id = auth.uid()
          or conversation.operator_id = auth.uid()
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role = 'admin'
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.traveler_operator_conversations as conversation
      where conversation.id = conversation_id
        and (
          conversation.traveler_id = auth.uid()
          or conversation.operator_id = auth.uid()
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role = 'admin'
          )
        )
    )
  );

drop policy if exists "Traveler operator messages are deletable by staff" on public.traveler_operator_messages;
create policy "Traveler operator messages are deletable by staff"
  on public.traveler_operator_messages
  for delete
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

drop trigger if exists traveler_operator_conversations_set_updated_at on public.traveler_operator_conversations;
create trigger traveler_operator_conversations_set_updated_at
  before update on public.traveler_operator_conversations
  for each row execute function public.set_traveler_operator_conversations_updated_at();

drop trigger if exists traveler_operator_messages_touch_conversation on public.traveler_operator_messages;
create trigger traveler_operator_messages_touch_conversation
  after insert or update or delete on public.traveler_operator_messages
  for each row execute function public.touch_traveler_operator_conversation_on_message_change();
