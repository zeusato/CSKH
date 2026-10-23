-- Cờ bật/tắt phân hệ trên giao diện. Admin đổi trực tiếp (RLS); mọi tài khoản đang hoạt động được đọc.
-- chat_module mặc định tắt: phân hệ Chat chỉ hiện khi Admin bật, và chat-session từ chối cấp phiên khi cờ tắt.
create table public.feature_flags(
 key text primary key check(key ~ '^[a-z][a-z_]{1,62}$'),
 enabled boolean not null default false,
 updated_at timestamptz not null default now(),
 updated_by uuid references public.app_users(id) on delete set null
);
create function private.touch_feature_flag() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=now();new.updated_by:=auth.uid();return new;end $$;
create trigger touch_feature_flag before update on public.feature_flags for each row execute function private.touch_feature_flag();
alter table public.feature_flags enable row level security;
create policy flags_read on public.feature_flags for select to authenticated using ((select private.is_active_user()));
create policy flags_admin_update on public.feature_flags for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on public.feature_flags from public,anon,authenticated;
grant select on public.feature_flags to authenticated;
grant update(enabled) on public.feature_flags to authenticated;
grant all on public.feature_flags to service_role;
insert into public.feature_flags(key,enabled) values('chat_module',false);
