alter table public.wipay_payments
  drop constraint if exists wipay_payments_status_check;

alter table public.wipay_payments
  add constraint wipay_payments_status_check
  check (status in ('pending', 'initiated', 'paid', 'completed', 'success', 'failed', 'error', 'cancelled', 'refunded'));

