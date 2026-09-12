create or replace function private.search_shared_tickets(
 p_query text default '', p_status text default null, p_category uuid default null, p_system uuid default null,
 p_department uuid default null,p_staff uuid default null,p_from timestamptz default null,p_to timestamptz default null,
 p_date_field text default 'received_at',p_sort text default 'received_at',p_cursor jsonb default null,p_limit int default 30,p_cutoff timestamptz default null
) returns jsonb language plpgsql stable security definer set search_path='' set plan_cache_mode='force_custom_plan' set jit='off' as $$
declare q text:=trim(private.normalize_text(left(p_query,240)));tsq tsquery;condition text:='true';ranking text:='0';ordering text;date_column text;statement text;result jsonb;token_hits boolean;size int:=least(greatest(p_limit,1),1000);
begin
 -- This workspace intentionally has one shared CSKH pool. The definer is narrowly
 -- scoped to this read projection, and MUST check live membership before any read.
 -- No caller-supplied identity, query fragment, column name or table name is accepted.
 if not private.is_active_user() then return jsonb_build_object('items','[]'::jsonb,'hasMore',false,'nextCursor',null);end if;
 ordering:=case p_sort when 'created_at' then 't.created_at' when 'completed_at' then 'coalesce(t.completed_at,t.received_at)' else 't.received_at' end;
 date_column:=case p_date_field when 'created_at' then 't.created_at' when 'completed_at' then 't.completed_at' else 't.received_at' end;
 if p_status is not null then condition:=condition||format(' and t.status=%L',p_status);end if;
 if p_category is not null then condition:=condition||format(' and t.category_id=%L::uuid',p_category);end if;
 if p_system is not null then condition:=condition||format(' and t.system_id=%L::uuid',p_system);end if;
 if p_department is not null then condition:=condition||format(' and t.department_id=%L::uuid',p_department);end if;
 if p_staff is not null then condition:=condition||format(' and t.staff_id=%L::uuid',p_staff);end if;
 if p_from is not null then condition:=condition||format(' and %s>=%L::timestamptz',date_column,p_from);end if;
 if p_to is not null then condition:=condition||format(' and %s<%L::timestamptz',date_column,p_to);end if;
 if p_cutoff is not null then condition:=condition||format(' and t.created_at<=%L::timestamptz',p_cutoff);end if;
 if q<>'' then
  select to_tsquery('simple',string_agg(quote_literal(word)||':*',' & ')) into tsq from regexp_split_to_table(regexp_replace(q,'[^[:alnum:] ]',' ','g'),'\s+') word where word<>'';
  execute 'select exists(select 1 from public.tickets t where '||condition||' and t.search_vector@@$1 limit 1)' into token_hits using tsq;
  if token_hits then condition:=condition||format(' and t.search_vector@@%L::tsquery',tsq);
  elsif length(q)>=3 then condition:=condition||format(' and t.search_text like %L','%'||replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_')||'%');
  else condition:=condition||' and false';end if;
  ranking:=format('case when lower(t.code)=%L then 100 when t.title_search like %L then 30 else 10 end',q,'%'||replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_')||'%');
 end if;
 if p_cursor is not null then condition:=condition||format(' and (%s,%s,t.id)<(%L::int,%L::timestamptz,%L::uuid)',ranking,ordering,p_cursor->>'rank',p_cursor->>'date',p_cursor->>'id');end if;
 statement:=format($query$
 with page as materialized (
  select t.id,%s rank,%s order_at from public.tickets t where %s order by rank desc,order_at desc,t.id desc limit %s
 ), visible as materialized (select * from page order by rank desc,order_at desc,id desc limit %s),
 rows as (
  select t.id,t.code,t.title,left(t.description,240) description_excerpt,left(t.resolution,320) resolution_excerpt,t.status,t.received_at,t.created_at,t.completed_at,t.updated_at,t.version,
   t.category_id,t.system_id,t.department_id,t.staff_id,c.name category_name,s.name system_name,d.name department_name,st.name staff_name,v.rank,v.order_at
  from visible v join public.tickets t on t.id=v.id left join public.categories c on c.id=t.category_id left join public.systems s on s.id=t.system_id
  left join public.departments d on d.id=t.department_id left join public.staff st on st.id=t.staff_id
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r)-'rank'-'order_at' order by rank desc,order_at desc,id desc) from rows r),'[]'::jsonb),
 'hasMore',(select count(*) from page)>%s,'nextCursor',(select jsonb_build_object('rank',rank,'date',order_at,'id',id) from visible order by rank,order_at,id limit 1))
 $query$,ranking,ordering,condition,size+1,size,size);
 execute statement into result;return result;
end; $$;

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
