-- READ ONLY: run as project owner in the Supabase SQL editor.
-- Returns schema/policy metadata only; never user records or credentials.
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relname in
 ('registrations','payments','live_match','match_history','gallery_photos','tournament_matches','tournament_admins'))
 or (n.nspname='storage' and c.relname in ('objects','buckets'))
order by 1,2;

select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where (schemaname='public' and tablename in
 ('registrations','payments','live_match','match_history','gallery_photos','tournament_matches','tournament_admins'))
 or (schemaname='storage' and tablename in ('objects','buckets'))
order by schemaname,tablename,policyname;

select table_schema,table_name,grantee,privilege_type
from information_schema.role_table_grants
where table_schema in ('public','storage') and grantee in ('anon','authenticated','PUBLIC')
order by table_schema,table_name,grantee,privilege_type;

-- SECURITY DEFINER functions can bypass RLS. Review their authorization checks too.
select n.nspname,p.proname,p.prosecdef as security_definer,p.proconfig,
       pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by p.proname;

select pg_get_functiondef('public.ph_tournament_admin()'::regprocedure) as admin_check;
select count(*) as enrolled_admin_count from public.tournament_admins;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='gallery-photos';
-- Review all returned public tables/functions, including unexpected legacy ones.
-- No policy should grant arbitrary authenticated users private reads/admin writes.
