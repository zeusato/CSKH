import fs from 'node:fs/promises';
const source=await fs.readFile('supabase/migrations/003_search_performance.sql','utf8');
let core=source.slice(source.indexOf('create or replace function'));
core=core.replace('public.search_tickets','private.search_shared_tickets').replace('security invoker','security definer').replace("set plan_cache_mode='force_custom_plan'","set plan_cache_mode='force_custom_plan' set jit='off'");
core=core.replace('begin\n',`begin
 -- This workspace intentionally has one shared CSKH pool. The definer is narrowly
 -- scoped to this read projection, and MUST check live membership before any read.
 -- No caller-supplied identity, query fragment, column name or table name is accepted.
 if not private.is_active_user() then return jsonb_build_object('items','[]'::jsonb,'hasMore',false,'nextCursor',null);end if;
`);
const wrapper=`
revoke all on function private.search_shared_tickets(text,text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,jsonb,int,timestamptz) from public,anon;
grant execute on function private.search_shared_tickets(text,text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,jsonb,int,timestamptz) to authenticated;
create or replace function public.search_tickets(
 p_query text default '',p_status text default null,p_category uuid default null,p_system uuid default null,p_department uuid default null,p_staff uuid default null,
 p_from timestamptz default null,p_to timestamptz default null,p_date_field text default 'received_at',p_sort text default 'received_at',p_cursor jsonb default null,p_limit int default 30,p_cutoff timestamptz default null
) returns jsonb language sql stable security invoker set search_path='' as $$
 select private.search_shared_tickets(p_query,p_status,p_category,p_system,p_department,p_staff,p_from,p_to,p_date_field,p_sort,p_cursor,p_limit,p_cutoff);
$$;
-- Remove the experimental derived projection; source tickets and RLS stay intact.
drop trigger sync_title_terms on public.tickets;
drop function private.sync_title_terms();
drop table private.ticket_title_terms;
`;
await fs.mkdir('docs/proposals',{recursive:true});await fs.writeFile('docs/proposals/gated-search.sql',core+wrapper);
