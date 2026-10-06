-- Application follow-up: automatic "No response" after 30 days, and
-- "Listing closed" when a job disappears before the user applied.
alter type public.application_status add value if not exists 'no_response';
alter type public.application_status add value if not exists 'closed';

alter table public.applications
  add column if not exists auto_closed_at timestamptz,
  add column if not exists auto_closed_reason text;
