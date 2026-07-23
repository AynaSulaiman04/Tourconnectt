create table if not exists public.wipay_payments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  provider text not null default 'wipay' check (provider in ('wipay')),
  order_id text not null unique,
  transaction_id text,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'error', 'cancelled', 'refunded')),
  amount numeric(12,2) not null,
  currency text not null default 'TTD',
  country_code text not null default 'TT',
  checkout_url text,
  response_payload jsonb,
  webhook_payload jsonb,
  paid_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint wipay_payments_order_id_length_check check (char_length(trim(order_id)) > 0)
);

create index if not exists wipay_payments_inquiry_id_idx
  on public.wipay_payments (inquiry_id, created_at desc);

create index if not exists wipay_payments_order_id_idx
  on public.wipay_payments (order_id);

create index if not exists wipay_payments_status_idx
  on public.wipay_payments (status, created_at desc);

create or replace function public.set_wipay_payments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists wipay_payments_set_updated_at on public.wipay_payments;
create trigger wipay_payments_set_updated_at
  before update on public.wipay_payments
  for each row execute function public.set_wipay_payments_updated_at();

alter table public.wipay_payments enable row level security;

drop policy if exists "WiPay payments are readable by owners and staff" on public.wipay_payments;
create policy "WiPay payments are readable by owners and staff"
  on public.wipay_payments
  for select
  using (
    exists (
      select 1
      from public.inquiries as inquiry
      where inquiry.id = wipay_payments.inquiry_id
        and (
          inquiry.user_id = auth.uid()
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role in ('operator', 'admin')
          )
        )
    )
  );

drop policy if exists "WiPay payments are insertable by owners and staff" on public.wipay_payments;
create policy "WiPay payments are insertable by owners and staff"
  on public.wipay_payments
  for insert
  with check (
    exists (
      select 1
      from public.inquiries as inquiry
      where inquiry.id = wipay_payments.inquiry_id
        and (
          inquiry.user_id = auth.uid()
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role in ('operator', 'admin')
          )
        )
    )
  );

drop policy if exists "WiPay payments are editable by owners and staff" on public.wipay_payments;
create policy "WiPay payments are editable by owners and staff"
  on public.wipay_payments
  for update
  using (
    exists (
      select 1
      from public.inquiries as inquiry
      where inquiry.id = wipay_payments.inquiry_id
        and (
          inquiry.user_id = auth.uid()
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
      from public.inquiries as inquiry
      where inquiry.id = wipay_payments.inquiry_id
        and (
          inquiry.user_id = auth.uid()
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role in ('operator', 'admin')
          )
        )
    )
  );

drop policy if exists "WiPay payments are deletable by owners and staff" on public.wipay_payments;
create policy "WiPay payments are deletable by owners and staff"
  on public.wipay_payments
  for delete
  using (
    exists (
      select 1
      from public.inquiries as inquiry
      where inquiry.id = wipay_payments.inquiry_id
        and (
          inquiry.user_id = auth.uid()
          or exists (
            select 1
            from public.profiles as profile
            where profile.id = auth.uid()
              and profile.role in ('operator', 'admin')
          )
        )
    )
  );
