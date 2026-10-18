-- Shared translations of show and episode titles and descriptions (PC-1017-T1). Made once on the
-- server and shared by every learner: keyed by a hash of the original text and the language it's
-- read in. Catalogue data only, nothing about learners. Server-only: no access for the app's key.
create table if not exists translations (
  hash text not null,
  reading_language text not null,
  translation text not null,
  created_at timestamptz not null default now(),
  primary key (hash, reading_language)
);
alter table translations enable row level security;
revoke all on translations from anon, authenticated;
