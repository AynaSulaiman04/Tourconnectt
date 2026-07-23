alter table public.traveler_operator_conversations
  alter column traveler_id drop not null;

comment on column public.traveler_operator_conversations.traveler_id is
  'The traveler profile when the inquiry was submitted by a signed-in traveler; null for guest inquiries.';
