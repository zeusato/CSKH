alter table public.app_users drop constraint app_users_role_check;
alter table public.app_users add constraint app_users_role_check check(role in ('admin','user','viewer'));

-- Membership still governs reads. Only active Admin/User accounts can mutate
-- the shared workspace; role changes take effect with existing JWTs.
create function private.can_write_workspace() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_users where id=(select auth.uid()) and active and role in ('admin','user'));
$$;
revoke all on function private.can_write_workspace() from public,anon;
grant execute on function private.can_write_workspace() to authenticated,service_role;

do $$ declare table_name text; begin
 foreach table_name in array array['tickets','ticket_attachments','categories','departments','staff'] loop
  execute format('alter policy member_insert on public.%I with check ((select private.can_write_workspace()))',table_name);
  execute format('alter policy member_update on public.%I using ((select private.can_write_workspace())) with check ((select private.can_write_workspace()))',table_name);
 end loop;
 foreach table_name in array array['tickets','ticket_attachments'] loop
  execute format('alter policy member_delete on public.%I using ((select private.can_write_workspace()))',table_name);
 end loop;
end $$;

alter policy cskh_image_upload on storage.objects with check (
 bucket_id='ticket-images' and (select private.can_write_workspace()) and exists(
 select 1 from public.ticket_attachments a where a.path=storage.objects.name and a.state='pending')
);
-- Admin-only systems/catalog deletion/account administration remain unchanged.
-- Read policies and the gated search core intentionally include active viewers.
