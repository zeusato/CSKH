# SHS · Không gian CSKH

Ứng dụng nội bộ cho CSKH ghi nhận, theo dõi và tra cứu lời giải từ ticket. Tất cả thành viên CSKH dùng chung kho ticket. Nhân sự của các bên xử lý là danh bạ, không cần tài khoản ứng dụng.

## Chạy ứng dụng

Yêu cầu Node.js 22.18+.

```powershell
npm ci
npm run dev
```

Trong máy Windows hiện tại, nếu shim `npm.ps1` lỗi, dùng:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

Ứng dụng mở ở http://127.0.0.1:5173. Bản production preview dùng `npm run build` rồi `npm run preview -- --port 4173`.

## Cấu hình

Sao chép `.env.example` thành `.env`. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CHAT_GATEWAY_URL` và `VITE_CHAT_KEEPALIVE_ENABLED` là cấu hình public được phép vào frontend. Service-role key, Management token và mật khẩu PostgreSQL chỉ dùng bởi script/Edge Functions; không đặt tiền tố `VITE_` cho chúng.

```powershell
npm run db:inspect
npm run db:migrate
node --env-file=.env scripts/deploy-functions.mjs
```

Migration có checksum để tránh chạy lại hoặc sửa âm thầm lịch sử đã áp dụng. Có thể chạy SQL bằng `SUPABASE_ACCESS_TOKEN` hoặc `DATABASE_URL`.

## Tài khoản đầu tiên

Điền `ADMIN_EMAIL` và `ADMIN_NAME` trong `.env`, sau đó:

```powershell
npm run bootstrap
```

Mật khẩu ngẫu nhiên lưu ở `.local/admin-credentials.txt`, không được đưa vào Git. Đổi mật khẩu sau khi đăng nhập. Chỉ chạy bootstrap khi có người quản trị được chỉ định. Tài khoản kiểm thử dùng địa chỉ `example.test` không phải tài khoản bàn giao.

Admin có thể tạo/sửa/khóa tài khoản, đặt lại mật khẩu, quản lý hệ thống và xóa danh mục chưa được sử dụng. Thành viên thường tạo/sửa/xóa ticket và tạo/sửa phân mục, phòng ban, nhân sự. Các quyền được thực thi ở database và server, không chỉ ở nút giao diện.

Role **Chỉ xem** (`viewer`) dành cho người được cấp quyền tra cứu: xem mọi ticket, thư viện, danh mục, ảnh và xuất Excel/PDF; được tự đổi/khôi phục mật khẩu. Không được tạo/sửa/xóa dữ liệu hoặc quản lý tài khoản. Admin chọn **Chỉ xem** khi tạo hoặc sửa tài khoản. Đổi từ User sang Chỉ xem chặn quyền ghi ngay trên database với cả JWT cũ; giao diện cập nhật theo lần kiểm tra hồ sơ nền (tối đa khoảng 30 giây khi tab đang mở).

## Các chức năng

- **Chat khách hàng**: phân hệ riêng tại `/chat`, nối Chat Gateway. Pool chung, thấy ai đang chăm sóc khách, nhận/tham gia/chuyển hội thoại, ghi chú nội bộ, realtime. Quyền Không truy cập / Chỉ xem / Nhân viên / Giám sát; Admin cũng phải được bật. Xem **[docs/CHAT.md](docs/CHAT.md)**.

- **Nhật ký CSKH**: phân hệ riêng với ticket/thư viện; dùng chung danh mục hệ thống, phòng ban và nhân sự. Có quyền Không truy cập / Chỉ xem / Chỉnh sửa, tìm kiếm không dấu, bộ lọc, xuất Excel/PDF, tải mẫu và import Excel có xem trước. Cần áp dụng migration 019 và triển khai bản `admin-users` mới trước khi sử dụng. Xem [hướng dẫn Nhật ký CSKH](docs/CARE-LOGS.md) và [kết quả kiểm thử nâng cấp](docs/validation/care-logs.md).

- Tạo/sửa/xóa ticket; số ticket, người tạo, thời gian tạo và hoàn thành tự ghi bởi database.
- Trạng thái Tiếp nhận / Đang xử lý / Đã xử lý / Đã hủy. Mở lại ticket sẽ xóa thời điểm hoàn thành.
- Thư viện hiển thị trực tiếp ticket đã xử lý; tra cứu tiêu đề, mô tả và kết quả không phân biệt dấu tiếng Việt.
- Bộ lọc theo trạng thái, hệ thống, phân mục, bên xử lý và khoảng ngày; phân trang cursor, lưu bộ lọc trong URL.
- Ảnh PNG/JPG/WebP, tối đa 10 ảnh/ticket và 10 MB/ảnh. Upload bằng chọn file, kéo thả hoặc dán từ clipboard. Bucket riêng tư, link đọc hết hạn sau 5 phút.
- Xuất Excel toàn bộ kết quả đã lọc bằng Web Worker. Các ô dài được giữ đầy đủ trong trang tính `Nội dung dài`. Ngày giờ dùng múi giờ Việt Nam.
- Xuất PDF A4 có logo, font tiếng Việt, header/footer/số trang, nội dung nhiều trang và phụ lục ảnh.
- Giao diện sáng mặc định, chuyển tối có ghi nhớ; responsive, hỗ trợ bàn phím và giảm chuyển động.

## Kiểm thử

```powershell
npm test
npm run test:care-db
npm run test:chat-db
npm run build
npm run db:test
node --env-file=.env scripts/benchmark.mjs
```

`db:test` tạo tài khoản và dữ liệu kiểm thử có nhãn. Thông tin cleanup nằm trong `.local/test-state.json`. Nếu chạy lại, lưu lại state cũ trước để không mất danh sách cần dọn. `benchmark` tạo 50.000 ticket tổng hợp rồi xóa đúng prefix của lần chạy trong `finally`; chỉ chạy trên project phát triển/staging. Không chạy benchmark trên production. Báo cáo nằm trong `docs/validation`.

## Triển khai

Đã cấu hình Vercel: Node 22, cài dependency từ lockfile, build Vite, rewrite đường dẫn ứng dụng, cache và bộ icon/OG. Xem **[hướng dẫn push Git và deploy Vercel](docs/DEPLOY-VERCEL.md)** để triển khai theo từng bước.

Backend đang dùng Supabase Auth, PostgreSQL, Storage và hai Edge Functions. Project hiện tại đã có schema và Admin chính thức. Khi có domain frontend, chạy `node --env-file=.env scripts/configure-auth-domain.mjs https://domain-cua-ban` để cập nhật riêng URL đăng nhập/khôi phục mật khẩu. Không cần chạy lại bootstrap hoặc triển khai lại Edge Functions cho việc đổi domain.

Xem [hướng dẫn vận hành](docs/OPERATIONS.md) và [kế hoạch](PLAN.md).

Xem [kết quả kiểm thử và những phần còn cần khi đưa vào vận hành](docs/validation/README.md). Các chức năng đã kết nối Supabase thật; Admin chính thức đã có và tài khoản kiểm thử đã được xóa. SMTP, domain và nghiệm thu hiệu năng tải cao vẫn cần được hoàn tất trước rollout.


Giữ ấm Chat Server trước login: [docs/chat-keepalive.md](docs/chat-keepalive.md). VITE_CHAT_GATEWAY_URL và VITE_CHAT_KEEPALIVE_ENABLED là cấu hình public bổ sung, không chứa secret.
