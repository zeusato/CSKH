-- DBA: psql -X -v ON_ERROR_STOP=1 -f verify.sql. Run on both sides of the freeze.
-- Only aggregate counts and schema metadata. Keep the output with the private handoff.
\pset pager off
begin transaction isolation level repeatable read read only;
set local timezone to 'UTC';
set local search_path to pg_catalog;
select current_database(), current_setting('server_version') as postgres_version;
select extname, extversion, extnamespace::regnamespace from pg_extension order by 1;
select name, checksum from private.cskh_migrations order by name;
select schemaname, tablename, rowsecurity from pg_tables
where schemaname in ('public','private') order by 1,2;
select format('select %L as relation, count(*) as rows from %I.%I',
              schemaname||'.'||tablename,schemaname,tablename)
from pg_tables where schemaname in ('public','private')
or (schemaname='auth' and tablename in ('users','identities')) order by schemaname,tablename
\gexec
select table_schema,table_name,column_name,data_type,is_nullable,column_default,is_generated,
       generation_expression,is_identity from information_schema.columns
where table_schema in ('public','private') order by 1,2,ordinal_position;
select conrelid::regclass as relation,conname,pg_get_constraintdef(oid) as definition
from pg_constraint where connamespace in ('public'::regnamespace,'private'::regnamespace) order by (conrelid::regclass)::text,2,3;
select schemaname,tablename,indexname,indexdef from pg_indexes
where schemaname in ('public','private') order by 1,2,3;
select tgrelid::regclass as relation,tgname,tgenabled,pg_get_triggerdef(oid)
from pg_trigger where not tgisinternal and tgrelid in
(select oid from pg_class where relnamespace in ('public'::regnamespace,'private'::regnamespace)) order by 2,4;
select p.oid::regprocedure as routine,p.prosecdef as definer,p.proconfig,
       pg_get_userbyid(p.proowner) as owner,p.proacl,md5(pg_get_functiondef(p.oid)) as definition_hash
from pg_proc p where p.pronamespace in ('public'::regnamespace,'private'::regnamespace)
and p.prokind in ('f','p') order by (p.oid::regprocedure)::text;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies
where schemaname in ('public','private') or (schemaname='storage' and tablename='objects') order by 1,2,3;
select n.nspname,c.relname,c.relacl from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') and c.relkind in ('r','S') order by 1,2;
select table_schema,table_name,column_name,grantee,privilege_type from information_schema.column_privileges
where table_schema in ('public','private') and grantee in ('anon','authenticated') order by 1,2,3,4,5;
select format('select %L as sequence,last_value,is_called from %I.%I',schemaname||'.'||sequencename,schemaname,sequencename)
from pg_sequences where schemaname in ('public','private') order by schemaname,sequencename
\gexec
-- Restore may suppress FK triggers. Check every single-column application FK, including audit IDs.
select format('select %L as fk,count(*) as missing_parents from %s c left join %s p on c.%I=p.%I where c.%I is not null and p.%I is null',
 k.conrelid::regclass||'.'||k.conname,k.conrelid::regclass,k.confrelid::regclass,a.attname,b.attname,a.attname,b.attname)
from pg_constraint k join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1]
join pg_attribute b on b.attrelid=k.confrelid and b.attnum=k.confkey[1]
where k.contype='f' and k.connamespace in ('public'::regnamespace,'private'::regnamespace)
and cardinality(k.conkey)=1 order by k.conname
\gexec
select role,active,care_log_access,call_log_access,chat_access,count(*) from public.app_users group by 1,2,3,4,5 order by 1,2,3,4,5;
select key,enabled from public.feature_flags order by key;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='ticket-images';
select count(*) objects from storage.objects where bucket_id='ticket-images';
with refs as (select path from public.ticket_attachments where state='ready' union select path from public.library_attachments)
select count(*) missing_object_metadata from refs where not exists
(select 1 from storage.objects o where o.bucket_id='ticket-images' and o.name=refs.path);
select state,count(*) from public.ticket_attachments group by state order by state;
select count(*) pending_gc from private.storage_gc_jobs;
-- No cron command, Vault secret or encrypted Auth data is printed.
select to_regclass('cron.job') is not null as has_cron \gset
\if :has_cron
select jobname,schedule,active from cron.job where jobname='cskh-storage-cleanup';
\endif
commit;
