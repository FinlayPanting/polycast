-- PC-1028-01: the phone's time zone (an IANA name such as 'America/New_York'), saved with the push token,
-- so nudges arrive in the learner's own daytime rather than Europe's. Null until the app sends it.
alter table profiles add column if not exists time_zone text check (time_zone is null or length(time_zone) between 1 and 64);
grant update (time_zone) on profiles to authenticated;
