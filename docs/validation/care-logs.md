# Kiểm chứng nâng cấp Nhật ký CSKH

Ngày: 17/09/2026.

## Đã triển khai trong mã nguồn

- Route `/care-logs`, menu theo quyền, danh sách, bộ lọc, tìm kiếm, cursor, tạo/sửa/xóa và chi tiết.
- Quyền riêng `none/read/write` trong quản lý tài khoản và Edge Function `admin-users`; Viewer không có quyền ghi; Admin có toàn quyền.
- Migration `019_care_logs.sql`: dữ liệu tách khỏi ticket, guard/RLS, bảo vệ audit và danh mục, version, tìm kiếm, đợt nhập và RPC import.
- Mẫu XLSX v1 với 13 cột và danh mục, worker parse, kiểm tra ZIP/dung lượng, preview, lỗi/cảnh báo, xác nhận nhập, revalidation và request ID chống gửi lặp.
- Excel toàn bộ kết quả lọc với nội dung dài; PDF chi tiết A4 tiếng Việt.

## Kết quả kiểm thử

| Kiểm tra | Kết quả | Giới hạn bằng chứng |
|---|---|---|
| `npm test` | 52 kiểm thử đạt trong 13 file | Có mock transport/Auth, workbook/PDF được tạo thật; bổ sung lỗi nhân sự khác bộ phận, ngày dd/mm/yyyy và file cũ có giờ. |
| `npm run test:care-db` | 21 kiểm tra đạt | PostgreSQL bằng PGlite với schema Auth/danh mục tối thiểu mô phỏng Supabase; không phải project Supabase live. |
| `npm run build` | TypeScript, Vite và kiểm tra tài nguyên tĩnh đạt | Có cảnh báo kích thước chunk chính/font PDF; chức năng nhật ký tải qua route riêng, Excel xử lý ở worker. |
| `npm run test:care-ui` | 24 nhóm kiểm tra đạt trên Chromium, bản dev hiện tại; 11 nhóm trước đó đạt trên production preview | Request Supabase được giả lập; bao gồm lỗi theo dòng, định dạng ngày, modal 390px, mở cả dòng, Sửa/Xóa trực tiếp, quyền Viewer và tự làm mới sau import khi đang có bộ lọc cũ. |
| PDF | File 5 trang đã đọc lại, render trang đầu/cuối và kiểm tra trực quan | Dữ liệu tổng hợp, không phải dữ liệu khách hàng. |
| Excel | Template/report tải từ trình duyệt, workbook mở lại được; ngày Việt Nam, formula escaping, nội dung dài được kiểm chứng | File XLSX, chưa nghiệm thu thủ công trên các phiên bản Microsoft Excel của người dùng. |

Chi tiết máy đọc: [care-log-database.json](care-log-database.json), [care-log-ui.json](care-log-ui.json).

Kiểm tra database đã cố ý phát sinh lỗi ở lần insert thứ hai để xác nhận không còn dòng đầu hoặc metadata đợt sau rollback. Kiểm tra retry cùng request ID không tạo lại; request ID cũ với payload khác bị từ chối. Thay đổi tên danh mục sau preview buộc kiểm tra lại.

Một lần đo local: validate và commit 1.000 dòng tổng hợp khoảng 1,5 giây. Đây là số đo PGlite đơn phiên, không phải SLA hoặc số đo tải đồng thời Supabase. Chưa nghiệm thu p95 trên cấu hình vận hành.

Ảnh kiểm tra giao diện và PDF cùng workbook tổng hợp nằm trong `.local/care-qa/` (không đưa vào Git). Không tạo dữ liệu kiểm thử trên production.

## Trạng thái triển khai ngoài máy

**Đã áp dụng migration `019_care_logs.sql` và deploy Edge Function `admin-users` lên Supabase ngày 17/09/2026.**

- Thực hiện qua Dashboard bằng phiên Supabase đã đăng nhập trên Chrome, đúng project `houwqcjbfhfjnzutihxu`. Kết nối trực tiếp từ máy vẫn không có đường IPv6 (`ENETUNREACH`); không thay đổi mật khẩu hay tắt xác minh TLS.
- Kiểm tra lịch sử: migration 001–018 đã có; 019 là migration mới duy nhất còn thiếu. Chạy toàn bộ 019 và ghi lịch sử trong cùng transaction, có giới hạn thời gian chờ khóa và câu lệnh.
- Checksum 019 đã lưu: `5e52e296fa10303103d2cd24ef1ea1d2cbb7bcd19d564076e64fead5083c7566`. Đã phát lệnh reload schema cache.
- API xác nhận bảng `care_logs`, cột `app_users.care_log_access` truy cập được và cả 6 RPC mới xuất hiện trong OpenAPI. RPC từ chối yêu cầu không gắn với tài khoản có quyền bằng `42501`, thay cho lỗi không tìm thấy hàm `PGRST202`.
- Giao diện local đang dùng Supabase thật, với phiên Admin hiện có, tải được danh sách và bộ đếm trạng thái (0 bản ghi), không còn lỗi schema. Không ghi dữ liệu nhập thử vào production.
- `admin-users` đã được deploy bằng mã nguồn hiện tại; Dashboard xác nhận thời điểm cập nhật mới. Kiểm tra POST không có phiên đăng nhập trả `401` / `Cần đăng nhập.`. Cấu hình xác thực của function được giữ nguyên.
- Chưa kiểm thử ghi/import thật trên production hoặc phát hành lại frontend Vercel trong lượt sửa schema này.

Lưu ý vận hành: checksum migration cũ `011_stable_invoker_search.sql` trên database khác file hiện có trong repo. Không sửa lịch sử hoặc chạy lại migration cũ để xử lý tính năng này; cần đối chiếu bản gốc trước lần chạy toàn bộ `npm run db:migrate` tiếp theo. Các migration 001–010 và 012–018 khớp checksum.

Không coi bản build local hoặc mock UI là bằng chứng tính năng đã hoạt động trên website đang vận hành. Không sửa/xóa dữ liệu production để thử nghiệm.
