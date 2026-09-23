-- READ ONLY. Run as project owner in Supabase SQL editor BEFORE enabling tournaments.
-- Public REST metadata does not reveal RLS definitions or all SQL constraints.
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name in ('live_match','match_history','tournament_matches','tournament_admins')
order by table_name,ordinal_position;

select c.relname,c.relrowsecurity,c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('live_match','match_history','tournament_matches','tournament_admins');

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where schemaname='public' and tablename in ('live_match','match_history','tournament_matches','tournament_admins')
order by tablename,policyname;

select grantee,table_name,privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name in ('live_match','match_history','tournament_matches','tournament_admins')
and grantee in ('anon','authenticated','PUBLIC')
order by table_name,grantee,privilege_type;

-- Review every existing anon/PUBLIC write policy, and authenticated policies that
-- admit arbitrary signed-up users. A UI login check is not a server-side admin role.
-- Do not blindly replace existing registration/payment policies with tournament rules.
-- Tournament tables must be SELECT-only to anon/authenticated; mutation RPCs check
-- tournament_admins. live_match and match_history writes should likewise be admin-only.
