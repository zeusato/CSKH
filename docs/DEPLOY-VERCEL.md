# Đưa SHS CSKH lên Git và Vercel

Frontend chạy trên Vercel; dữ liệu, tài khoản, ảnh và Edge Functions tiếp tục chạy trên Supabase hiện tại. Bộ icon và ảnh chia sẻ đã có sẵn trong `public/`, không cần chạy công cụ tạo ảnh khi deploy.

## 1. Push mã nguồn

Yêu cầu Node 22; `.nvmrc` ghi phiên bản đã kiểm thử. Thư mục đã được khởi tạo Git với nhánh `main`. Tạo một repository riêng tư, trống trên dịch vụ Git, rồi chạy trong thư mục dự án:

```powershell
npm ci
npm run check:release
git add .
git diff --cached --stat
git commit -m "Prepare SHS CSKH for Vercel"
git remote add origin <URL-REPOSITORY-CUA-BAN>
git push -u origin main
```

Lưu ý trên máy hiện tại: `.git` được tạo bởi tài khoản sandbox nên Git của tài khoản Windows có thể báo `dubious ownership`. Cần hoàn tất bước bàn giao chủ sở hữu thư mục `.git` trước khi chạy các lệnh Git thông thường; việc này đang chờ chủ máy cho phép. Không ảnh hưởng mã nguồn hoặc build Vercel.

Thay `<URL-REPOSITORY-CUA-BAN>` bằng URL thật. `.env`, `.local`, `node_modules`, `dist`, cấu hình Vercel cục bộ và khóa riêng đã được bỏ qua trong Git. `check:git` kiểm tra danh sách file sẽ được đưa lên Git và phát hiện các khóa đặc quyền đang cấu hình; không tự stage/commit. GitHub Actions tự chạy test, build và kiểm tra file với khóa giả công khai, không cần Supabase secret trong CI.

## 2. Import vào Vercel

Chọn **Add New → Project**, import repository vừa push, để Root Directory là thư mục gốc. Chọn Node.js **22.x**. `vercel.json` đã khai báo Vite, `npm ci`, `npm run build` và output `dist`.

Nhập các biến trong Environment Variables:

| Biến | Giá trị | Bắt buộc |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | URL project từ `.env` hiện tại | Có |
| `VITE_SUPABASE_ANON_KEY` | Anon key hoặc publishable key từ `.env` | Có |
| `SITE_URL` | URL gốc HTTPS của domain chính, ví dụ `https://cskh.example.com` | Chỉ cần khi muốn chỉ định domain |

Hai biến `VITE_` là cấu hình công khai của trình duyệt; không dùng service-role key hoặc secret key ở đây. `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `DATABASE_URL` và thông tin bootstrap giữ trên máy quản trị/Supabase, không nhập vào frontend Vercel. Build sẽ chặn khi thiếu cấu hình hoặc phát hiện khóa đặc quyền đặt nhầm vào trường anon key.

Nếu chưa có custom domain, để trống `SITE_URL` và bật **Automatically expose System Environment Variables**. Build lấy domain production từ Vercel để tạo canonical và URL OG tuyệt đối. Khi gắn domain riêng, đặt `SITE_URL` theo domain đó và redeploy. Biến môi trường chỉ có hiệu lực với lần build tiếp theo. Xem [Vite trên Vercel](https://vercel.com/docs/frameworks/frontend/vite) và [biến môi trường của framework](https://vercel.com/docs/environment-variables/framework-environment-variables).

Nhấn **Deploy**. Các route ứng dụng được rewrite về `index.html`; asset có phần mở rộng được phục vụ trực tiếp, bao gồm font, ảnh và WASM dùng nén ảnh.

## 3. Cập nhật Supabase theo domain thật

Sau khi domain đã hoạt động, chạy **trên máy quản trị**, dùng `.env` hiện có Management access token:

```powershell
node --env-file=.env scripts/configure-auth-domain.mjs https://domain-thuc-te-cua-ban
```

Script cập nhật `site_url`, thêm chính xác `https://domain-thuc-te-cua-ban/reset-password` vào danh sách redirect hiện có và đọc lại để xác minh. Script không tạo tài khoản, không gửi email và không chạy migration.

Có thể thiết lập tương đương trong **Supabase → Authentication → URL Configuration**: Site URL là domain gốc và Redirect URLs có URL `/reset-password` tương ứng. Cần cấu hình SMTP để email khôi phục mật khẩu gửi được đến người dùng thực tế. Xem [cấu hình redirect của Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

Project Supabase hiện tại đã có migration và Admin chính thức. Không chạy lại bootstrap, benchmark hoặc bộ test database trên dữ liệu đang vận hành chỉ để deploy frontend. Preview dùng cùng Supabase sẽ đọc/ghi cùng dữ liệu thật nếu đăng nhập; dùng project staging riêng nếu cần thử các thay đổi dữ liệu.

## 4. Kiểm tra sau deploy

- Mở trực tiếp và tải lại `/tickets`, `/library`, `/catalogs`, `/account`; Admin kiểm tra thêm `/users`.
- Đăng nhập bằng tài khoản đã có; xác nhận danh sách ticket, ảnh, xuất PDF và Excel hoạt động.
- Mở `/favicon.ico`, `/apple-touch-icon.png`, `/site.webmanifest` và `/og/shs-cskh.jpg`. Ảnh OG phải là JPEG 1200 × 630.
- Xem source HTML: `og:url`, `og:image`, `twitter:image` và canonical dùng domain HTTPS thật. Không còn `__SITE_ORIGIN__` hoặc `localhost`.
- Kiểm tra luồng khôi phục mật khẩu sau khi đã cấu hình SMTP và redirect.
- Chia sẻ link production để xem ảnh OG. Nếu bị Vercel Deployment Protection chặn ở cấp hosting thì bot cũng không đọc được ảnh chia sẻ. Dữ liệu nghiệp vụ vẫn yêu cầu Supabase Auth và RLS; metadata chỉ chứa thông tin thương hiệu chung. HTML có `noindex` để đề nghị công cụ tìm kiếm không lập chỉ mục.

Ảnh preview có thể bị nền tảng chat cache sau khi thay; cập nhật ảnh cần deploy lại và chờ cache được làm mới. Các header Vercel chỉ có hiệu lực khi deploy, không được mô phỏng bởi `vite preview`.

## Cập nhật sau này

Chạy `npm run check:release`, commit và push; Vercel triển khai từ Git. Mỗi thay đổi schema/Edge Function vẫn cần bước triển khai Supabase riêng. Hướng dẫn vận hành chi tiết tại [OPERATIONS.md](OPERATIONS.md).

Nguồn và cách tái tạo bộ nhận diện tại [brand/README.md](brand/README.md).
