-- Chat CSKH: quyền do Admin cấp, đồng bộ sang sổ đăng ký nhân viên của Chat Gateway (admin-users).
-- Supabase không lưu nội dung chat. authenticated chỉ có SELECT trên app_users (001), nên chỉ service_role ghi các cột này.
alter table public.app_users add column chat_access text not null default 'none'
 check(chat_access in ('none','read','agent','supervisor'));
alter table public.app_users add constraint viewer_chat_read_only check(role<>'viewer' or chat_access in ('none','read'));
alter table public.app_users add column chat_synced_at timestamptz;
alter table public.app_users add column chat_sync_error text check(chat_sync_error is null or length(chat_sync_error)<=300);
