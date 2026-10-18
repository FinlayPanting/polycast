-- "Use your own API keys" (PC-1017-K1): a learner's episode preparation can run on their own
-- ElevenLabs and Google keys instead of Polycast's, with no hours allowance.
-- 1) A new kind of charge for those jobs.
alter table prep_jobs drop constraint if exists prep_jobs_charge_check;
alter table prep_jobs add constraint prep_jobs_charge_check check (charge in ('none', 'freeEpisode', 'plus', 'ownKeys'));
-- 2) The keys, encrypted by the server (AES-256-GCM, OWN_KEYS_SECRET), held only while that job
--    runs so a resumed job still works, and deleted when it ends or the learner removes their keys.
--    Server-only: no access for the app's key.
create table if not exists job_keys (
  job_id uuid primary key references prep_jobs (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  elevenlabs text not null,
  gemini text not null,
  created_at timestamptz not null default now()
);
create index if not exists job_keys_user on job_keys (user_id);
alter table job_keys enable row level security;
revoke all on job_keys from anon, authenticated;
