-- "Learning something else?" in the language picker (board item PC-1023-02), without tracking anyone.
-- A plain daily counter per language, like first_opens: how many times someone tapped a language
-- Polycast doesn't offer yet. The app sends only the language's code, with no identifier.
create table if not exists language_requests (
  day date not null default (now() at time zone 'utc')::date,
  language text not null check (language ~ '^[a-z]{2}$|^other$'),
  requests integer not null default 0,
  primary key (day, language)
);
-- Written only by the server (service role); learners and visitors can't read or write it.
alter table language_requests enable row level security;
revoke all on language_requests from anon, authenticated;
