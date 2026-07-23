alter table public.inquiries
  add column if not exists payment_amount numeric(12,2);

comment on column public.inquiries.payment_amount is 'Quoted or payable amount for this inquiry. WiPay falls back to the listing price when this is null.';
