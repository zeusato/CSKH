alter table public.app_users add column care_log_access text not null default 'none'
 check(care_log_access in ('none','read','write'));
alter table public.app_users add constraint viewer_care_read_only check(role <> 'viewer' or care_log_access <> 'write');

create function private.can_read_care_logs() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_users where id=auth.uid() and active and (role='admin' or care_log_access in ('read','write')));
$$;
create function private.can_write_care_logs() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_users where id=auth.uid() and active and (role='admin' or (role='user' and care_log_access='write')));
$$;
revoke all on function private.can_read_care_logs(),private.can_write_care_logs() from public,anon;
grant execute on function private.can_read_care_logs(),private.can_write_care_logs() to authenticated,service_role;

create table private.care_log_import_batches (
 id uuid primary key default gen_random_uuid(), imported_by uuid references auth.users(id) on delete set null,
 imported_at timestamptz not null default now(), file_name text not null check(length(file_name)<=240),
 template_version text not null, row_count integer not null, request_id uuid not null,
 payload_hash text not null, unique(imported_by,request_id)
);
alter table private.care_log_import_batches enable row level security;
revoke all on private.care_log_import_batches from public,anon,authenticated;
create sequence public.care_log_number_seq;
create table public.care_logs (
 id uuid primary key default gen_random_uuid(), number bigint not null unique default nextval('public.care_log_number_seq'),
 code text generated always as ('NK-'||lpad(number::text,greatest(6,length(number::text)),'0')) stored,
 request_type text not null check(request_type in ('support','complaint','feedback')),
 description text not null check(length(trim(description)) between 1 and 100000),
 response_content text not null default '' check(length(response_content)<=100000),
 notes text not null default '' check(length(notes)<=100000),
 system_id uuid references public.systems(id) on delete restrict,
 category_id uuid references public.categories(id) on delete restrict,
 receiving_department_id uuid not null references public.departments(id) on delete restrict,
 receiving_staff_id uuid references public.staff(id) on delete restrict,
 coordinating_department_id uuid references public.departments(id) on delete restrict,
 coordinating_staff_id uuid references public.staff(id) on delete restrict,
 status text not null default 'received' check(status in ('received','in_progress','resolved','cancelled')),
 received_at timestamptz not null check(isfinite(received_at) and extract(year from received_at) between 1900 and 9999),
 completed_at timestamptz check(completed_at is null or (isfinite(completed_at) and extract(year from completed_at) between 1900 and 9999)),
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 version integer not null default 1,
 entry_source text not null default 'manual' check(entry_source in ('manual','excel_import')),
 import_batch_id uuid references private.care_log_import_batches(id) on delete restrict,
 import_row_number integer,
 search_text text not null default '', search_vector tsvector,
 check((status='resolved' and completed_at is not null and completed_at>=received_at) or (status<>'resolved' and completed_at is null)),
 check(coordinating_staff_id is null or coordinating_department_id is not null),
 check((entry_source='manual' and import_batch_id is null and import_row_number is null) or (entry_source='excel_import' and import_batch_id is not null and import_row_number>=2)),
 unique(import_batch_id,import_row_number)
);
create index care_logs_received_idx on public.care_logs(received_at desc,id desc);
create index care_logs_created_idx on public.care_logs(created_at desc,id desc);
create index care_logs_completed_idx on public.care_logs(completed_at desc,id desc);
create index care_logs_status_idx on public.care_logs(status,received_at desc,id desc);
create index care_logs_search_idx on public.care_logs using gin(search_vector);
create index care_logs_system_idx on public.care_logs(system_id);
create index care_logs_category_idx on public.care_logs(category_id);
create index care_logs_receiving_idx on public.care_logs(receiving_department_id,receiving_staff_id);
create index care_logs_coordinating_idx on public.care_logs(coordinating_department_id,coordinating_staff_id);
alter table public.care_logs enable row level security;
create policy care_read on public.care_logs for select to authenticated using((select private.can_read_care_logs()));
create policy care_insert on public.care_logs for insert to authenticated with check((select private.can_write_care_logs()));
create policy care_update on public.care_logs for update to authenticated using((select private.can_write_care_logs())) with check((select private.can_write_care_logs()));
create policy care_delete on public.care_logs for delete to authenticated using((select private.can_write_care_logs()));
revoke all on public.care_logs from anon,authenticated;
grant select,delete on public.care_logs to authenticated;
grant insert(request_type,description,response_content,notes,system_id,category_id,receiving_department_id,receiving_staff_id,coordinating_department_id,coordinating_staff_id,status,received_at,completed_at) on public.care_logs to authenticated;
grant update(request_type,description,response_content,notes,system_id,category_id,receiving_department_id,receiving_staff_id,coordinating_department_id,coordinating_staff_id,status,received_at,completed_at) on public.care_logs to authenticated;
grant usage on sequence public.care_log_number_seq to authenticated;
grant all on public.care_logs to service_role;
grant usage on sequence public.care_log_number_seq to service_role;

create function private.care_log_before_write() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.created_by:=auth.uid(); new.created_at:=now(); new.version:=1;
 else
  new.id:=old.id;new.number:=old.number;new.created_by:=old.created_by;new.created_at:=old.created_at;
  new.entry_source:=old.entry_source;new.import_batch_id:=old.import_batch_id;new.import_row_number:=old.import_row_number;
  new.version:=old.version+1;
  if old.status='resolved' and new.status<>'resolved' then new.completed_at:=null;end if;
 end if;
 if new.receiving_staff_id is not null and (tg_op='INSERT' or new.receiving_staff_id is distinct from old.receiving_staff_id or new.receiving_department_id is distinct from old.receiving_department_id) then
  if not exists(select 1 from public.staff where id=new.receiving_staff_id and department_id=new.receiving_department_id) then raise exception 'Nhân sự tiếp nhận không thuộc bộ phận đã chọn.';end if;
 end if;
 if new.coordinating_staff_id is not null and (tg_op='INSERT' or new.coordinating_staff_id is distinct from old.coordinating_staff_id or new.coordinating_department_id is distinct from old.coordinating_department_id) then
  if not exists(select 1 from public.staff where id=new.coordinating_staff_id and department_id=new.coordinating_department_id) then raise exception 'Nhân sự phối hợp không thuộc bộ phận đã chọn.';end if;
 end if;
 new.updated_by:=auth.uid();new.updated_at:=now();
 new.search_text:=private.normalize_text(new.description||' '||new.response_content||' '||new.notes);
 new.search_vector:=to_tsvector('simple'::regconfig,new.search_text);
 return new;
end;$$;
create trigger care_log_before_write before insert or update on public.care_logs for each row execute function private.care_log_before_write();

create function public.search_care_logs(p_filters jsonb default '{}',p_cursor jsonb default null,p_limit integer default 30,p_cutoff timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare query_text text:=private.normalize_text(left(coalesce(p_filters->>'q',''),240)); terms tsquery;
 size integer:=least(greatest(p_limit,1),500); result jsonb;
begin
 if not private.can_read_care_logs() then raise exception 'Không có quyền đọc Nhật ký CSKH.' using errcode='42501';end if;
 select to_tsquery('simple',string_agg(quote_literal(word)||':*',' & ')) into terms from regexp_split_to_table(regexp_replace(query_text,'[^[:alnum:] ]',' ','g'),'\s+') word where word<>'';
 with candidates as (
  select c.*,case when upper(query_text)=c.code then 100 when query_text='' then 0 else 10 end rank,
   case p_filters->>'sort' when 'created_at' then c.created_at when 'completed_at' then coalesce(c.completed_at,c.received_at) else c.received_at end order_at
  from public.care_logs c where
   (query_text='' or upper(query_text)=c.code or c.search_vector@@terms or (length(query_text)>=3 and position(query_text in c.search_text)>0))
   and (nullif(p_filters->>'status','') is null or c.status=p_filters->>'status')
   and (nullif(p_filters->>'request_type','') is null or c.request_type=p_filters->>'request_type')
   and (nullif(p_filters->>'system_id','') is null or c.system_id=(p_filters->>'system_id')::uuid)
   and (nullif(p_filters->>'category_id','') is null or c.category_id=(p_filters->>'category_id')::uuid)
   and (nullif(p_filters->>'receiving_department_id','') is null or c.receiving_department_id=(p_filters->>'receiving_department_id')::uuid)
   and (nullif(p_filters->>'receiving_staff_id','') is null or c.receiving_staff_id=(p_filters->>'receiving_staff_id')::uuid)
   and (nullif(p_filters->>'coordinating_department_id','') is null or c.coordinating_department_id=(p_filters->>'coordinating_department_id')::uuid)
   and (nullif(p_filters->>'coordinating_staff_id','') is null or c.coordinating_staff_id=(p_filters->>'coordinating_staff_id')::uuid)
   and (nullif(p_filters->>'import_batch_id','') is null or c.import_batch_id=(p_filters->>'import_batch_id')::uuid)
   and (p_cutoff is null or c.created_at<=p_cutoff)
   and (nullif(p_filters->>'from','') is null or (case p_filters->>'dateField' when 'created_at' then c.created_at when 'completed_at' then c.completed_at else c.received_at end)>=(p_filters->>'from')::timestamptz)
   and (nullif(p_filters->>'to','') is null or (case p_filters->>'dateField' when 'created_at' then c.created_at when 'completed_at' then c.completed_at else c.received_at end)<(p_filters->>'to')::timestamptz)
 ), page as (
  select * from candidates c where p_cursor is null or (c.rank,c.order_at,c.id)<((p_cursor->>'rank')::integer,(p_cursor->>'date')::timestamptz,(p_cursor->>'id')::uuid)
  order by rank desc,order_at desc,id desc limit size+1
 ), visible as (select * from page order by rank desc,order_at desc,id desc limit size)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(v)-'search_text'-'search_vector'-'rank'-'order_at' order by rank desc,order_at desc,id desc) from visible v),'[]'::jsonb),
  'hasMore',(select count(*)>size from page),'nextCursor',(select jsonb_build_object('rank',rank,'date',order_at,'id',id) from visible order by rank,order_at,id limit 1)) into result;
 return result;
end;$$;
create function public.care_log_counts() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;begin
 if not private.can_read_care_logs() then raise exception 'Không có quyền đọc Nhật ký CSKH.' using errcode='42501';end if;
 select jsonb_build_object('all',count(*),'received',count(*) filter(where status='received'),'in_progress',count(*) filter(where status='in_progress'),'resolved',count(*) filter(where status='resolved'),'cancelled',count(*) filter(where status='cancelled')) into result from public.care_logs;return result;
end;$$;

-- No staging writes: preview and commit share this validator. The token binds
-- the confirmed rows to the current catalog names and duplicate warnings.
create function private.validate_care_import(p_rows jsonb) returns jsonb language plpgsql set search_path='' as $$
declare item jsonb; r public.care_logs; errors jsonb:='[]'; warnings jsonb:='[]'; rowno integer; other record;
 seen text[]:='{}'; fingerprint text; names jsonb:='[]'; signature text; source_rows integer[]:='{}';
begin
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Dữ liệu nhập phải là danh sách.';end if;
 if jsonb_array_length(p_rows) not between 1 and 1000 or octet_length(p_rows::text)>5242880 then raise exception 'File cần có 1–1.000 dòng và dữ liệu sau xử lý tối đa 5 MB.';end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  rowno:=null;
  begin
   rowno:=(item->>'row')::integer;
   if rowno is null or rowno<2 or rowno=any(source_rows) then raise exception 'Số dòng Excel không hợp lệ hoặc bị lặp.';end if;source_rows:=array_append(source_rows,rowno);
   if exists(select 1 from jsonb_object_keys(item) k where k not in ('row','request_type','description','response_content','notes','system_id','category_id','receiving_department_id','receiving_staff_id','coordinating_department_id','coordinating_staff_id','status','received_at','completed_at')) then raise exception 'Dữ liệu chứa cột không được phép.';end if;
   r:=jsonb_populate_record(null::public.care_logs,item);
   if r.request_type is null or r.request_type not in ('support','complaint','feedback') then raise exception 'Phân loại yêu cầu không hợp lệ.';end if;
   if r.status is null or r.status not in ('received','in_progress','resolved','cancelled') then raise exception 'Trạng thái xử lý không hợp lệ.';end if;
   if r.description is null or length(trim(r.description)) not between 1 and 32767 or length(coalesce(r.response_content,''))>32767 or length(coalesce(r.notes,''))>32767 then raise exception 'Mô tả bắt buộc; mỗi ô nội dung tối đa 32.767 ký tự.';end if;
   if r.received_at is null or not isfinite(r.received_at) or extract(year from r.received_at) not between 1900 and 9999 then raise exception 'Thời gian tiếp nhận không hợp lệ.';end if;
   if (r.status='resolved' and (r.completed_at is null or not isfinite(r.completed_at) or r.completed_at<r.received_at or extract(year from r.completed_at)>9999)) or (r.status<>'resolved' and r.completed_at is not null) then raise exception 'Thời gian hoàn thành không phù hợp trạng thái hoặc trước tiếp nhận.';end if;
   if not exists(select 1 from public.departments where id=r.receiving_department_id) then raise exception 'Bộ phận tiếp nhận không tồn tại.';end if;
   if r.system_id is not null and not exists(select 1 from public.systems where id=r.system_id) then raise exception 'Kênh phát sinh lỗi không tồn tại trong danh mục hệ thống.';end if;
   if r.category_id is not null and not exists(select 1 from public.categories where id=r.category_id) then raise exception 'Phân mục không tồn tại.';end if;
   if r.coordinating_department_id is not null and not exists(select 1 from public.departments where id=r.coordinating_department_id) then raise exception 'Bộ phận phối hợp không tồn tại.';end if;
   if r.receiving_staff_id is not null and not exists(select 1 from public.staff where id=r.receiving_staff_id and department_id=r.receiving_department_id) then raise exception 'Nhân sự tiếp nhận không thuộc bộ phận đã chọn.';end if;
   if r.coordinating_staff_id is not null and not exists(select 1 from public.staff where id=r.coordinating_staff_id and department_id=r.coordinating_department_id) then raise exception 'Nhân sự phối hợp không thuộc bộ phận đã chọn.';end if;
   select jsonb_build_array((select name from public.systems where id=r.system_id),(select name from public.categories where id=r.category_id),(select name from public.departments where id=r.receiving_department_id),(select name from public.staff where id=r.receiving_staff_id),(select name from public.departments where id=r.coordinating_department_id),(select name from public.staff where id=r.coordinating_staff_id)) into signature;
   names:=names||jsonb_build_array(signature);
   fingerprint:=md5(jsonb_build_array(r.request_type,private.normalize_text(trim(r.description)),r.received_at,r.receiving_department_id,r.receiving_staff_id)::text);
   if fingerprint=any(seen) then warnings:=warnings||jsonb_build_array(jsonb_build_object('row',rowno,'field','Dữ liệu dòng','message','Có dòng tương tự trong file.'));end if;
   seen:=array_append(seen,fingerprint);
   for other in select id,code from public.care_logs c where c.request_type=r.request_type and c.received_at=r.received_at and c.receiving_department_id=r.receiving_department_id and c.receiving_staff_id is not distinct from r.receiving_staff_id and private.normalize_text(trim(c.description))=private.normalize_text(trim(r.description)) order by id limit 5 loop
    warnings:=warnings||jsonb_build_array(jsonb_build_object('row',rowno,'field','Dữ liệu dòng','message','Tương tự bản ghi '||other.code,'id',other.id));
   end loop;
   if r.received_at>now() or r.completed_at>now() then warnings:=warnings||jsonb_build_array(jsonb_build_object('row',rowno,'field','Thời gian','message','Có thời gian nghiệp vụ trong tương lai.'));end if;
  exception when others then
   errors:=errors||jsonb_build_array(jsonb_build_object('row',coalesce(rowno,0),'field','Dữ liệu dòng','message',sqlerrm));
  end;
 end loop;
 return jsonb_build_object('errors',errors,'warnings',warnings,'token',encode(extensions.digest(p_rows::text||names::text||warnings::text,'sha256'),'hex'));
end;$$;
revoke all on function private.validate_care_import(jsonb) from public,anon,authenticated;

create function public.validate_care_log_import(p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.can_write_care_logs() then raise exception 'Không có quyền nhập Nhật ký CSKH.' using errcode='42501';end if;
 return private.validate_care_import(p_rows);
end;$$;
create function public.commit_care_log_import(p_rows jsonb,p_request_id uuid,p_file_name text,p_token text,p_template_version text default '1')
returns jsonb language plpgsql security definer set search_path='' as $$
declare batch private.care_log_import_batches; validation jsonb; payload_hash text; item jsonb; r public.care_logs;
begin
 if not private.can_write_care_logs() then raise exception 'Không có quyền nhập Nhật ký CSKH.' using errcode='42501';end if;
 if p_request_id is null or p_file_name is null or length(p_file_name) not between 1 and 240 or p_template_version<>'1' or p_template_version is null then raise exception 'Thông tin đợt nhập không hợp lệ.';end if;
 payload_hash:=encode(extensions.digest(p_rows::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text,0));
 select * into batch from private.care_log_import_batches where imported_by=auth.uid() and request_id=p_request_id;
 if found then
  if batch.payload_hash<>payload_hash then raise exception 'Mã yêu cầu đã được dùng với dữ liệu khác.';end if;
  return jsonb_build_object('id',batch.id,'count',batch.row_count,'replayed',true);
 end if;
 -- Catalog writes cannot race the validation and insertion in this transaction.
 lock table public.departments,public.staff,public.systems,public.categories in share mode;
 validation:=private.validate_care_import(p_rows);
 if jsonb_array_length(validation->'errors')>0 or p_token is distinct from validation->>'token' then return jsonb_build_object('review',validation);end if;
 insert into private.care_log_import_batches(imported_by,file_name,template_version,row_count,request_id,payload_hash)
 values(auth.uid(),p_file_name,p_template_version,jsonb_array_length(p_rows),p_request_id,payload_hash) returning * into batch;
 for item in select value from jsonb_array_elements(p_rows) loop
  r:=jsonb_populate_record(null::public.care_logs,item);
  insert into public.care_logs(request_type,description,response_content,notes,system_id,category_id,receiving_department_id,receiving_staff_id,coordinating_department_id,coordinating_staff_id,status,received_at,completed_at,entry_source,import_batch_id,import_row_number)
  values(r.request_type,r.description,coalesce(r.response_content,''),coalesce(r.notes,''),r.system_id,r.category_id,r.receiving_department_id,r.receiving_staff_id,r.coordinating_department_id,r.coordinating_staff_id,r.status,r.received_at,r.completed_at,'excel_import',batch.id,(item->>'row')::integer);
 end loop;
 return jsonb_build_object('id',batch.id,'count',batch.row_count,'replayed',false);
end;$$;
create function public.get_care_log_import_result(p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.can_write_care_logs() then raise exception 'Không có quyền nhập Nhật ký CSKH.' using errcode='42501';end if;
 return (select jsonb_build_object('id',id,'count',row_count) from private.care_log_import_batches where request_id=p_request_id and imported_by=auth.uid());
end;$$;
create function public.care_log_import_batches() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_read_care_logs() then raise exception 'Không có quyền đọc Nhật ký CSKH.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(row_to_json(b)) from (select id,imported_at,imported_by,file_name,row_count from private.care_log_import_batches order by imported_at desc limit 100) b),'[]');
end;$$;
revoke all on function public.search_care_logs(jsonb,jsonb,integer,timestamptz),public.care_log_counts(),public.validate_care_log_import(jsonb),public.commit_care_log_import(jsonb,uuid,text,text,text),public.get_care_log_import_result(uuid),public.care_log_import_batches() from public,anon;
grant execute on function public.search_care_logs(jsonb,jsonb,integer,timestamptz),public.care_log_counts(),public.validate_care_log_import(jsonb),public.commit_care_log_import(jsonb,uuid,text,text,text),public.get_care_log_import_result(uuid),public.care_log_import_batches() to authenticated,service_role;
notify pgrst,'reload schema';
