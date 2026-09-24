-- M0: extensions only. Tables arrive with their RLS policies in the milestone that needs them.

-- Geography queries for nearby_venues / check-in distance checks (M2).
create extension if not exists postgis with schema extensions;

-- Scheduled cleanup jobs (M3+).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
