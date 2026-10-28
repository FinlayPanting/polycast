-- PC-1027-04: when the one-time first-listen nudge (PC-1026-09) went out, so the Monday funnel can
-- count how many got it and how many started a guided listen within two days. Counts only leave the
-- database. last_nudged_at can't tell this: the weekly new-episode nudges overwrite it.
alter table profiles add column first_listen_nudged_at timestamptz;

-- PC-1027-02: the first-listen nudge looks up each learner's own preparation requests; without this
-- it reads the whole jobs table for every learner.
create index if not exists prep_jobs_requested_by on prep_jobs (requested_by, created_at desc);
