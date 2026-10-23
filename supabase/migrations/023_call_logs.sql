-- Independent call journal. Writes are validated RPCs; reads always use current RLS.
grant usage on schema extensions to authenticated;
alter table public.app_users add column call_log_access text not null default 'none'
 check(call_log_access in ('none','own','read','manage'));
alter table public.app_users add constraint viewer_call_read_only check(role<>'viewer' or call_log_access in ('none','read'));

create function private.call_access() returns text language sql stable security definer set search_path='' as $$
 select coalesce((select case when role='admin' then 'manage' when role='viewer' then case when call_log_access='read' then 'read' else 'none' end else call_log_access end from public.app_users where id=auth.uid() and active),'none');
$$;
create table public.call_purposes(id uuid primary key default gen_random_uuid(),name text not null unique check(length(trim(name)) between 1 and 160),active boolean not null default true);
insert into public.call_purposes(name) values('Chăm sóc định kỳ'),('Hỗ trợ sử dụng dịch vụ'),('Giới thiệu sản phẩm'),('Khảo sát ý kiến'),('Xử lý phản ánh'),('Khác');
create table private.call_import_batches(id uuid primary key default gen_random_uuid(),request_id uuid not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),file_name text not null,payload_hash text not null,row_count integer not null,unique(created_by,request_id));
create table public.call_logs(
 id uuid primary key default gen_random_uuid(),number bigint generated always as identity unique,
 code text generated always as ('CG-'||lpad(number::text,greatest(6,length(number::text)),'0')) stored,
 called_at timestamptz not null check(isfinite(called_at) and extract(year from called_at) between 1900 and 9999),
 ended_at timestamptz check(ended_at is null or (isfinite(ended_at) and ended_at>=called_at and extract(year from ended_at) between 1900 and 9999)),
 caller_staff_id uuid not null references public.staff(id) on delete restrict,
 owner_id uuid not null references public.app_users(id) on delete restrict,
 customer_name text not null default '' check(length(customer_name)<=240),phone text not null default '' check(length(phone)<=40),account_number text not null default '' check(length(account_number)<=100),
 nav numeric(20,2) check(nav>=0 and nav<1000000000000000000),
 purpose_id uuid not null references public.call_purposes(id) on delete restrict,
 status text not null check(status in ('connected','no_answer','busy','unreachable','wrong_number')),
 notes text not null default '' check(length(notes)<=32767),
 previous_call_id uuid references public.call_logs(id) on delete set null,
 created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null,updated_at timestamptz not null default now(),version integer not null default 1,
 import_batch_id uuid references private.call_import_batches(id) on delete restrict,
 check(length(trim(phone))>0 or length(trim(account_number))>0)
);
create table public.call_followups(
 call_id uuid primary key references public.call_logs(id) on delete cascade,
 action text not null check(length(trim(action)) between 1 and 32767),due_at timestamptz not null check(isfinite(due_at) and extract(year from due_at) between 1900 and 9999),
 assignee_id uuid not null references public.app_users(id) on delete restrict,
 status text not null default 'pending' check(status in ('pending','done','cancelled')),
 completed_at timestamptz,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id) on delete set null,
 version integer not null default 1,check((status='done')=(completed_at is not null))
);
create index call_date_idx on public.call_logs(called_at desc,id desc);
create index call_owner_idx on public.call_logs(owner_id,called_at desc);
create index call_staff_idx on public.call_logs(caller_staff_id,called_at desc);
create index call_account_idx on public.call_logs(account_number,called_at desc);
create index call_phone_idx on public.call_logs((regexp_replace(phone,'[^0-9+]','','g')));
create index call_followup_idx on public.call_followups(assignee_id,status,due_at);
create function private.can_read_call(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.call_access() in ('manage','read') or (private.call_access()='own' and exists(select 1 from public.call_logs c where c.id=p_id and (c.owner_id=auth.uid() or exists(select 1 from public.call_followups f where f.call_id=c.id and f.assignee_id=auth.uid()))));
$$;
alter table public.call_logs enable row level security;
alter table public.call_followups enable row level security;
alter table public.call_purposes enable row level security;
alter table private.call_import_batches enable row level security;
create policy call_read on public.call_logs for select to authenticated using(private.can_read_call(id));
create policy followup_read on public.call_followups for select to authenticated using(private.can_read_call(call_id));
create policy purpose_read on public.call_purposes for select to authenticated using(private.call_access()<>'none');
create policy purpose_manage on public.call_purposes for all to authenticated using(private.call_access()='manage') with check(private.call_access()='manage');
revoke all on public.call_logs,public.call_followups,public.call_purposes,private.call_import_batches from public,anon,authenticated;
grant select on public.call_logs,public.call_followups,public.call_purposes to authenticated;
grant insert(name),update(name,active) on public.call_purposes to authenticated;
grant all on public.call_logs,public.call_followups,public.call_purposes,private.call_import_batches to service_role;
grant usage on sequence public.call_logs_number_seq to service_role;

-- Validation shared by manual saves and import preview/commit.
create function private.validate_call(p_input jsonb,p_existing uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.call_logs; f jsonb:=p_input->'followup'; a text:=private.call_access(); owner uuid; old public.call_logs;
begin
 if a not in ('own','manage') then raise exception 'Không có quyền ghi Nhật ký cuộc gọi.' using errcode='42501';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'Dữ liệu cuộc gọi không hợp lệ.';end if;
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('called_at','ended_at','caller_staff_id','owner_id','customer_name','phone','account_number','nav','purpose_id','status','notes','previous_call_id','followup','row')) then raise exception 'Có trường dữ liệu không được phép.';end if;
 if p_existing is not null then
  select * into old from public.call_logs where id=p_existing;
  if not found or (a<>'manage' and old.owner_id<>auth.uid()) then raise exception 'Không có quyền sửa cuộc gọi này.';end if;
 end if;
 owner:=coalesce(nullif(p_input->>'owner_id','')::uuid,old.owner_id,auth.uid());
 if a<>'manage' and owner<>auth.uid() then raise exception 'Chỉ quản lý được đổi người sở hữu.';end if;
 if not exists(select 1 from public.app_users where id=owner and active and (role='admin' or (role='user' and call_log_access in ('own','manage')))) then raise exception 'Người sở hữu chưa có quyền ghi cuộc gọi.';end if;
 r:=jsonb_populate_record(null::public.call_logs,p_input);
 if r.called_at is null or not isfinite(r.called_at) or extract(year from r.called_at) not between 1900 and 9999 then raise exception 'Ngày giờ gọi không hợp lệ.';end if;
 if r.ended_at is not null and (not isfinite(r.ended_at) or r.ended_at<r.called_at or extract(year from r.ended_at) not between 1900 and 9999) then raise exception 'Giờ kết thúc phải từ thời điểm bắt đầu trở đi.';end if;
 if not exists(select 1 from public.staff where id=r.caller_staff_id) then raise exception 'Nhân viên gọi không tồn tại.';end if;
 if not exists(select 1 from public.call_purposes where id=r.purpose_id and (active or id=old.purpose_id)) then raise exception 'Mục đích cuộc gọi không còn hoạt động.';end if;
 if r.status is null or r.status not in ('connected','no_answer','busy','unreachable','wrong_number') then raise exception 'Trạng thái cuộc gọi không hợp lệ.';end if;
 if length(trim(coalesce(r.phone,'')))=0 and length(trim(coalesce(r.account_number,'')))=0 then raise exception 'Cần số điện thoại hoặc số TKCK.';end if;
 if length(coalesce(r.customer_name,''))>240 or length(coalesce(r.phone,''))>40 or length(coalesce(r.account_number,''))>100 or length(coalesce(r.notes,''))>32767 then raise exception 'Nội dung vượt giới hạn độ dài.';end if;
 if r.nav is not null and (r.nav<0 or r.nav>=1000000000000000000 or r.nav::text in ('NaN','Infinity','-Infinity')) then raise exception 'NAV phải là số không âm hợp lệ.';end if;
 if r.previous_call_id is not null and (r.previous_call_id=p_existing or not exists(select 1 from public.call_logs where id=r.previous_call_id) or not private.can_read_call(r.previous_call_id)) then raise exception 'Cuộc gọi trước không tồn tại hoặc không có quyền xem.';end if;
 if p_existing is not null and r.previous_call_id is distinct from old.previous_call_id then raise exception 'Không thay đổi liên kết cuộc gọi trước sau khi tạo.';end if;
 if f is not null and f<>'null'::jsonb then
  if jsonb_typeof(f)<>'object' or length(trim(coalesce(f->>'action',''))) not between 1 and 32767 or coalesce(f->>'status','') not in ('pending','done','cancelled') then raise exception 'Nội dung hoặc trạng thái việc tiếp theo không hợp lệ.';end if;
  if nullif(f->>'due_at','') is null or not isfinite((f->>'due_at')::timestamptz) or extract(year from (f->>'due_at')::timestamptz) not between 1900 and 9999 then raise exception 'Cần ngày giờ hẹn hợp lệ.';end if;
  if (f->>'due_at')::timestamptz<r.called_at then raise exception 'Ngày hẹn không được trước cuộc gọi.';end if;
  if not exists(select 1 from public.app_users where id=(f->>'assignee_id')::uuid and active and (role='admin' or (role='user' and call_log_access in ('own','manage')))) then raise exception 'Người phụ trách chưa có quyền ghi cuộc gọi.';end if;
 end if;
 return p_input||jsonb_build_object('owner_id',owner,'customer_name',trim(coalesce(r.customer_name,'')),'phone',trim(coalesce(r.phone,'')),'account_number',trim(coalesce(r.account_number,'')),'notes',coalesce(r.notes,''));
end;$$;

create function public.save_call_log(p_input jsonb,p_id uuid default null,p_version integer default null,p_followup_version integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v jsonb; r public.call_logs; f jsonb; saved uuid; old public.call_logs; oldf public.call_followups;
begin
 if private.call_access() not in ('own','manage') then raise exception 'Không có quyền ghi Nhật ký cuộc gọi.';end if;
 if p_id is not null then
  select * into old from public.call_logs where id=p_id and (private.call_access()='manage' or owner_id=auth.uid()) for update;
  if not found then raise exception 'Không có quyền sửa cuộc gọi này.';end if;
  if p_version is distinct from old.version then raise exception 'Cuộc gọi đã thay đổi. Hãy tải bản mới để đối chiếu.';end if;
  select * into oldf from public.call_followups where call_id=p_id for update;
  if p_followup_version is distinct from oldf.version then raise exception 'Việc tiếp theo đã thay đổi. Hãy tải lại.';end if;
 end if;
 v:=private.validate_call(p_input,p_id);r:=jsonb_populate_record(null::public.call_logs,v);f:=v->'followup';
 if p_id is null then
  insert into public.call_logs(called_at,ended_at,caller_staff_id,owner_id,customer_name,phone,account_number,nav,purpose_id,status,notes,previous_call_id,created_by,updated_by)
  values(r.called_at,r.ended_at,r.caller_staff_id,r.owner_id,r.customer_name,r.phone,r.account_number,r.nav,r.purpose_id,r.status,r.notes,r.previous_call_id,auth.uid(),auth.uid()) returning id into saved;
 else
  update public.call_logs set called_at=r.called_at,ended_at=r.ended_at,caller_staff_id=r.caller_staff_id,owner_id=r.owner_id,customer_name=r.customer_name,phone=r.phone,account_number=r.account_number,nav=r.nav,purpose_id=r.purpose_id,status=r.status,notes=r.notes,updated_by=auth.uid(),updated_at=now(),version=version+1 where id=p_id;
  saved:=p_id;
 end if;
 if f is null or f='null'::jsonb then delete from public.call_followups where call_id=saved;
 else
  insert into public.call_followups(call_id,action,due_at,assignee_id,status,completed_at,updated_by)
  values(saved,trim(f->>'action'),(f->>'due_at')::timestamptz,(f->>'assignee_id')::uuid,f->>'status',case when f->>'status'='done' then coalesce(oldf.completed_at,now()) end,auth.uid())
  on conflict(call_id) do update set action=excluded.action,due_at=excluded.due_at,assignee_id=excluded.assignee_id,status=excluded.status,completed_at=excluded.completed_at,updated_at=now(),updated_by=auth.uid(),version=public.call_followups.version+1;
 end if;
 return saved;
end;$$;
create function public.update_call_followup(p_id uuid,p_version integer,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare f public.call_followups; a text:=private.call_access();
begin
 -- Lock parent first: same lock order as save/delete.
 perform 1 from public.call_logs where id=p_id for update;
 select * into f from public.call_followups where call_id=p_id for update;
 if not found or a not in ('own','manage') or (a<>'manage' and f.assignee_id<>auth.uid() and not exists(select 1 from public.call_logs where id=p_id and owner_id=auth.uid())) then raise exception 'Không có quyền cập nhật việc này.';end if;
 if f.version is distinct from p_version then raise exception 'Việc tiếp theo đã thay đổi. Hãy tải lại.';end if;
 if p_status is null or p_status not in ('pending','done','cancelled') then raise exception 'Trạng thái không hợp lệ.';end if;
 update public.call_followups set status=p_status,completed_at=case when p_status='done' then coalesce(completed_at,now()) end,updated_by=auth.uid(),updated_at=now(),version=version+1 where call_id=p_id;
end;$$;
create function public.delete_call_log(p_id uuid,p_version integer,p_followup_version integer default null) returns void language plpgsql security definer set search_path='' as $$
declare task_version integer;
begin
 if private.call_access()<>'manage' then raise exception 'Chỉ quản lý được xóa cuộc gọi.';end if;
 perform 1 from public.call_logs where id=p_id for update;
 select version into task_version from public.call_followups where call_id=p_id for update;
 if task_version is distinct from p_followup_version then raise exception 'Việc tiếp theo đã thay đổi. Hãy tải lại trước khi xóa.';end if;
 delete from public.call_logs where id=p_id and version=p_version;
 if not found then raise exception 'Cuộc gọi đã thay đổi hoặc đã bị xóa.';end if;
end;$$;

create function public.filtered_call_logs(p_filters jsonb default '{}') returns setof public.call_logs language sql stable security invoker set search_path='' as $$
 select c.* from public.call_logs c left join public.call_followups f on f.call_id=c.id where
 (coalesce(p_filters->>'q','')='' or position(private.normalize_text(p_filters->>'q') in private.normalize_text(c.code||' '||c.customer_name||' '||c.phone||' '||c.account_number||' '||c.notes||' '||coalesce(f.action,'')))>0)
 and (nullif(p_filters->>'from','') is null or c.called_at>=(p_filters->>'from')::timestamptz)
 and (nullif(p_filters->>'to','') is null or c.called_at<(p_filters->>'to')::timestamptz)
 and (nullif(p_filters->>'caller_staff_id','') is null or c.caller_staff_id=(p_filters->>'caller_staff_id')::uuid)
 and (nullif(p_filters->>'owner_id','') is null or c.owner_id=(p_filters->>'owner_id')::uuid)
 and (nullif(p_filters->>'purpose_id','') is null or c.purpose_id=(p_filters->>'purpose_id')::uuid)
 and (nullif(p_filters->>'status','') is null or c.status=p_filters->>'status')
 and (nullif(p_filters->>'nav_min','') is null or c.nav>=(p_filters->>'nav_min')::numeric)
 and (nullif(p_filters->>'nav_max','') is null or c.nav<=(p_filters->>'nav_max')::numeric)
 and (nullif(p_filters->>'assignee_id','') is null or f.assignee_id=(p_filters->>'assignee_id')::uuid)
 and (nullif(p_filters->>'followup','') is null or case p_filters->>'followup' when 'none' then f.call_id is null when 'overdue' then f.status='pending' and f.due_at<now() when 'today' then f.status='pending' and (f.due_at at time zone 'Asia/Ho_Chi_Minh')::date=(now() at time zone 'Asia/Ho_Chi_Minh')::date when 'upcoming' then f.status='pending' and (f.due_at at time zone 'Asia/Ho_Chi_Minh')::date>(now() at time zone 'Asia/Ho_Chi_Minh')::date else f.status=p_filters->>'followup' end)
 and (nullif(p_filters->>'customer_account','') is null or c.account_number=p_filters->>'customer_account')
 and (nullif(p_filters->>'customer_phone','') is null or regexp_replace(c.phone,'[^0-9+]','','g')=regexp_replace(p_filters->>'customer_phone','[^0-9+]','','g'))
 and (nullif(p_filters->>'id','') is null or c.id=(p_filters->>'id')::uuid)
 and (nullif(p_filters->>'cutoff','') is null or c.created_at<=(p_filters->>'cutoff')::timestamptz);
$$;
create function public.search_call_logs(p_filters jsonb default '{}',p_cursor jsonb default null,p_limit integer default 30) returns jsonb language sql stable security invoker set search_path='' as $$
 with candidates as materialized(select * from public.filtered_call_logs(p_filters)),page as(
 select * from candidates c where p_cursor is null or (c.called_at,c.id)<((p_cursor->>'date')::timestamptz,(p_cursor->>'id')::uuid) order by c.called_at desc,c.id desc limit least(greatest(p_limit,1),500)+1
 ),visible as(select * from page order by called_at desc,id desc limit least(greatest(p_limit,1),500))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('nav',v.nav::text,'followup',(select to_jsonb(f) from public.call_followups f where f.call_id=v.id)) order by called_at desc,id desc) from visible v),'[]'::jsonb),'total',(select count(*) from candidates),'hasMore',(select count(*) from page)>least(greatest(p_limit,1),500),'nextCursor',(select jsonb_build_object('date',called_at,'id',id) from visible order by called_at,id limit 1));
$$;
create function public.call_log_stats(p_filters jsonb default '{}',p_group text default 'day') returns jsonb language sql stable security invoker set search_path='' as $$
 with rows as materialized(select c.*,f.status task_status,f.due_at from public.filtered_call_logs(p_filters) c left join public.call_followups f on f.call_id=c.id), totals as(
 select count(*) total,count(*) filter(where status='connected') connected,
 count(distinct case when account_number<>'' then 'a:'||account_number else 'p:'||regexp_replace(phone,'[^0-9+]','','g') end) customers,
 coalesce(sum(extract(epoch from ended_at-called_at)) filter(where status='connected'),0) duration_seconds,
 avg(extract(epoch from ended_at-called_at)) filter(where status='connected') average_seconds,
 count(*) filter(where task_status='pending') pending,count(*) filter(where task_status='pending' and due_at<now()) overdue,
 count(*) filter(where task_status='pending' and (due_at at time zone 'Asia/Ho_Chi_Minh')::date=(now() at time zone 'Asia/Ho_Chi_Minh')::date) due_today,
 count(*) filter(where task_status='done') done from rows
 ), groups as(select case p_group when 'staff' then caller_staff_id::text when 'purpose' then purpose_id::text when 'status' then status when 'month' then to_char(called_at at time zone 'Asia/Ho_Chi_Minh','YYYY-MM') when 'week' then to_char(date_trunc('week',called_at at time zone 'Asia/Ho_Chi_Minh'),'YYYY-MM-DD') else to_char(called_at at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD') end label,count(*) total,count(*) filter(where status='connected') connected from rows group by 1)
 select jsonb_build_object('totals',(select to_jsonb(t) from totals t),'groups',coalesce((select jsonb_agg(to_jsonb(g) order by label) from groups g),'[]'::jsonb));
$$;

create function public.validate_call_import(p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; clean jsonb; errors jsonb:='[]'; warnings jsonb:='[]'; seen text[]:='{}'; fingerprint text; rowno integer:=1;
begin
 if private.call_access() not in ('own','manage') then raise exception 'Không có quyền nhập cuộc gọi.';end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 1000 or octet_length(p_rows::text)>5242880 then raise exception 'Cần 1–1.000 dòng, dữ liệu tối đa 5 MB.';end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  rowno:=rowno+1;
  begin
   clean:=private.validate_call(item);fingerprint:=md5(jsonb_build_array(clean->>'called_at',clean->>'caller_staff_id',clean->>'phone',clean->>'account_number')::text);
   if fingerprint=any(seen) or exists(select 1 from public.call_logs c where private.can_read_call(c.id) and c.called_at=(clean->>'called_at')::timestamptz and c.caller_staff_id=(clean->>'caller_staff_id')::uuid and c.phone=clean->>'phone' and c.account_number=clean->>'account_number') then warnings:=warnings||jsonb_build_array(jsonb_build_object('row',coalesce((item->>'row')::integer,rowno),'message','Có thể trùng cuộc gọi đã nhập hoặc dòng khác trong file.'));end if;
   seen:=array_append(seen,fingerprint);
  exception when others then errors:=errors||jsonb_build_array(jsonb_build_object('row',coalesce(item->>'row',rowno::text),'message',sqlerrm));end;
 end loop;
 return jsonb_build_object('errors',errors,'warnings',warnings,'token',md5(p_rows::text||errors::text||warnings::text));
end;$$;
create function public.commit_call_import(p_rows jsonb,p_request_id uuid,p_file_name text,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare batch private.call_import_batches; result jsonb; item jsonb; saved uuid; hash text:=md5(p_rows::text);
begin
 if private.call_access() not in ('own','manage') then raise exception 'Không có quyền nhập cuộc gọi.';end if;
 if p_request_id is null then raise exception 'Thiếu mã yêu cầu.';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text,0));
 select * into batch from private.call_import_batches where created_by=auth.uid() and request_id=p_request_id;
 if found then
  if batch.payload_hash<>hash then raise exception 'Mã yêu cầu đã được dùng cho nội dung khác.';end if;
  return jsonb_build_object('id',batch.id,'count',batch.row_count,'replayed',true);
 end if;
 result:=public.validate_call_import(p_rows);
 if jsonb_array_length(result->'errors')>0 or p_token is distinct from result->>'token' then return jsonb_build_object('review',result);end if;
 insert into private.call_import_batches(request_id,created_by,file_name,payload_hash,row_count) values(p_request_id,auth.uid(),left(coalesce(p_file_name,''),240),hash,jsonb_array_length(p_rows)) returning * into batch;
 for item in select value from jsonb_array_elements(p_rows) loop saved:=public.save_call_log(item);update public.call_logs set import_batch_id=batch.id where id=saved;end loop;
 return jsonb_build_object('id',batch.id,'count',batch.row_count);
end;$$;
create function public.get_call_import_result(p_request_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'count',row_count) from private.call_import_batches where created_by=auth.uid() and request_id=p_request_id and private.call_access() in ('own','manage');
$$;
revoke all on function private.call_access(),private.can_read_call(uuid),private.validate_call(jsonb,uuid) from public,anon,authenticated;
grant execute on function private.call_access(),private.can_read_call(uuid) to authenticated,service_role;
revoke all on function public.save_call_log(jsonb,uuid,integer,integer),public.update_call_followup(uuid,integer,text),public.delete_call_log(uuid,integer,integer),public.filtered_call_logs(jsonb),public.search_call_logs(jsonb,jsonb,integer),public.call_log_stats(jsonb,text),public.validate_call_import(jsonb),public.commit_call_import(jsonb,uuid,text,text),public.get_call_import_result(uuid) from public,anon;
grant execute on function public.save_call_log(jsonb,uuid,integer,integer),public.update_call_followup(uuid,integer,text),public.delete_call_log(uuid,integer,integer),public.filtered_call_logs(jsonb),public.search_call_logs(jsonb,jsonb,integer),public.call_log_stats(jsonb,text),public.validate_call_import(jsonb),public.commit_call_import(jsonb,uuid,text,text),public.get_call_import_result(uuid) to authenticated,service_role;
