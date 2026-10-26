-- 'Tell Finlay' (PC-1025-05): short notes from You, with the screen, app version and language, and
-- optionally a screenshot kept in the private 'feedback' storage bucket. Notes and their screenshots
-- are deleted after 90 days, and with the learner's account. Read them in Table Editor → feedback;
-- screenshots are in Storage → feedback under the same id.
-- Numbered 0017 because 0013 to 0016 belong to branches still waiting on their migrations.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  screen text,
  app_version text,
  language text,
  screenshot_path text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_recent on feedback (created_at desc);
alter table feedback enable row level security;
revoke all on feedback from anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('feedback', 'feedback', false)
    on conflict (id) do nothing;
  end if;
end $$;
