-- Counting where people drop off (board item PC-1012-09), without tracking anyone.
-- The only new data is how many phones opened Polycast for the first time each day: the app says
-- "first open" once per install and sends no identifier, so this is a plain daily counter.
-- Every later step (sign-up, language, first guided listen, free episode, Plus, coming back) is
-- counted from tables Polycast already keeps.
create table first_opens (
  day date primary key default (now() at time zone 'utc')::date,
  opens integer not null default 0
);
-- Written only by the server (service role); learners and visitors can't read or write it.
alter table first_opens enable row level security;
