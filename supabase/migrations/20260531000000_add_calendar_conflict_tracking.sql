alter table public.inquiries
  add column if not exists calendar_conflict_status text,
  add column if not exists calendar_last_checked_at timestamptz;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'inquiries_calendar_sync_status_check'
      and conrelid = 'public.inquiries'::regclass
  ) then
    alter table public.inquiries drop constraint inquiries_calendar_sync_status_check;
  end if;
end;
$$;

alter table public.inquiries
  add constraint inquiries_calendar_sync_status_check
  check (
    calendar_sync_status is null
    or calendar_sync_status in (
      'synced',
      'failed',
      'skipped',
      'conflict',
      'deleted',
      'manual_review',
      'external_deleted',
      'external_updated'
    )
  );

create index if not exists inquiries_calendar_sync_status_idx
  on public.inquiries (operator_id, calendar_sync_status, calendar_last_checked_at desc);

create index if not exists inquiries_calendar_conflict_status_idx
  on public.inquiries (operator_id, calendar_conflict_status, calendar_last_checked_at desc);

