-- Public bucket for guide audio. Guide clips are shared by every learner of an episode, contain no
-- personal data, and are written only by the server.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('guide-audio', 'guide-audio', true)
    on conflict (id) do nothing;
  end if;
end $$;
