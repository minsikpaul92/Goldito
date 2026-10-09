-- 011f: more than one daily report per pet, sitter and day (feedback FB-22, 2026-10-09).
--
-- Before: unique (pet_id, report_date, sitter_id) — once the evening note was sent, nothing more could go out that
-- day. Now: any number of SENT reports a day, still at most ONE DRAFT per pet, sitter and day (the backend keeps
-- rewriting that draft until the sitter sends it). send_daily_report (009) is unchanged: it sends one draft by id.

alter table public.daily_reports drop constraint if exists daily_reports_pet_id_report_date_sitter_id_key;

create unique index if not exists daily_reports_one_draft_per_day
  on public.daily_reports (pet_id, report_date, sitter_id)
  where status = 'draft';

-- The owner's Diary and the sitter's history read a day's reports in send order.
create index if not exists daily_reports_pet_day_sent_idx
  on public.daily_reports (pet_id, report_date, sent_at);
