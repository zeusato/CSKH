-- Library entries are immutable snapshots of a source until explicitly edited.
-- Source UUIDs are provenance, deliberately NOT cascading foreign keys.
-- Images are immutable objects with independent owners in both attachment tables.
lock table public.tickets, public.ticket_attachments in share row exclusive mode;

create sequence public.library_number_seq;
create table public.library_entries (
 id uuid primary key default gen_random_uuid(),
 number bigint not null unique default nextval('public.library_number_seq'),
 code text generated always as ('TV-'||lpad(number::text,greatest(6,length(number::text)),'0')) stored,
 title text not null check(length(trim(title)) between 1 and 240),
 description text not null default '' check(length(description)<=100000),
 resolution text not null default '' check(length(resolution)<=100000),
 source_type text not null check(source_type in ('ticket','care_log')),
 source_id uuid not null, source_code text not null, source_version integer not null,
 source_received_at timestamptz, source_completed_at timestamptz,
 source_context jsonb not null default '{}'::jsonb,
 system_id uuid references public.systems(id) on delete set null,
 category_id uuid references public.categories(id) on delete set null,
 system_name text, category_name text,
 migrated boolean not null default false,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 version integer not null default 1, search_text text not null default '', search_vector tsvector,
 unique(source_type,source_id)
);
create index library_created_idx on public.library_entries(created_at desc,id desc);
create index library_source_idx on public.library_entries(source_type,created_at desc,id desc);
create index library_system_idx on public.library_entries(system_id);
create index library_category_idx on public.library_entries(category_id);
create index library_search_idx on public.library_entries using gin(search_vector);

create table public.library_attachments (
 id uuid primary key default gen_random_uuid(),
 entry_id uuid not null references public.library_entries(id) on delete cascade,
 name text not null, mime_type text not null, size bigint not null,
 path text not null, created_at timestamptz not null default now(),
 unique(entry_id,path)
);
create index library_attachment_path_idx on public.library_attachments(path);

create function private.can_read_library(p_source text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_active_user() and (p_source='ticket' or (p_source='care_log' and private.can_read_care_logs()));
$$;
create function private.can_write_library(p_source text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.can_write_workspace() and (p_source='ticket' or (p_source='care_log' and private.can_write_care_logs()));
$$;
revoke all on function private.can_read_library(text),private.can_write_library(text) from public,anon;
grant execute on function private.can_read_library(text),private.can_write_library(text) to authenticated,service_role;

alter table public.library_entries enable row level security;
create policy library_read on public.library_entries for select to authenticated using(private.can_read_library(source_type));
create policy library_update on public.library_entries for update to authenticated using(private.can_write_library(source_type)) with check(private.can_write_library(source_type));
create policy library_delete on public.library_entries for delete to authenticated using(private.can_write_library(source_type));
revoke all on public.library_entries from anon,authenticated;
grant select,delete on public.library_entries to authenticated;
grant update(title,description,resolution) on public.library_entries to authenticated;
grant all on public.library_entries to service_role;
grant usage on sequence public.library_number_seq to service_role;
alter table public.library_attachments enable row level security;
create policy library_image_read on public.library_attachments for select to authenticated using(
 exists(select 1 from public.library_entries e where e.id=entry_id)
);
revoke all on public.library_attachments from anon,authenticated;
grant select on public.library_attachments to authenticated;
grant all on public.library_attachments to service_role;

create function private.library_before_write() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  new.updated_by:=auth.uid();new.updated_at:=now();new.version:=old.version+1;
 end if;
 new.title:=trim(new.title);
 new.search_text:=private.normalize_text('TV-'||lpad(new.number::text,greatest(6,length(new.number::text)),'0')||' '||new.source_code||' '||new.title||' '||new.description||' '||new.resolution);
 new.search_vector:=to_tsvector('simple'::regconfig,new.search_text);
 return new;
end;$$;
create trigger library_before_write before insert or update on public.library_entries for each row execute function private.library_before_write();

create function public.save_to_library(p_source_type text,p_source_id uuid,p_source_version integer,p_title text,p_description text,p_resolution text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; t public.tickets; c public.care_logs; sys uuid; cat uuid;
 src_code text; src_version integer; received timestamptz; completed timestamptz; context jsonb;
begin
 if private.can_write_library(p_source_type) is not true then raise exception 'Không có quyền lưu nguồn này vào thư viện.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_source_type||':'||p_source_id::text,0));
 select id into result from public.library_entries where source_type=p_source_type and source_id=p_source_id;
 if result is not null then return result;end if;
 if nullif(trim(p_title),'') is null or nullif(trim(p_resolution),'') is null or p_description is null then
  raise exception 'Cần nhập tiêu đề và lời giải trước khi lưu vào thư viện.';
 end if;
 if p_source_type='ticket' then
  select * into t from public.tickets where id=p_source_id for update;
  if not found then raise exception 'Ticket đã bị xóa. Hãy tải lại.';end if;
  if t.status<>'resolved' then raise exception 'Chỉ lưu vào thư viện khi ticket đã xử lý.';end if;
  src_code:=t.code;src_version:=t.version;sys:=t.system_id;cat:=t.category_id;received:=t.received_at;completed:=t.completed_at;
  context:=jsonb_build_object('Bộ phận xử lý',(select name from public.departments where id=t.department_id),'Nhân sự xử lý',(select name from public.staff where id=t.staff_id));
  perform 1 from public.ticket_attachments where ticket_id=t.id order by id for share;
  if exists(select 1 from public.ticket_attachments where ticket_id=t.id and state<>'ready') then raise exception 'Ảnh đang tải lên. Hãy chờ hoàn tất rồi lưu vào thư viện.';end if;
 else
  select * into c from public.care_logs where id=p_source_id for update;
  if not found then raise exception 'Nhật ký đã bị xóa. Hãy tải lại.';end if;
  src_code:=c.code;src_version:=c.version;sys:=c.system_id;cat:=c.category_id;received:=c.received_at;completed:=c.completed_at;
  context:=jsonb_build_object('Bộ phận tiếp nhận',(select name from public.departments where id=c.receiving_department_id),'Nhân sự tiếp nhận',(select name from public.staff where id=c.receiving_staff_id),'Bộ phận phối hợp',(select name from public.departments where id=c.coordinating_department_id),'Nhân sự phối hợp',(select name from public.staff where id=c.coordinating_staff_id));
 end if;
 if p_source_version is distinct from src_version then raise exception 'Nguồn đã thay đổi. Hãy đóng hộp thoại và tải lại trước khi lưu.';end if;
 insert into public.library_entries(title,description,resolution,source_type,source_id,source_code,source_version,source_received_at,source_completed_at,source_context,system_id,category_id,system_name,category_name,created_by,updated_by)
 values(p_title,p_description,p_resolution,p_source_type,p_source_id,src_code,src_version,received,completed,context,sys,cat,(select name from public.systems where id=sys),(select name from public.categories where id=cat),auth.uid(),auth.uid()) returning id into result;
 if p_source_type='ticket' then
  insert into public.library_attachments(entry_id,name,mime_type,size,path)
  select result,name,mime_type,size,path from public.ticket_attachments where ticket_id=p_source_id and state='ready';
 end if;
 return result;
end;$$;
revoke all on function public.save_to_library(text,uuid,integer,text,text,text) from public,anon;
grant execute on function public.save_to_library(text,uuid,integer,text,text,text) to authenticated;

create function public.search_library(p_filters jsonb default '{}'::jsonb,p_cursor jsonb default null,p_limit integer default 30,p_cutoff timestamptz default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 with candidates as (
  select e.* from public.library_entries e
  where (nullif(trim(p_filters->>'q'),'') is null or e.search_vector @@ plainto_tsquery('simple'::regconfig,private.normalize_text(p_filters->>'q')))
  and (nullif(p_filters->>'source_type','') is null or e.source_type=p_filters->>'source_type')
  and (nullif(p_filters->>'system','') is null or e.system_id=(p_filters->>'system')::uuid)
  and (nullif(p_filters->>'category','') is null or e.category_id=(p_filters->>'category')::uuid)
  and (nullif(p_filters->>'from','') is null or e.created_at>=(p_filters->>'from')::timestamptz)
  and (nullif(p_filters->>'to','') is null or e.created_at<(p_filters->>'to')::timestamptz)
  and (p_cutoff is null or e.created_at<=p_cutoff)
 ), page as (
  select * from candidates where p_cursor is null or (created_at,id)<((p_cursor->>'date')::timestamptz,(p_cursor->>'id')::uuid)
  order by created_at desc,id desc limit least(greatest(coalesce(p_limit,30),1),500)+1
 ), visible as (select * from page order by created_at desc,id desc limit least(greatest(coalesce(p_limit,30),1),500))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(v)-'search_text'-'search_vector' order by created_at desc,id desc) from visible v),'[]'::jsonb),
 'total',(select count(*) from candidates),'hasMore',(select count(*) from page)>least(greatest(coalesce(p_limit,30),1),500),
 'nextCursor',(select jsonb_build_object('date',created_at,'id',id) from visible order by created_at,id limit 1));
$$;
revoke all on function public.search_library(jsonb,jsonb,integer,timestamptz) from public,anon;
grant execute on function public.search_library(jsonb,jsonb,integer,timestamptz) to authenticated;

-- Preserve the library visible at the cutover, without changing any source rows.
insert into public.library_entries(title,description,resolution,source_type,source_id,source_code,source_version,source_received_at,source_completed_at,source_context,system_id,category_id,system_name,category_name,migrated,created_by,updated_by)
select t.title,t.description,t.resolution,'ticket',t.id,t.code,t.version,t.received_at,t.completed_at,
 jsonb_build_object('Bộ phận xử lý',d.name,'Nhân sự xử lý',s.name),t.system_id,t.category_id,sy.name,ca.name,true,t.created_by,t.updated_by
from public.tickets t left join public.systems sy on sy.id=t.system_id left join public.categories ca on ca.id=t.category_id
left join public.departments d on d.id=t.department_id left join public.staff s on s.id=t.staff_id where t.status='resolved';
insert into public.library_attachments(entry_id,name,mime_type,size,path)
select e.id,a.name,a.mime_type,a.size,a.path from public.ticket_attachments a join public.library_entries e on e.source_type='ticket' and e.source_id=a.ticket_id where a.state='ready';

-- Immutable image bytes remain in the existing private bucket. Each independent
-- metadata owner keeps them alive; deleting either source alone cannot remove them.
create or replace function private.queue_attachment_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.storage_gc_jobs(path) values(old.path) on conflict on constraint storage_gc_jobs_path_key do nothing;
 return old;
end;$$;
create trigger queue_library_attachment_delete before delete on public.library_attachments for each row execute function private.queue_attachment_delete();
create or replace function public.claim_storage_gc(p_limit int default 100)
returns table(id bigint,path text,attempts int) language plpgsql security definer set search_path='' as $$
begin
 delete from public.ticket_attachments where state='pending' and created_at<now()-interval '24 hours';
 -- A queued deletion can become obsolete when an owner still references it.
 delete from private.storage_gc_jobs j where exists(select 1 from public.ticket_attachments a where a.path=j.path)
  or exists(select 1 from public.library_attachments a where a.path=j.path);
 insert into private.storage_gc_jobs(path)
 select o.name from storage.objects o where o.bucket_id='ticket-images' and o.created_at<now()-interval '1 hour'
 and not exists(select 1 from public.ticket_attachments a where a.path=o.name)
 and not exists(select 1 from public.library_attachments a where a.path=o.name)
 limit 1000 on conflict on constraint storage_gc_jobs_path_key do nothing;
 return query with jobs as (
  select j.id from private.storage_gc_jobs j where j.available_at<=now()
  and not exists(select 1 from public.ticket_attachments a where a.path=j.path)
  and not exists(select 1 from public.library_attachments a where a.path=j.path)
  order by j.id for update skip locked limit least(greatest(p_limit,1),500)
 ) update private.storage_gc_jobs j set available_at=now()+interval '5 minutes',attempts=j.attempts+1
 from jobs where j.id=jobs.id returning j.id,j.path,j.attempts;
end;$$;
alter policy cskh_image_read on storage.objects using (
 bucket_id='ticket-images' and (select private.is_active_user()) and (
 exists(select 1 from public.ticket_attachments a where a.path=storage.objects.name and a.state='ready')
 or exists(select 1 from public.library_attachments a where a.path=storage.objects.name))
);

-- Normalize the current server-side import message without rewriting old migrations.
do $$ declare definition text; begin
 select pg_get_functiondef('private.validate_care_import(jsonb)'::regprocedure) into definition;
 execute replace(definition,'Kênh phát sinh lỗi','Kênh phát sinh');
end;$$;
notify pgrst,'reload schema';
