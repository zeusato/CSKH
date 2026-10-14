-- Optional account/user identifier. Text preserves leading zeroes and usernames.
-- Existing records and older clients/templates default to an empty account.
alter table public.care_logs add column account_user text not null default ''
 constraint care_logs_account_user_length check(length(account_user)<=255);
comment on column public.care_logs.account_user is 'Số tài khoản/user phát sinh issue, văn bản tối đa 255 ký tự';
grant insert(account_user),update(account_user) on public.care_logs to authenticated;

create or replace function private.care_log_before_write() returns trigger language plpgsql set search_path='' as $$
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
 new.account_user:=trim(coalesce(new.account_user,''));
 new.search_text:=private.normalize_text(new.description||' '||new.response_content||' '||new.notes||' '||new.account_user);
 new.search_vector:=to_tsvector('simple'::regconfig,new.search_text);
 return new;
end;$$;

create or replace function private.validate_care_import(p_rows jsonb) returns jsonb language plpgsql set search_path='' as $$
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
   if exists(select 1 from jsonb_object_keys(item) k where k not in ('row','account_user','request_type','description','response_content','notes','system_id','category_id','receiving_department_id','receiving_staff_id','coordinating_department_id','coordinating_staff_id','status','received_at','completed_at')) then raise exception 'Dữ liệu chứa cột không được phép.';end if;
   if item ? 'account_user' and jsonb_typeof(item->'account_user') not in ('string','null') then raise exception 'Số tài khoản/user phải là văn bản.';end if;
   r:=jsonb_populate_record(null::public.care_logs,item);
   r.account_user:=trim(coalesce(r.account_user,''));
   if length(r.account_user)>255 then raise exception 'Số tài khoản/user tối đa 255 ký tự.';end if;
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
   fingerprint:=md5(jsonb_build_array(r.request_type,private.normalize_text(trim(r.description)),r.received_at,r.receiving_department_id,r.receiving_staff_id,r.account_user)::text);
   if fingerprint=any(seen) then warnings:=warnings||jsonb_build_array(jsonb_build_object('row',rowno,'field','Dữ liệu dòng','message','Có dòng tương tự trong file.'));end if;
   seen:=array_append(seen,fingerprint);
   for other in select id,code from public.care_logs c where c.request_type=r.request_type and c.account_user=r.account_user and c.received_at=r.received_at and c.receiving_department_id=r.receiving_department_id and c.receiving_staff_id is not distinct from r.receiving_staff_id and private.normalize_text(trim(c.description))=private.normalize_text(trim(r.description)) order by id limit 5 loop
    warnings:=warnings||jsonb_build_array(jsonb_build_object('row',rowno,'field','Dữ liệu dòng','message','Tương tự bản ghi '||other.code,'id',other.id));
   end loop;
   if r.received_at>now() or r.completed_at>now() then warnings:=warnings||jsonb_build_array(jsonb_build_object('row',rowno,'field','Thời gian','message','Có thời gian nghiệp vụ trong tương lai.'));end if;
  exception when others then
   errors:=errors||jsonb_build_array(jsonb_build_object('row',coalesce(rowno,0),'field','Dữ liệu dòng','message',sqlerrm));
  end;
 end loop;
 return jsonb_build_object('errors',errors,'warnings',warnings,'token',encode(extensions.digest(p_rows::text||names::text||warnings::text,'sha256'),'hex'));
end;$$;

create or replace function public.commit_care_log_import(p_rows jsonb,p_request_id uuid,p_file_name text,p_token text,p_template_version text default '1')
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
  insert into public.care_logs(account_user,request_type,description,response_content,notes,system_id,category_id,receiving_department_id,receiving_staff_id,coordinating_department_id,coordinating_staff_id,status,received_at,completed_at,entry_source,import_batch_id,import_row_number)
  values(trim(coalesce(r.account_user,'')),r.request_type,r.description,coalesce(r.response_content,''),coalesce(r.notes,''),r.system_id,r.category_id,r.receiving_department_id,r.receiving_staff_id,r.coordinating_department_id,r.coordinating_staff_id,r.status,r.received_at,r.completed_at,'excel_import',batch.id,(item->>'row')::integer);
 end loop;
 return jsonb_build_object('id',batch.id,'count',batch.row_count,'replayed',false);
end;$$;

notify pgrst,'reload schema';
