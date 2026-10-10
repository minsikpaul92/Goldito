-- Phase 07C (7C.5): what a client may read of a Pet Life Record.
--
-- The record's `source_snapshot` (the raw check-ins, notes and the owner's questions it was written from) is for the
-- backend and for tracing a wrong sentence — a sitter who is only asked about the pet must see the summary, not the
-- previous stay's raw data. Clients read named columns only; the stay's dates are now their own columns.

alter table public.pet_life_records
  add column stay_from date,
  add column stay_to date;

revoke select on public.pet_life_records from authenticated;
grant select (id, pet_id, booking_id, sitter_id, summary, body, model, stay_from, stay_to, created_at)
  on public.pet_life_records to authenticated;

notify pgrst, 'reload schema';
