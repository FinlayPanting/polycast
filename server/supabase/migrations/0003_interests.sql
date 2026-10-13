-- Interests a learner picks at onboarding or on the You tab (ids from packages/core/src/interests.ts,
-- "sport" or "sport/f1" for a narrowing chip). Discover leads with shows that match.
alter table profiles add column interests text[] not null default '{}';
grant update (interests) on profiles to authenticated;
