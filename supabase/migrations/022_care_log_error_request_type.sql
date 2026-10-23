-- "Lỗi" is a request classification, not a shared category/system catalog item.
alter table public.care_logs drop constraint care_logs_request_type_check;
alter table public.care_logs add constraint care_logs_request_type_check
 check(request_type in ('support','error','complaint','feedback'));

do $$ declare definition text; begin
 select pg_get_functiondef('private.validate_care_import(jsonb)'::regprocedure) into definition;
 if position('''support'',''complaint'',''feedback''' in definition)=0 then
  raise exception 'Unexpected care import validator: request type list not found';
 end if;
 execute replace(definition,'''support'',''complaint'',''feedback''','''support'',''error'',''complaint'',''feedback''');
end;$$;
notify pgrst,'reload schema';
