-- "New episode of your show" nudges (PC-1013-08): at most one a week per learner.
-- The server sets this when it sends one; nudges only cover episodes published after it.
alter table profiles add column last_nudged_at timestamptz;
