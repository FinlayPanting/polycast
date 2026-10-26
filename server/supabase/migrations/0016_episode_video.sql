-- Whether an episode's file is a video, as the feed declares it (PC-1025-01). Null for episodes read before
-- this column existed; the server then falls back to the address's extension until the feed is next read.
-- Numbered 0016 because 0013 to 0015 belong to branches still waiting on their migrations.
alter table episodes add column if not exists video boolean;
