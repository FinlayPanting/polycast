-- Shows' and episodes' own descriptions from their feeds, cleaned of HTML and capped at about
-- 1,000 characters, for "Tell Mia what you're in the mood for" (PC-1016-07) and, later, the show
-- and episode pages (PC-1017-T1). Catalogue data only, nothing about learners.
alter table podcasts add column if not exists description text;
alter table episodes add column if not exists description text;
