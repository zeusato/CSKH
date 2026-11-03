# Kết quả kiểm thử · 12/09/2026

## Bản triển khai tại thời điểm 12/09/2026

Khi bàn giao, dùng [kết quả đối chiếu ngày 03/11/2026 và quy trình nghiệm thu](../handoff/README.md). Các số liệu bên dưới là lịch sử kiểm thử.

Frontend React/Vite đã build và mở bằng production preview tại `http://127.0.0.1:4173`. Backend dùng project Supabase được cấu hình trong `.env`, region Singapore (`ap-southeast-1`). Đã áp dụng migration 001–016, triển khai `admin-users`, `storage-cleanup` và lịch dọn ảnh mỗi phút. Chưa phát hành frontend lên domain chính thức.

## Chức năng và quyền truy cập

- `database-security.json`: 15 kiểm tra quyền trực tiếp, RLS, phân mục đang sử dụng, thay đổi trạng thái, cập nhật đồng thời, ảnh riêng tư và dọn object sau khi xóa ticket.
- `final-integration.json`: 10 kiểm tra tích hợp trên bản tìm kiếm cuối, gồm phân trang qua nhiều mức ưu tiên không lặp/mất dòng, tìm không dấu, cập nhật chỉ mục, upload đồng thời, tài khoản khóa, tạo/reset User và recovery token.
- `search-security.json`: 7 kiểm tra sau migration 014. Anonymous bị từ chối; tài khoản khóa hoặc thiếu hồ sơ không đọc được; tham số giống SQL không vượt bộ lọc; sửa user metadata không cấp Admin; RLS nguồn vẫn bật.
- `storage-cleanup.json`: 4 kiểm tra hồi quy sau migration 015 bằng ảnh thật: quyền claim job, xóa metadata kèm enqueue, lỗi Storage giả lập có backoff, worker retry xóa object và kết thúc job. Chỉ timestamp retry của job tổng hợp được đưa về hiện tại để rút ngắn thời gian kiểm thử.
- `viewer-role.json`: 9 kiểm tra role Chỉ xem sau migration 016: Admin tạo/cấp role, đọc/tìm ticket và ảnh, chặn insert/update/delete trên toàn bộ bảng nghiệp vụ và upload Storage, chặn nâng quyền/Edge đặc quyền, đổi mật khẩu bản thân, đổi User ↔ Chỉ xem và khóa tài khoản với JWT cũ. Giao diện Chỉ xem không có nút tạo/sửa/xóa ticket, thêm/xóa ảnh hoặc quản trị tài khoản; vẫn có xuất Excel/PDF. Đã tạo PDF thành công từ giao diện khi đăng nhập Chỉ xem.
- `public-bundle.json`: quét bản build, không chứa các khóa đặc quyền đang cấu hình.
- Unit tests: 5/5 đạt. TypeScript và production build thành công. `npm audit --omit=dev`: không có advisory tại thời điểm kiểm tra.

Đã kiểm tra trên trình duyệt: đăng nhập/đăng xuất, bảng ticket, form tạo/sửa, thư viện, danh mục, quản lý tài khoản, ảnh tải lên từ máy, đổi theme và ghi nhớ sau reload, giao diện 390 px không tràn ngang. User không có mục quản trị tài khoản, không có nút xóa danh mục; mở trực tiếp `/users` được chuyển về ticket. Trạng thái mạng tạm thời không làm mất form đang nhập khi kiểm tra phiên nền lỗi.

## Excel và PDF

Excel xuất từ giao diện được đọc lại bằng openpyxl: các sheet `Ticket 1`, `Bộ lọc`, `Nội dung dài`; ô ngày là dữ liệu ngày; 36.610 ký tự mô tả được giữ nguyên khi nối phần nội dung dài.

PDF được tạo bằng chính module export của ứng dụng từ ticket Supabase và ảnh riêng tư. `pdf.json` xác nhận 19 trang, đầy đủ nội dung dài, header/footer và số trang trên mọi trang, không có glyph vượt khổ giấy. Trang đầu và phụ lục ảnh đã render và kiểm tra bằng mắt. Script tái tạo: `scripts/verify-pdf.mjs` (cần fixture kiểm thử còn tồn tại). Giao diện có liên kết **Tải PDF** sau khi tạo file để dùng khi trình duyệt chặn tải tự động.

## Hiệu năng tìm kiếm

Đơn vị: millisecond. Mỗi nhóm API có 60 mẫu qua 20 phiên User đồng thời (3 lượt), sau một truy vấn đầu tiên đo riêng. Mỗi nhóm SQL có 20 mẫu tuần tự sau tải API. Không flush cache database. Dữ liệu tổng hợp có nhiều từ khóa lặp; không phải dữ liệu nghiệp vụ thực. Chưa xác minh gói compute hay đo nhiều điều kiện mạng khác nhau.

| Tình huống | API p95 · 5.000 ticket | API p95 · 50.000 ticket | SQL p95 · 50.000 ticket |
|---|---:|---:|---:|
| Nhiều từ không dấu | 3.996 | 1.831 | 77 |
| Nội dung nghiệp vụ | 245 | 1.221 | 53 |
| Thư viện có lọc | 339 | 5.890 | 174 |
| Danh sách mới nhất | 178 | 227 | 14 |
| Từ khóa ngắn | 219 | 215 | 18 |

Không có lỗi trong 300 truy vấn API ở mỗi mốc. SQL tuần tự đạt mục tiêu ban đầu 300 ms, **API đồng thời chưa đạt mục tiêu 700 ms ở tất cả tình huống**. Lượt đầu sau import ở mốc 50.000 có truy vấn khoảng 5,6 giây. Không dùng số SQL tuần tự để khẳng định trải nghiệm dưới một giây khi tải cao. Biến thiên giữa hai lần đo cũng cho thấy cần kiểm thử dài hơn trên cấu hình và mạng vận hành thực tế.

Báo cáo chính: `search-benchmark-50000.json` và `search-benchmark-5000.json`; `search-benchmark.json` giữ bản 50.000 cuối. Các file `before`, `intermediate`, `experimental`, `invoker`, `gated-initial`, `gated-ranked` ghi lại thử nghiệm trước, không phải kết quả nghiệm thu bản cuối. Chạy lại benchmark chỉ trên development/staging; script tự dọn đúng dữ liệu của lần chạy.

Lõi tìm kiếm đã được chủ dự án duyệt dùng SECURITY DEFINER hẹp với guard tài khoản hoạt động. Bản cuối chia kết quả thành các mức ưu tiên và giới hạn số dòng đọc trước khi join danh mục. Không hạ quyền ghi/đọc chi tiết hoặc mở public dữ liệu để đổi lấy tốc độ.

## Những việc còn cần trước khi đưa vào vận hành

- Admin chính thức đã được người dùng tạo và xác minh đang hoạt động. Tài khoản kiểm thử cuối cùng đã được xóa khỏi cả Authentication và `app_users`; xem `test-account-removal.json`.
- Chọn hosting/domain HTTPS và cập nhật Auth redirect URL.
- Cấu hình SMTP; kiểm tra một email khôi phục thật tới hộp thư công ty. Luồng token đã được kiểm thử, chưa gửi email thật.
- UAT với CSKH; đo lại tải trên cấu hình vận hành và xử lý phần API p95 chưa đạt; thống nhất backup database và Storage.

Trạng thái backend được ghi trong `deployment.json`; kết quả dọn fixture ở `cleanup.json`. Bước cleanup đã phát hiện và sửa lỗi trùng tên cột `path` trong hàm reconcile ở migration 015. Kiểm tra cả object Storage và hàng đợi sau dọn, cùng HTTP response của lịch chạy; không chỉ dựa vào trạng thái `succeeded` của cron (trạng thái này chỉ xác nhận đã gửi request). Chưa tiến hành diễn tập khôi phục backup hoặc nghiệm thu với người dùng thực.
