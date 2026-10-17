-- The free guide is one episode a week, counted by the week the guide was first switched on for
-- each episode. Counting by when the listen started let an episode opened without the guide in an
-- earlier week get it later without counting (PC-1016-01).
alter table listens add column if not exists guided_at timestamptz;
update listens set guided_at = started_at where guided and guided_at is null;
