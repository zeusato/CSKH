# Bàn giao SHS CSKH cho CNTT

**Mốc rà soát 03/11/2026 · source ứng dụng `8ccef18` · migration 001–025.** Hướng dẫn này dùng cho việc chuyển cả ứng dụng và dữ liệu về hạ tầng công ty. CNTT có thể diễn tập trên một Supabase tự quản, sau đó thay đăng nhập bằng IdP và hệ thống nhân sự công ty. Server, DNS và IdP đích chưa được cung cấp. Tài liệu này ghi điều kiện nghiệm thu để CNTT quyết định thời điểm mở hệ thống.

## 1. Kết quả rà soát và phạm vi bàn giao

| Đã kiểm | Kết quả |
|---|---|
| Mã nguồn và schema | Chạy lần lượt cả 25 file trên PGlite mới, với bảng Auth/Storage và vai trò Supabase mô phỏng. Tạo được 14 bảng, 162 cột và 22 tên hàm trong `public`. |
| Project nguồn | GET OpenAPI qua PostgREST trả đúng tập tên bảng/cột trên và có endpoint cho cả 22 tên hàm. Auth Admin API phản hồi HTTP 200. Storage API xác nhận `ticket-images` private, giới hạn 10 MiB. Dòng `chat_module` có giá trị `false`. Không ghi lên nguồn. |
| Frontend | `npm test` đạt 163 test, bỏ qua 11 test tích hợp Gateway cần cấu hình riêng. `npm run build` và kiểm tra static asset đạt. Máy rà soát dùng Node 22.17.1, bản bàn giao dùng 22.18.0 theo `.nvmrc`. |
| Cần DBA xác nhận | Kết nối SQL trực tiếp từ máy rà soát không khả dụng, session pooler không xác thực thành công. Đối chiếu trên REST chỉ kiểm được tên, chưa xác minh trực tiếp ledger/checksum, thân hàm, RLS, trigger, sequence hay cron đang chạy trên nguồn. Chưa thực hiện dump/restore hoặc UAT trên hạ tầng công ty. |

**Mốc số lượng nguồn ngày 03/11.** REST trả 7 profile ứng dụng, 20 ticket, 22 dòng ảnh ticket, 1.951 nhật ký CSKH, 17 bài thư viện, 9 dòng ảnh thư viện, 0 cuộc gọi và 0 việc theo sau. Kiểm bằng anonymous key trên ticket và hai bảng nhật ký đều nhận HTTP 401. Số dòng ảnh ở hai bảng không phải số file vật lý vì path có thể dùng chung. Các số này lấy qua từng request; DBA phải chốt lại trong cửa sổ khóa ghi.

**Bộ giao nhận.** Chủ dự án cung cấp quyền clone repo riêng, SHA/tag bàn giao **bao gồm bộ tài liệu này**, quyền quản trị nguồn qua kênh nội bộ và đầu mối CSKH duyệt UAT. Nếu giao offline, tạo `git archive --format=zip -o ../cskh-source.zip <SHA-ban-giao>` từ commit đã chứa tài liệu và kiểm tra danh sách file trong ZIP. CNTT xác nhận nhận đủ `src/`, `public/` (font, icon), `scripts/`, `supabase/{migrations,functions}/`, lockfile, cấu hình build, `.env.example` và `docs/`. Bàn giao dump DB và object ảnh qua kho mã hóa riêng có hạn lưu giữ. Không đóng gói cả thư mục làm việc vì `.env` và `.local/` có thể chứa mật khẩu, khóa và dữ liệu thật.

**Phân công trước khi diễn tập.** Hạ tầng nhận DNS/TLS, proxy, container, volume, giám sát và backup. DBA nhận tài khoản SQL hợp lệ, quyền đọc source Storage, phiên bản Postgres/extensions, thời gian đóng ghi và biên bản đối soát. Đội IAM/HR nhận danh sách ánh xạ nhân sự đã duyệt và chịu trách nhiệm thu hồi quyền. CSKH chỉ định người thử mỗi vai trò và người duyệt mở ghi. Điền tên đầu mối, RPO/RTO, cửa sổ cutover và thời hạn giữ nguồn vào biên bản nội bộ.

## 2. Thành phần phải dựng

| Thành phần | Hợp đồng mà source đang sử dụng |
|---|---|
| Web | React/Vite SPA tĩnh ở gốc domain. Browser gọi API qua HTTPS. Không có ứng dụng Node server để chạy thay backend. |
| PostgreSQL và PostgREST | CRUD, RPC, quyền theo dòng (RLS), quyền cột, trigger audit và full-text search. Chỉ expose schema ứng dụng phù hợp (public), giữ private ngoài Data API. |
| Auth và Storage | Auth cấp phiên, `auth.uid()` trả UUID. Storage API upload/đọc ảnh bằng URL ký. Cả hai dùng JWT và quyền hiện hành trong DB. |
| Edge Runtime | Ba handler `admin-users`, `storage-cleanup`, `chat-session` cùng mã `_shared/`. Worker dọn ảnh cần scheduler riêng. |
| Chat Gateway | Repo/dịch vụ riêng giữ hội thoại, lịch sử và WebSocket. Chuyển DB CSKH không chuyển lịch sử Chat. Giữ tắt cả Chat và keepalive khi bàn giao. Nếu đưa Chat vào phạm vi triển khai, tiếp nhận riêng Gateway, kho dữ liệu, khóa, CORS và phục hồi phiên của nó. [Hợp đồng Chat](../CHAT.md). |

Dùng Docker Compose của Supabase, chọn release cố định, ghi tag/digest, phiên bản PostgreSQL và CLI trong biên bản. Dựng stack trống ở staging, dùng cùng major PG với nguồn nếu có thể và Auth/Storage tương thích, đặt volume bền vững cho DB và object store. Sinh mới signing keys, API keys, mật khẩu quản trị, khóa mã hóa và credential S3 cho từng môi trường. Đặt TLS, hostname API mà trình duyệt truy cập được, chỉ mở DB/Studio cho mạng quản trị. Kiểm tra health của Auth, REST, Storage và Edge qua proxy. Repo này chỉ chứa mã ứng dụng và khai báo function, không chứa Compose vận hành nền tảng. [Dựng Supabase tự quản](https://supabase.com/docs/guides/self-hosting/docker).

Nếu CNTT chỉ triển khai PostgreSQL thuần, cần xây và kiểm thử lớp API/JWT tương đương PostgREST, Storage ký URL, worker dọn ảnh và các Edge handler. Kế hoạch dưới đây giả định giữ các hợp đồng đó khi chuyển dữ liệu. [Thiết kế chuyển xác thực và nhân sự](AUTH-HR.md).

## 3. Chuyển database và object ảnh

**Diễn tập trước trên đích sạch và cách ly.** Từ máy DBA dùng direct connection hoặc session pooler do Dashboard Connect cung cấp, TLS verify-full với CA phù hợp. Xác nhận đúng project/DB ở cả hai đầu; các biến shell bên dưới được nạp qua secret manager. Với CLI, percent-encode phần credential trong URL. Chuẩn bị Docker, Supabase CLI, psql và rclone. Ghi lại phiên bản công cụ. Các lệnh là ví dụ Bash chạy trong thư mục backup hạn chế truy cập, ngoài Git.

1. Trước lần chuyển chính thức, chặn **mọi đường ghi** vào hệ cũ (tab cũ, REST/RPC, Storage upload, Auth admin, job nền), chờ request/upload đang chạy hoàn tất. Chỉ tắt web không khóa được REST. Tạm dừng cron và các đường gọi cleanup ở cả hai phía. Ghi lại thời điểm khóa và trạng thái job để có thể bật lại. Chạy bộ kiểm bên dưới ở nguồn và lưu biên bản tại thời điểm chốt.
2. Lấy ba bản SQL. Kiểm tra `supabase db dump --help` của CLI đã pin. Với CLI hỗ trợ `--db-url`:

```bash
set -eu
umask 077
psql -X "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -f "$REPO/docs/handoff/verify.sql" > source-check.txt
supabase db dump --db-url "$SOURCE_DB_URL" --role-only -f roles.sql
supabase db dump --db-url "$SOURCE_DB_URL" -f schema.sql
supabase db dump --db-url "$SOURCE_DB_URL" --data-only --use-copy -f data.sql
sha256sum roles.sql schema.sql data.sql > SHA256SUMS
```

3. DBA duyệt file trước khi nạp. Phải có DDL và dữ liệu ứng dụng ở `public`, `private`, ledger, sequence/identity, dòng danh tính Auth với UUID gốc, cùng định nghĩa bucket và các policy tùy biến trên `storage.objects`. CLI lọc schema nền tảng và hành vi tùy phiên bản. So quyền/owner/grant, policy với báo cáo nguồn. Nếu thiếu Auth data, export data-only các bảng Auth cần dùng theo bản Auth đích trong cùng cửa sổ khóa ghi. Nếu thiếu policy Storage, xuất định nghĩa hai policy `cskh_image_read` và `cskh_image_upload` theo catalog nguồn; bản cuối lần lượt đến từ migration 021 và 016. Bổ sung riêng phần thiếu rồi kiểm lại. Không bỏ dòng gây lỗi để ép restore qua. Lọc/duyệt mọi cron/Vault/config môi trường để đích không gọi ngược nguồn. Bảo vệ dump Auth như thông tin xác thực.
4. Trên **stack mới**, tạo trước extensions đúng schema, đặc biệt `pgcrypto`, `unaccent`, `pg_trgm` trong `extensions`. Đối chiếu phiên bản Auth/Storage và các role nền tảng `anon`, `authenticated`, `service_role`. Giữ dịch vụ đích cách ly đến khi kiểm đủ FK, quyền và ảnh. Kiểm SHA sau khi chuyển file. Chạy restore nguyên tử bằng tài khoản DBA đủ quyền:

```bash
sha256sum -c SHA256SUMS
psql -X "$TARGET_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -f roles.sql -f schema.sql -c 'SET session_replication_role = replica' -f data.sql
```

   Nếu lỗi phiên bản hoặc object đã tồn tại, dừng, sửa nguyên nhân và diễn tập lại trên đích sạch. Giai đoạn nạp data tắt trigger để bảo toàn audit và timestamp, vì vậy phải kiểm FK sau nạp. Với bản restore đầy đủ **không chạy lại 001–025 hoặc bootstrap Admin**. Bảng `private.cskh_migrations` phải theo dữ liệu nguồn. Trường hợp dựng DB trống *không nhận dump*, dùng `npm run db:migrate` với `DATABASE_URL` đích, `DATABASE_SSL_CA_FILE` khi cần và `VITE_SUPABASE_URL` hợp lệ. Runner kiểm SHA-256 từng file theo thứ tự, giao dịch riêng từng migration. Chỉ dùng runner cho migration mới sau khi DBA xác nhận baseline. [Restore từ Supabase Cloud](https://supabase.com/docs/guides/self-hosting/restore-from-platform) · [Tham số CLI](https://supabase.com/docs/reference/cli/supabase-db-dump).

5. Chuyển **byte ảnh** riêng. Cấu hình hai remote rclone `platform` và `self-hosted` bằng endpoint S3 của Storage, vùng và key của từng môi trường. Bucket đích `ticket-images` phải private, giới hạn 10485760 byte, cho JPEG/PNG/WebP. Giữ nguyên key đầy đủ, kể cả ảnh chỉ còn bài thư viện tham chiếu. Nếu bản restore đã có metadata, buộc gửi byte để rclone không bỏ qua object vì listing trùng. Sau copy, đọc lại nội dung để so:

```bash
rclone copy platform:ticket-images self-hosted:ticket-images --ignore-times
rclone size platform:ticket-images
rclone size self-hosted:ticket-images
rclone check platform:ticket-images self-hosted:ticket-images --download
```

   Kết quả cần khớp số object, tổng byte và không có file thiếu, thừa hay khác nội dung. Lưu manifest key/kích thước ở kho vận hành. Kiểm tra hai bảng attachment qua SQL và mở ảnh ký bằng tài khoản được phép. Link ký được cấp lại ở đích. Nếu lỗi, giữ cleanup tắt tới khi hoàn tất đối soát. Các script backup JSON/REST và Excel cũ chỉ bao phủ từng phân hệ. [Chuyển object qua S3](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3).

## 4. Schema và tiêu chí đối soát

| Quan hệ | Dữ liệu cần bảo toàn |
|---|---|
| `auth.users` → `public.app_users` | Chung UUID. Profile chứa phòng ban, active, vai trò và quyền từng phân hệ. Nhiều cột audit tham chiếu trực tiếp Auth. |
| `departments`, `staff`, `systems`, `categories` | Danh mục dùng chung. `staff.department_id` gắn nhân sự xử lý với phòng ban. Một dòng staff không cấp quyền đăng nhập. |
| `tickets`, `ticket_attachments` | Ticket gắn danh mục, trạng thái, số, phiên bản và audit. Ảnh gắn UUID ticket và path trong bucket. |
| `care_logs`, `private.care_log_import_batches` | Nhật ký có quan hệ tiếp nhận/phối hợp, thời gian lịch sử, batch và khóa chống import lặp. |
| `library_entries`, `library_attachments` | Snapshot độc lập theo `(source_type,source_id)`. Xóa nguồn vẫn giữ bài và path ảnh. UUID nguồn còn lưu dù bản ghi gốc đã xóa là hợp lệ. |
| `call_logs`, `call_followups`, `call_purposes`, `private.call_import_batches` | Chủ sở hữu và người nhận việc dùng `app_users`; người thực hiện cuộc gọi dùng `staff`. Giữ quan hệ cuộc gọi trước, phiên bản, lô import và số 0 đầu của điện thoại/TKCK. |
| `feature_flags`, `private.storage_gc_jobs`, `private.cskh_migrations` | Cờ Chat, hàng đợi dọn ảnh, lịch sử migration. Job cron/secret Vault của môi trường phải cấu hình riêng. |

DBA chạy [verify.sql](verify.sql) bằng psql trên hai DB khi còn khóa ghi, trước UAT. Lệnh đích tương tự bước 3.1, thay `SOURCE_DB_URL` bằng `TARGET_DB_URL` và ghi `target-check.txt`. So số dòng từng bảng, các nhóm quyền, tên và SHA-256 của ledger với file Git (`sha256sum supabase/migrations/*.sql`), các cột, constraint, index, trigger, RLS, grant, định nghĩa hàm và policy. Mọi FK mồ côi và tham chiếu ảnh thiếu metadata phải bằng 0. Đối chiếu `last_value/is_called` từng sequence và giá trị lớn nhất của `number` cho ticket, nhật ký, thư viện, cuộc gọi. So cả phân bố trạng thái và mẫu bản ghi nghiệp vụ theo UUID ở hai đầu qua kênh nội bộ. Xem xét riêng khác biệt hợp lệ về owner, phiên bản PG hoặc cron đích đang dừng. Chênh lệch không giải thích được là điều kiện dừng. [DDL theo phiên bản](../../supabase/migrations).

## 5. Cấu hình dịch vụ và phát hành web

1. **Edge Runtime.** Chép `admin-users/`, `storage-cleanup/`, `chat-session/` và `_shared/` từ `supabase/functions/` sang `volumes/functions/` của bản Compose. Giữ entrypoint/router `main/` của nền tảng. Cả ba import Supabase JS từ `esm.sh`; môi trường chặn Internet phải vendor/cache dependency đã pin và thử khởi động lạnh. Cấu hình `SUPABASE_URL` nội bộ, `SUPABASE_SERVICE_ROLE_KEY` đích và `CSKH_WORKER_TOKEN` riêng trong secret store. Tạo lại service `functions` sau khi đổi env. Kiểm routing `/functions/v1/<name>`, JWT ở gateway/runtime và OPTIONS/CORS theo bản Compose. Repo đặt `verify_jwt=false` vì handler tự xác minh token người dùng và DB membership, worker còn dùng header riêng. Không mở bỏ xác thực trên các function khác. Các script `deploy-functions.mjs`, `configure-auth-domain.mjs`, `set-password-policy.mjs` gọi Management API của Cloud. [Triển khai Edge tự quản](https://supabase.com/docs/guides/self-hosting/self-hosted-functions).
2. **Cleanup.** Sau đối soát ảnh, dựng lịch `cskh-storage-cleanup` mỗi phút với pg_cron + pg_net + Vault hoặc scheduler nội bộ. Gửi POST JSON `{}` đến URL **đích** `/functions/v1/storage-cleanup` với `x-worker-token` bằng secret của handler. Nếu proxy yêu cầu apikey, cung cấp qua scheduler. Với Vault đặt tên `cskh_worker_token`; tham khảo câu SQL lịch trong `scripts/deploy-functions.mjs` và thay URL/secret theo đích. Test trên staging: xóa ảnh fixture, lần đầu giữ một tham chiếu thư viện để xác nhận ảnh còn đọc được, sau đó xóa tham chiếu cuối và xác nhận object mất, queue hết retry. Kiểm 401 khi thiếu token và 403 với viewer.
3. **Auth.** Trong diễn tập với Auth cũ, tắt signup, đặt URL gốc, allow-list redirect `/reset-password`, cấu hình SMTP nếu dùng reset; dùng signing/API keys mới và buộc đăng nhập lại. Trước khi mở cho nhân viên, hoàn tất đối soát HR và khóa luồng password cũ theo [AUTH-HR.md](AUTH-HR.md).
4. **Build web trên máy CI.** Dùng Node theo `.nvmrc`, cài từ lockfile. Đặt `VITE_SUPABASE_URL=https://<api-cong-ty>`, `VITE_SUPABASE_ANON_KEY` là anon/publishable key đích, `SITE_URL=https://<web-cong-ty>`. Đặt `VITE_CHAT_MODULE_ENABLED=false`, `VITE_CHAT_KEEPALIVE_ENABLED=false` và giữ `feature_flags.chat_module=false`; `VITE_CHAT_GATEWAY_URL` là URL public cho keepalive khi được phép bật lại. Các biến Vite được nhúng **lúc build**. Secret chỉ có ở backend hoặc máy DBA.

```bash
npm ci
npm test
npm run build
npm run check:git
```

5. **Phục vụ nguyên thư mục `dist/` qua HTTPS.** Ví dụ phần location trong virtual host Nginx riêng của web, nơi `root` trỏ tới bản phát hành:

```nginx
root /srv/cskh/current/dist;
location /assets/ { try_files $uri =404; expires 1y; }
location ~* \.[a-z0-9]+$ { try_files $uri =404; }
location / { try_files $uri /index.html; }
location = /index.html { add_header Cache-Control "no-cache"; }
```

   Nạp MIME types cho JS, CSS, font và WASM. Nếu web và API dùng chung hostname, tách route API trước fallback SPA. Reload trực tiếp `/tickets`, `/library`, `/care-logs`, `/call-logs`, `/account` và `/users`. Kiểm Network trong trình duyệt chỉ gọi hostname đã duyệt, asset trả đúng MIME và ảnh/PDF/Excel hoạt động.

## 6. Quyết định chuyển traffic và hoàn tác

| Người xác nhận | Bằng chứng để mở ghi |
|---|---|
| DBA | Restore sạch thành công, SHA ledger khớp, hai báo cáo SQL đã giải trình mọi khác biệt, rclone check thành công, kiểm mẫu audit/ID/ảnh và sequence. Ghi thời gian restore thực tế. |
| IAM + CSKH | Admin, User, Viewer, nhân viên `own`, người nhận follow-up và nhân viên đã nghỉ được thử qua cả API và giao diện. Thử hạ quyền với token còn hạn. Đối soát quyền đọc bài nguồn nhật ký. [Kịch bản IAM](AUTH-HR.md). |
| Vận hành | CRUD ticket, lưu bài rồi xóa ticket nguồn vẫn mở được ảnh, nhập/xuất nhật ký, gọi RPC tìm kiếm, tải PDF/Excel. Chat ẩn, không ping PoC. Cleanup chạy đúng đích, không có job lỗi kéo dài. Có cảnh báo DB, dung lượng Storage, lỗi Auth/Edge và tuổi job lâu nhất. |
| Chủ nghiệp vụ | Ký UAT và thời điểm mở ghi; DNS/TLS, lịch backup DB **và** Storage, diễn tập khôi phục, người trực và cách báo sự cố đều đã ghi vào biên bản. |

Chỉ dùng dữ liệu tổng hợp cho các test ghi trên staging. `db:test`, benchmark và script tạo/dọn tài khoản có thể thay đổi dữ liệu. Giữ nguồn khóa ghi trong thời gian chuyển DNS. Trước khi mở ghi ở đích, nếu nghiệm thu lỗi, chuyển web về bản cũ, khôi phục truy cập và scheduler nguồn, giữ đích cách ly. **Sau khi đích đã nhận ghi**, không chuyển DNS ngược ngay. Khóa ghi đích, sao lưu cả DB và ảnh phát sinh, đối chiếu từ thời điểm cutover, cho DBA và CSKH duyệt kế hoạch đồng bộ ngược hoặc sửa trên đích. Chỉ mở một hệ có quyền ghi. Sau thời hạn giữ nguồn đã duyệt, thu hồi khóa cũ và đóng hạ tầng nguồn theo quy trình công ty.

