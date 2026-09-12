create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.departments (
 id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 1 and 160),
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null
);
create unique index departments_name_unique on public.departments(lower(name));
create table public.app_users (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 160),
 department_id uuid references public.departments(id) on delete restrict,
 role text not null default 'user' check(role in ('admin','user')),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table public.categories (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 160),
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null
);
create unique index categories_name_unique on public.categories(lower(name));
create table public.systems (like public.categories including defaults including constraints including indexes);
alter table public.systems add foreign key (created_by) references auth.users(id) on delete set null;
create unique index systems_name_unique on public.systems(lower(name));
create table public.staff (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 160),
 department_id uuid not null references public.departments(id) on delete restrict,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null
);
create index staff_department_idx on public.staff(department_id);
create sequence public.ticket_number_seq;
create table public.tickets (
 id uuid primary key default gen_random_uuid(),
 number bigint not null unique default nextval('public.ticket_number_seq'),
 code text generated always as ('CSKH-' || lpad(number::text, greatest(6,length(number::text)), '0')) stored,
 created_at timestamptz not null default now(), received_at timestamptz not null default now(),
 title text not null check(length(trim(title)) between 1 and 240),
 description text not null default '' check(length(description)<=100000),
 resolution text not null default '' check(length(resolution)<=100000),
 status text not null default 'received' check(status in ('received','in_progress','resolved','cancelled')),
 category_id uuid references public.categories(id) on delete restrict,
 system_id uuid references public.systems(id) on delete restrict,
 department_id uuid references public.departments(id) on delete restrict,
 staff_id uuid references public.staff(id) on delete restrict,
 completed_at timestamptz, created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(), version integer not null default 1,
 search_text text not null default '', title_search text not null default '', search_vector tsvector,
 check(staff_id is null or department_id is not null)
);
create index tickets_created_idx on public.tickets(created_at desc,id desc);
create index tickets_received_idx on public.tickets(received_at desc,id desc);
create index tickets_completed_idx on public.tickets(completed_at desc,id desc) where status='resolved';
create index tickets_status_idx on public.tickets(status,received_at desc,id desc);
create index tickets_category_idx on public.tickets(category_id);
create index tickets_system_idx on public.tickets(system_id);
create index tickets_department_idx on public.tickets(department_id);
create index tickets_staff_idx on public.tickets(staff_id);
create index tickets_search_fts_idx on public.tickets using gin(search_vector);
create index tickets_search_trgm_idx on public.tickets using gin(search_text extensions.gin_trgm_ops);
create table public.ticket_attachments (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.tickets(id) on delete cascade,
 name text not null check(length(name) between 1 and 240), mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 size bigint not null check(size between 1 and 10485760), state text not null default 'pending' check(state in ('pending','ready')),
 path text not null unique, created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null
);
create index ticket_attachments_ticket_idx on public.ticket_attachments(ticket_id);
create table private.storage_gc_jobs (
 id bigint generated always as identity primary key, path text not null unique,
 attempts integer not null default 0, available_at timestamptz not null default now(), last_error text, created_at timestamptz not null default now()
);

create function private.is_active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_users where id=(select auth.uid()) and active);
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_users where id=(select auth.uid()) and active and role='admin');
$$;
revoke all on function private.is_active_user(),private.is_admin() from public;
grant execute on function private.is_active_user(),private.is_admin() to authenticated,service_role;
create function public.my_access() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('active',private.is_active_user(),'admin',private.is_admin());
$$;

create function private.normalize_text(value text) returns text language sql stable set search_path='' as $$
 select lower(extensions.unaccent(coalesce(value,'')));
$$;
create function private.ticket_before_write() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
   new.created_by:=auth.uid(); new.updated_by:=auth.uid(); new.created_at:=now(); new.version:=1;
 else
   new.id:=old.id; new.number:=old.number; new.created_at:=old.created_at; new.created_by:=old.created_by;
   new.updated_by:=auth.uid(); new.version:=old.version+1;
 end if;
 if new.staff_id is not null and (tg_op='INSERT' or new.staff_id is distinct from old.staff_id or new.department_id is distinct from old.department_id) then
   if not exists(select 1 from public.staff where id=new.staff_id and department_id=new.department_id) then
     raise exception 'Nhân sự không thuộc phòng ban đã chọn.';
   end if;
 end if;
 if new.status='resolved' then
   if tg_op='INSERT' then new.completed_at:=now();
   elsif old.status is distinct from 'resolved' then new.completed_at:=now();
   else new.completed_at:=old.completed_at; end if;
 else new.completed_at:=null; end if;
 new.updated_at:=now();
 new.title_search:=private.normalize_text(new.title);
 new.search_text:=private.normalize_text('CSKH-'||lpad(new.number::text,greatest(6,length(new.number::text)),'0')||' '||new.title||' '||new.description||' '||new.resolution);
 new.search_vector:=to_tsvector('simple'::regconfig,new.search_text);
 return new;
end; $$;
create trigger ticket_before_write before insert or update on public.tickets for each row execute function private.ticket_before_write();

create function private.catalog_created_by() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.created_by:=auth.uid(); new.created_at:=now();
 else new.created_by:=old.created_by; new.created_at:=old.created_at; new.id:=old.id; end if;
 return new;
end; $$;
do $$ declare t text; begin
 foreach t in array array['categories','systems','departments','staff'] loop
 execute format('create trigger catalog_audit before insert or update on public.%I for each row execute function private.catalog_created_by()',t);
 end loop;
end $$;

create function private.guard_last_admin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(740012);
 if old.role='admin' and old.active and (tg_op='DELETE' or new.role<>'admin' or not new.active) then
   if not exists(select 1 from public.app_users where role='admin' and active and id<>old.id) then
     raise exception 'Cần giữ ít nhất một quản trị viên đang hoạt động.';
   end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;
create trigger guard_last_admin before update or delete on public.app_users for each row execute function private.guard_last_admin();

create function private.attachment_before_write() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
   perform 1 from public.tickets where id=new.ticket_id for update;
   if (select count(*) from public.ticket_attachments where ticket_id=new.ticket_id)>=10 then
     raise exception 'Mỗi ticket tối đa 10 ảnh.';
   end if;
   new.path:=new.ticket_id::text||'/'||new.id::text;
   new.state:='pending'; new.created_at:=now(); new.created_by:=auth.uid();
 else
   new.id:=old.id;new.ticket_id:=old.ticket_id;new.path:=old.path;new.created_at:=old.created_at;new.created_by:=old.created_by;
   new.name:=old.name;new.mime_type:=old.mime_type;new.size:=old.size;
 end if;
 return new;
end; $$;
create trigger attachment_before_write before insert or update on public.ticket_attachments for each row execute function private.attachment_before_write();
create function private.queue_attachment_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.storage_gc_jobs(path) values(old.path) on conflict(path) do nothing;
 return old;
end; $$;
create trigger queue_attachment_delete before delete on public.ticket_attachments for each row execute function private.queue_attachment_delete();

alter table public.app_users enable row level security;
create policy users_read on public.app_users for select to authenticated using ((select private.is_active_user()));
-- Account mutations are exclusively performed by the authenticated admin Edge Function.
revoke all on public.app_users from anon,authenticated;
grant select on public.app_users to authenticated;
do $$ declare t text; begin
 foreach t in array array['tickets','ticket_attachments','categories','systems','departments','staff'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('create policy member_read on public.%I for select to authenticated using ((select private.is_active_user()))',t);
   execute format('create policy member_insert on public.%I for insert to authenticated with check ((select private.%I()))',t,case when t='systems' then 'is_admin' else 'is_active_user' end);
   execute format('create policy member_update on public.%I for update to authenticated using ((select private.%I())) with check ((select private.%I()))',t,case when t='systems' then 'is_admin' else 'is_active_user' end,case when t='systems' then 'is_admin' else 'is_active_user' end);
   execute format('create policy member_delete on public.%I for delete to authenticated using ((select private.%I()))',t,case when t in ('tickets','ticket_attachments') then 'is_active_user' else 'is_admin' end);
   execute format('revoke all on public.%I from anon,authenticated',t);
   execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
end $$;
grant usage on sequence public.ticket_number_seq to authenticated;
grant execute on function private.normalize_text(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ticket-images','ticket-images',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy cskh_image_read on storage.objects for select to authenticated using (
 bucket_id='ticket-images' and (select private.is_active_user()) and exists(select 1 from public.ticket_attachments a where a.path=name and a.state='ready')
);
create policy cskh_image_upload on storage.objects for insert to authenticated with check (
 bucket_id='ticket-images' and (select private.is_active_user()) and exists(select 1 from public.ticket_attachments a where a.path=name and a.state='pending')
);

create function public.ticket_counts() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('all',count(*),'received',count(*) filter(where status='received'),'in_progress',count(*) filter(where status='in_progress'),'resolved',count(*) filter(where status='resolved'),'cancelled',count(*) filter(where status='cancelled')) from public.tickets;
$$;
create function public.search_tickets(
 p_query text default '', p_status text default null, p_category uuid default null, p_system uuid default null,
 p_department uuid default null,p_staff uuid default null,p_from timestamptz default null,p_to timestamptz default null,
 p_date_field text default 'received_at', p_sort text default 'received_at',p_cursor jsonb default null,p_limit int default 30,p_cutoff timestamptz default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare q text:=trim(private.normalize_text(left(p_query,240))); tsq tsquery; result jsonb;
begin
 if q<>'' then
   select to_tsquery('simple',string_agg(quote_literal(word)||':*',' & ')) into tsq
   from regexp_split_to_table(regexp_replace(q,'[^[:alnum:] ]',' ','g'),'\s+') word where word<>'';
 end if;
 with matching as (
   select t.id,t.code,t.title,left(t.description,240) description_excerpt,left(t.resolution,320) resolution_excerpt,
    t.status,t.received_at,t.created_at,t.completed_at,t.updated_at,t.version,t.category_id,t.system_id,t.department_id,t.staff_id,
    c.name category_name,s.name system_name,d.name department_name,st.name staff_name,
    case when q='' then 0 when lower(t.code)=q then 100 when t.title_search like '%'||q||'%' then 30 else 10 end rank,
    case when p_sort='created_at' then t.created_at when p_sort='completed_at' then coalesce(t.completed_at,t.received_at) else t.received_at end order_at
   from public.tickets t
   left join public.categories c on c.id=t.category_id left join public.systems s on s.id=t.system_id
   left join public.departments d on d.id=t.department_id left join public.staff st on st.id=t.staff_id
   where (q='' or t.search_vector@@tsq or (length(q)>=3 and t.search_text like '%'||replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_')||'%'))
   and (p_status is null or t.status=p_status) and (p_category is null or t.category_id=p_category)
   and (p_system is null or t.system_id=p_system) and (p_department is null or t.department_id=p_department)
   and (p_staff is null or t.staff_id=p_staff) and (p_cutoff is null or t.created_at<=p_cutoff)
   and (p_from is null or (case when p_date_field='created_at' then t.created_at when p_date_field='completed_at' then t.completed_at else t.received_at end)>=p_from)
   and (p_to is null or (case when p_date_field='created_at' then t.created_at when p_date_field='completed_at' then t.completed_at else t.received_at end)<p_to)
 ), page as (
   select * from matching where p_cursor is null or (rank,order_at,id)<((p_cursor->>'rank')::int,(p_cursor->>'date')::timestamptz,(p_cursor->>'id')::uuid)
   order by rank desc,order_at desc,id desc limit least(greatest(p_limit,1),1000)+1
 ), visible as (select * from page order by rank desc,order_at desc,id desc limit least(greatest(p_limit,1),1000))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(v)-'rank'-'order_at' order by rank desc,order_at desc,id desc) from visible v),'[]'::jsonb),
 'hasMore',(select count(*) from page)>least(greatest(p_limit,1),1000),
 'nextCursor',(select jsonb_build_object('rank',rank,'date',order_at,'id',id) from visible order by rank,order_at,id limit 1)) into result;
 return result;
end; $$;

create function public.claim_storage_gc(p_limit int default 100) returns table(id bigint,path text,attempts int) language plpgsql security definer set search_path='' as $$
begin
 -- Pending rows from interrupted uploads expire after 24h, enqueueing the object if it exists.
 delete from public.ticket_attachments where state='pending' and created_at<now()-interval '24 hours';
 return query with jobs as (select j.id from private.storage_gc_jobs j where available_at<=now() order by j.id for update skip locked limit least(p_limit,500))
 update private.storage_gc_jobs j set available_at=now()+interval '5 minutes',attempts=j.attempts+1 from jobs where j.id=jobs.id returning j.id,j.path,j.attempts;
end; $$;
create function public.finish_storage_gc(p_id bigint,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_error is null then delete from private.storage_gc_jobs where id=p_id;
 else update private.storage_gc_jobs set last_error=left(p_error,500),available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::int)) where id=p_id; end if;
end; $$;
revoke all on function public.claim_storage_gc(int),public.finish_storage_gc(bigint,text) from public,anon,authenticated;
grant execute on function public.claim_storage_gc(int),public.finish_storage_gc(bigint,text) to service_role;
revoke all on function public.my_access(),public.ticket_counts(),public.search_tickets(text,text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,jsonb,int,timestamptz) from public,anon;
grant execute on function public.my_access(),public.ticket_counts(),public.search_tickets(text,text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,jsonb,int,timestamptz) to authenticated;
