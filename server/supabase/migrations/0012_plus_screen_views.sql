-- Who sees the Plus screen (board item PC-1018-08), without tracking anyone.
-- A plain daily counter like first_opens: how many times the Plus screen was opened, and how many
-- of those closed without buying or restoring. The app sends no identifier with either.
create table if not exists plus_screen_views (
  day date primary key default (now() at time zone 'utc')::date,
  opens integer not null default 0,
  left_without_buying integer not null default 0
);
-- Written only by the server (service role); learners and visitors can't read or write it.
alter table plus_screen_views enable row level security;
revoke all on plus_screen_views from anon, authenticated;
