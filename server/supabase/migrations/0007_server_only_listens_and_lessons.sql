-- Learners reach listening history and lessons only through the server, which checks the guide
-- allowance. With the app's public key, a learner could insert a 'guided' listen for any episode,
-- delete this week's row to reset the one-a-week guide, or read any lesson plan and transcript
-- directly (0001_init.sql). The app only ever reads its own listens and updates position and
-- finish time, so that is all it keeps.
revoke insert, delete, update on listens from authenticated;
grant update (position_sec, updated_at, finished_at) on listens to authenticated;

drop policy if exists "read transcripts" on transcripts;
drop policy if exists "read lesson plans" on lesson_plans;
revoke select on transcripts, lesson_plans from authenticated;
