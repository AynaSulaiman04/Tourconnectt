-- Guest Concierge access.
--
-- Signed-in Concierge requests are metered through hidden marker rows in
-- concierge_messages, which requires a profile id. Guests have no profile, so
-- they get their own ledger keyed by a salted hash of the client IP. Only the
-- hash is stored, never the address itself.

create table if not exists public.concierge_guest_requests (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists concierge_guest_requests_ip_hash_created_at_idx
  on public.concierge_guest_requests (ip_hash, created_at desc);

create index if not exists concierge_guest_requests_created_at_idx
  on public.concierge_guest_requests (created_at);

comment on table public.concierge_guest_requests is
  'Rate-limit ledger for unauthenticated Concierge AI requests. ip_hash is a salted SHA-256 digest; rows older than the daily window are pruned on read.';

-- The service role is the only writer. No client role may read or write this
-- ledger, so RLS is enabled with no permissive policy.
alter table public.concierge_guest_requests enable row level security;

revoke all on public.concierge_guest_requests from anon, authenticated;
