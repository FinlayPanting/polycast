-- "Support this show" on show pages (board item PC-1018-09): the show's own support link from its
-- feed's <podcast:funding> tag (Patreon, Ko-fi, a membership page), shown as a quiet link that opens
-- in Safari. Public show information, read by the server like the rest of the podcasts row.
alter table podcasts add column if not exists funding_url text;
alter table podcasts add column if not exists funding_label text;
