-- The Lab (PC-1021-L1): every test run on the password-protected test page, with what it tried,
-- what came back, what it cost and which take Finlay picked, so tests can be compared later.
-- Server-only: no access for the app's key.
create table if not exists lab_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('voice', 'moment', 'room', 'script', 'plan')),
  title text not null default '',
  config jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  cost_usd numeric(10, 5) not null default 0,
  pick jsonb,
  note text,
  created_by text not null default 'finlay' check (created_by in ('finlay', 'claude')),
  created_at timestamptz not null default now()
);
create index if not exists lab_runs_recent on lab_runs (created_at desc);
alter table lab_runs enable row level security;
revoke all on lab_runs from anon, authenticated;
