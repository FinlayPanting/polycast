-- Polycast schema. Runs on Supabase (auth schema, auth.uid(), anon/authenticated/service_role roles).
-- Learners read the catalogue and their own rows; every write that touches money or allowances
-- goes through the Polycast server, which connects with the service role.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- settings
create table settings (
  key text primary key,
  value jsonb not null
);
insert into settings (key, value) values
  ('free_cohort_size', '100'),
  ('daily_cap_usd', '10'),
  ('alert_email', '"finlaypanting@gmail.com"');

-- ---------------------------------------------------------------- learners
create sequence signup_rank_seq;

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  signup_rank bigint not null unique default nextval('signup_rank_seq'),
  native_language text not null default 'en',
  target_language text,
  guidance_level text not null default 'standard' check (guidance_level in ('light', 'standard', 'handsOn')),
  guide_id text not null default 'mia',
  flag_id text not null default 'polycast',
  subtitle_mode text not null default 'both' check (subtitle_mode in ('target', 'both', 'none')),
  -- Set only by the server:
  plan text not null default 'free' check (plan in ('free', 'plus')),
  free_episode_used boolean not null default false,
  plus_period_start timestamptz,
  plus_used_sec integer not null default 0
);

-- A profile for every new account, numbered in sign-up order for the free-episode cohort.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- catalogue
create table podcasts (
  id uuid primary key default gen_random_uuid(),
  apple_id text unique,
  feed_url text not null unique,
  title text not null,
  author text,
  artwork text,
  language text,
  -- A creator asked for removal (spec: honoured within 7 days).
  removed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table episodes (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references podcasts (id) on delete cascade,
  guid text not null,
  title text not null,
  published timestamptz,
  duration_sec integer not null,
  audio_url text not null,
  image text,
  language text not null,
  status text not null default 'none' check (status in ('none', 'preparing', 'ready', 'failed')),
  difficulty jsonb,
  ready_at timestamptz,
  unique (podcast_id, guid)
);
create index episodes_ready on episodes (language, ready_at desc) where status = 'ready';

create table transcripts (
  episode_id uuid primary key references episodes (id) on delete cascade,
  language text not null,
  native_language text not null,
  source text not null check (source in ('scribe', 'feed')),
  words jsonb not null,
  segments jsonb not null
);

-- One lesson plan per episode, voiced per guide (spec: The guide).
create table lesson_plans (
  episode_id uuid not null references episodes (id) on delete cascade,
  guide_id text not null,
  version integer not null default 1,
  plan jsonb not null,
  created_at timestamptz not null default now(),
  primary key (episode_id, guide_id)
);

-- ---------------------------------------------------------------- preparation and spending
create table prep_jobs (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes (id) on delete cascade,
  requested_by uuid references profiles (id) on delete set null,
  kind text not null default 'prepare' check (kind in ('prepare', 'voice')),
  guide_id text not null,
  charge text not null check (charge in ('none', 'freeEpisode', 'plus')),
  charged_sec integer not null default 0,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  stage text,
  attempts integer not null default 0,
  error text,
  cost_usd numeric(10, 4),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index prep_jobs_queue on prep_jobs (created_at) where status = 'queued';
create unique index one_active_job_per_episode_guide on prep_jobs (episode_id, guide_id, kind) where status in ('queued', 'running');

create table spend_ledger (
  job_id text primary key,
  day date not null default (now() at time zone 'utc')::date,
  usd numeric(10, 4) not null
);
create index spend_ledger_day on spend_ledger (day);

-- ---------------------------------------------------------------- learning
create table saved_words (
  user_id uuid not null references profiles (id) on delete cascade,
  language text not null,
  lemma text not null,
  forms text[] not null default '{}',
  meaning text not null,
  episode_id uuid references episodes (id) on delete set null,
  clip jsonb not null,
  sentence text not null default '',
  review jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, language, lemma)
);

create table listens (
  user_id uuid not null references profiles (id) on delete cascade,
  episode_id uuid not null references episodes (id) on delete cascade,
  position_sec real not null default 0,
  guided boolean not null default false,
  guidance_level text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (user_id, episode_id)
);
create index listens_recent on listens (episode_id, updated_at desc);

-- ---------------------------------------------------------------- discovery
create table picks (
  language text not null,
  podcast_id uuid not null references podcasts (id) on delete cascade,
  position integer not null,
  primary key (language, podcast_id)
);

create table chart_cache (
  language text not null,
  chart text not null, -- 'top' or 'category:<name>'
  fetched_at timestamptz not null default now(),
  items jsonb not null,
  primary key (language, chart)
);

create table removal_requests (
  id uuid primary key default gen_random_uuid(),
  podcast_title text not null,
  contact text not null,
  message text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

-- Listener favourites: most-listened episodes per language over the last 30 days.
create view listener_favourites as
  select e.language, e.id as episode_id, count(*) as listeners
  from listens l join episodes e on e.id = l.episode_id
  where l.updated_at > now() - interval '30 days' and e.status = 'ready'
  group by e.language, e.id;

-- ---------------------------------------------------------------- row-level security
alter table settings enable row level security;
alter table profiles enable row level security;
alter table podcasts enable row level security;
alter table episodes enable row level security;
alter table transcripts enable row level security;
alter table lesson_plans enable row level security;
alter table prep_jobs enable row level security;
alter table spend_ledger enable row level security;
alter table saved_words enable row level security;
alter table listens enable row level security;
alter table picks enable row level security;
alter table chart_cache enable row level security;
alter table removal_requests enable row level security;

-- Own profile: read it, and change only the learner's own preferences.
create policy "read own profile" on profiles for select to authenticated using (id = auth.uid());
create policy "update own profile" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from authenticated;
grant update (native_language, target_language, guidance_level, guide_id, flag_id, subtitle_mode) on profiles to authenticated;
grant select on profiles to authenticated;

-- The catalogue is readable by any signed-in learner, minus shows removed at a creator's request.
create policy "read podcasts" on podcasts for select to authenticated using (not removed);
create policy "read episodes" on episodes for select to authenticated
  using (exists (select 1 from podcasts p where p.id = podcast_id and not p.removed));
create policy "read transcripts" on transcripts for select to authenticated
  using (exists (select 1 from episodes e join podcasts p on p.id = e.podcast_id where e.id = episode_id and not p.removed));
create policy "read lesson plans" on lesson_plans for select to authenticated
  using (exists (select 1 from episodes e join podcasts p on p.id = e.podcast_id where e.id = episode_id and not p.removed));
create policy "read picks" on picks for select to authenticated using (true);
create policy "read charts" on chart_cache for select to authenticated using (true);
grant select on podcasts, episodes, transcripts, lesson_plans, picks, chart_cache, listener_favourites to authenticated;

-- Own jobs, to follow preparation progress.
create policy "read own jobs" on prep_jobs for select to authenticated using (requested_by = auth.uid());
grant select on prep_jobs to authenticated;

-- Own word bank and listening history.
create policy "own words" on saved_words for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own listens" on listens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on saved_words, listens to authenticated;

-- Anyone, even signed out, can ask for a show's removal; nobody but the server can read the requests.
create policy "submit removal" on removal_requests for insert to anon, authenticated with check (true);
grant insert on removal_requests to anon, authenticated;

-- settings and spend_ledger: no policies, so only the server (service role) can touch them.

-- ---------------------------------------------------------------- notifications and alerts
alter table profiles add column push_token text;
grant update (push_token) on profiles to authenticated;

create table alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);
alter table alerts enable row level security;
