alter table public.inquiries
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists operator_notification_email_sent_at timestamptz,
  add column if not exists reminder_email_sent_at timestamptz,
  add column if not exists pre_tour_email_sent_at timestamptz,
  add column if not exists review_request_email_sent_at timestamptz;

