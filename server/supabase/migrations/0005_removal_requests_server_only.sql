-- Removal requests now arrive only through the server's POST /removal-requests, which caps field
-- lengths and rate-limits each address. Stop anyone writing to the table directly with the app's
-- public key (0001_init.sql let anon and authenticated insert).
drop policy if exists "submit removal" on removal_requests;
revoke insert on removal_requests from anon, authenticated;
