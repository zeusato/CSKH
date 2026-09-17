# Vận hành SHS CSKH

## Phạm vi

Phân hệ Nhật ký CSKH có bảng và quyền riêng, dùng chung danh mục hệ thống/phòng ban/nhân sự. Xem [hướng dẫn cấp quyền, sử dụng và import](CARE-LOGS.md), cùng [trạng thái nâng cấp thực tế](validation/care-logs.md). Nhật ký đã xử lý không tự xuất hiện trong thư viện ticket.

CSKH tự ghi nhận và cập nhật trạng thái dựa trên trao đổi thực tế qua Zalo/các kênh nội bộ. Ứng dụng không tự lấy tin nhắn Zalo, không gửi thông báo cho bên xử lý, không xác nhận kết quả từ hệ thống ngoài, không tính SLA.

## Tài khoản và mật khẩu

Ba vai trò: **Admin** quản trị tài khoản và dữ liệu; **User** làm việc với ticket và tạo/sửa danh mục trong phạm vi đã quy định; **Chỉ xem** (`viewer`) chỉ đọc kho ticket dùng chung, tra cứu, xem ảnh, xuất Excel/PDF và đổi mật khẩu bản thân. Người ngoài đội CSKH có thể được Admin cấp Chỉ xem, không có thao tác thay đổi dữ liệu. Cấp/đổi tại **Tài khoản → Tạo tài khoản/Chỉnh sửa → Vai trò**.

1. Admin tạo tài khoản ở **Tài khoản → Tạo tài khoản**, nhập email, tên, phòng ban, vai trò và mật khẩu ban đầu.
2. Gửi mật khẩu qua kênh nội bộ phù hợp. Thành viên tự đổi ở **Tài khoản của bạn**.
3. Khi thành viên không còn sử dụng, khóa tài khoản. RLS đọc trạng thái hiện hành trong database, nên JWT cũ cũng không đọc được dữ liệu.
4. Mật khẩu quên có thể được Admin đặt lại. Chức năng tự khôi phục qua email cần SMTP được cấu hình trên Supabase để gửi tới email công ty trong môi trường vận hành.
5. Không tự đăng ký tài khoản. Có kiểm tra giữ ít nhất một Admin hoạt động.

Supabase Dashboard → Authentication → Email/SMTP để cấu hình nhà cung cấp SMTP và địa chỉ gửi được công ty cho phép. Không coi việc gọi API reset thành công là bằng chứng email đã được gửi tới hộp thư. Cần nghiệm thu một email thật sau khi cấu hình SMTP; chưa gửi email thật trong kiểm thử tự động.

## Dọn ảnh

- Xóa ticket hoặc ảnh sẽ ghi đường dẫn vào `private.storage_gc_jobs` trong cùng transaction xóa metadata.
- `storage-cleanup` gọi Storage API để xóa object và xác nhận công việc; có retry/backoff khi Storage lỗi.
- Lịch `cskh-storage-cleanup` chạy mỗi phút bằng pg_cron/pg_net. Token riêng của worker nằm trong Vault và secrets của Edge Functions, không nằm trong mã frontend.
- Metadata upload dở quá 24 giờ được dọn. Object không còn metadata và đã tồn tại quá một giờ sẽ được đưa vào hàng đợi xóa; khoảng chờ bảo vệ upload đang hoàn tất.
- Link ảnh đã ký vẫn có hiệu lực tới khi hết hạn hoặc object đã được xóa. Ứng dụng cấp link tối đa 5 phút.

Kiểm tra khi cần:

```sql
select jobname, schedule, active from cron.job where jobname='cskh-storage-cleanup';
select count(*) as pending, min(created_at) as oldest from private.storage_gc_jobs;
select id, attempts, available_at, last_error from private.storage_gc_jobs order by id limit 50;
```

Không xóa trực tiếp dòng `storage.objects` bằng SQL. Object phải được xóa qua Storage API.

## Tìm kiếm và RLS

`public.search_tickets` là wrapper `SECURITY INVOKER`, gọi duy nhất lõi đọc `private.search_shared_tickets` với `SECURITY DEFINER`. Lõi này kiểm tra tài khoản CSKH đang hoạt động bằng `auth.uid()` và dữ liệu hiện hành **trước khi đọc ticket**. Tài khoản bị khóa nhận kết quả rỗng ngay cả khi JWT cũ còn hạn. Anonymous không được gọi hàm. Phương án này đã được chủ dự án duyệt trong quá trình triển khai.

Title, description, resolution được chuẩn hóa bỏ dấu. Các từ tìm kiếm kết hợp theo AND và hỗ trợ tiền tố. Ưu tiên mã ticket chính xác, tiếp theo tiêu đề, cuối cùng nội dung. Nếu tìm theo token không có kết quả thì thử chuỗi con dài ít nhất 3 ký tự.

Quá trình đo phát hiện toán tử full-text không luôn được PostgreSQL đẩy qua RLS để dùng GIN. Lõi tìm kiếm được giới hạn ở tập ticket dùng chung của CSKH, chỉ trả các trường phục vụ danh sách và trích đoạn. Hàm có `search_path` cố định, tên cột từ danh sách cho phép và giá trị tham số được quote; không nhận danh tính hay câu SQL từ client. RLS vẫn áp dụng cho đọc chi tiết, thêm/sửa/xóa, danh mục, tài khoản và Storage. Chỉ mục từ tiêu đề thử nghiệm đã được gỡ ở migration 012; dữ liệu ticket được giữ nguyên.

Đây là ranh giới quyền có chủ đích: mọi tài khoản được cấp quyền và đang hoạt động, kể cả Chỉ xem, được đọc mọi ticket. Quyền ghi kiểm tra riêng bằng `private.can_write_workspace()`, chỉ cho Admin/User hoạt động. Nếu sau này phân quyền ticket theo nhóm hoặc người dùng, phải sửa cả guard/lõi tìm kiếm cùng các policy trước khi đưa quy tắc mới vào dùng.

Tham khảo [PostgreSQL: Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html). Báo cáo đo lưu phiên bản, tải đồng thời, role và dữ liệu tổng hợp trong `docs/validation/search-benchmark.json`. Chi phí lần đầu đọc dữ liệu và cấu hình gói Supabase cần được đánh giá riêng trước rollout toàn đội.

## Cập nhật và sao lưu

- Chạy migration trên staging trước. Không sửa nội dung file migration đã chạy; tạo file kế tiếp.
- Khi triển khai Edge Functions, chạy `scripts/deploy-functions.mjs`; script đặt lại token worker trong cả Vault và Edge secrets.
- Dùng backup/PITR phù hợp với gói Supabase của công ty. Backup database không thay thế bản sao object Storage; cần quy trình backup ảnh riêng nếu công ty yêu cầu khôi phục.
- Xuất Excel là báo cáo theo bộ lọc và cutoff tạo ticket; không phải snapshot transaction khi nhiều người đang sửa/xóa đồng thời. Không xuất URL ký riêng tư vào file.
- Kiểm tra Auth redirect URL và SMTP khi đổi domain. Chỉ đưa hai biến public vào cấu hình build frontend.

## Những phần cần quyết định khi đưa vào dùng chính thức

- Admin chính thức đã được tạo; tài khoản kiểm thử đã được xóa khỏi Authentication và `app_users`.
- Domain/hosting frontend và quy trình HTTPS.
- SMTP gửi email khôi phục, cùng thời hạn lưu dữ liệu/backup theo chính sách công ty.
- UAT bằng tình huống thực tế của CSKH. Các ticket kiểm thử phải được dọn trước khi nhập dữ liệu thật.
