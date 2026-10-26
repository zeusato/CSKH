# Chat khách hàng

**Verified production 26/10/2026:** commit f2a99c3 Vercel READY, CI success. admin-users đã deploy qua Supabase dashboard, bundle khớp source đã kiểm thử. Browser admin xác nhận User/Account và form tạo user không còn Chat; không tạo/sửa tài khoản thật trong smoke. DB flag false, Gateway từ chối chat/warmup tập trung.

**26/10/2026 — REQUIRED: tạm dừng toàn bộ Chat KH theo yêu cầu Đại ca.** `public.feature_flags.chat_module=false`; frontend thêm cờ triển khai opt-in `VITE_CHAT_MODULE_ENABLED=true` (hiện tắt). Khi tắt: không menu/route/provider, không cột Chat/nút đồng bộ/quyền Chat trong User, không tự cấp quyền trong Account, không hiện switch phân hệ khi rollout tắt. `admin-users` từ chối sync-chat và bỏ đồng bộ ngầm khi sửa/khóa/tạo tài khoản; giữ quyền đã lưu (hạ về read nếu đổi viewer để thỏa constraint). Khi bật lại phải đồng bộ toàn bộ trước khi cấp phiên. Ping chỉ bật khi `VITE_CHAT_KEEPALIVE_ENABLED=true`.

Phân hệ riêng tại `/chat`. Tin khách gửi từ SHOne đi qua Chat Gateway (repo `zeusato/Chat-server`) và đổ vào một pool chung `support-default`. Nhân viên CSKH được phân quyền đọc, nhận, trả lời, tham gia hỗ trợ và chuyển hội thoại cho nhau.

- Kế hoạch và quyết định: [CHAT-PLAN.md](CHAT-PLAN.md).
- Hợp đồng Gateway (đồng bộ từ thay đổi local Chat-server26/10 về public keepalive; chưa deploy): [chat-gateway/integration-guide.md](chat-gateway/integration-guide.md), [chat-gateway/openapi.yaml](chat-gateway/openapi.yaml). Khi Chat-server ra bản mới thì chép lại cả hai file và đối chiếu `src/lib/chat/contract.ts`.

## Kiến trúc

| Thành phần | Vai trò |
|---|---|
| `supabase/migrations/024_chat_access.sql` | Cột `app_users.chat_access` (`none`/`read`/`agent`/`supervisor`), `chat_synced_at`, `chat_sync_error`. Không lưu nội dung chat, token hay STK |
| Edge Function `admin-users` | Ghi DB trước, rồi đồng bộ sổ đăng ký nhân viên ở Gateway (`PUT`/`DELETE /admin/staff/cskh-desk/{id}`). Action `sync-chat` (`{id}` hoặc `{all:true}`, đối soát hai chiều) |
| Edge Function `chat-session` | Kiểm Supabase JWT + `chat_access`, ký assertion EdDSA `iss=cskh-desk`, `kind=staff`, hạn 60 giây. Chỉ nhận origin trong `CHAT_ALLOWED_ORIGINS` |
| `supabase/functions/_shared/chat-gateway.ts` | Logic dùng chung của hai function. `scripts/function-bundle.mjs` chèn file này vào `index.ts` khi deploy (Management API chỉ nhận một file) |
| `src/lib/chat/*` | Client: phiên (`session.ts`), realtime (`realtime.ts`), API (`api.ts`), badge/banner (`care.ts`), linkify, draft trong RAM, ánh xạ lỗi |
| `src/lib/chat/provider.tsx` | Một phiên + một WebSocket cho cả ứng dụng khi người dùng có quyền Chat, để có badge chưa đọc trên menu |
| `src/pages/Chat.tsx`, `src/components/chat/*` | Pool, thread, banner người chăm sóc, composer, dialog chuyển |

Frontend gọi Gateway trực tiếp bằng access token 5 phút giữ trong RAM. Quyền thao tác do Gateway quyết định; mỗi nút chỉ hiện khi cờ `capabilities` tương ứng là `true`.

## Bật/tắt phân hệ

Cờ `chat_module` trong bảng `public.feature_flags` (migration 025), **mặc định tắt**. Admin bật/tắt ở đầu trang Tài khoản.

- Tắt: menu Chat ẩn với mọi người (kể cả Admin và người đã được cấp quyền), `/chat` chuyển về trang Ticket, `chat-session` trả 403 `CHAT_DISABLED` nên không ai lấy được phiên mới. Người đang mở Chat bị đóng trong khoảng 1 phút (giao diện đọc lại cờ mỗi phút và khi quay lại tab), phiên Gateway bị thu hồi khi trang đóng phân hệ.
- Khi tắt vẫn cấp quyền và đồng bộ sổ đăng ký được, để chuẩn bị trước khi mở cho người dùng.
- Chỉ Admin đổi được cờ (RLS); mọi tài khoản đang hoạt động được đọc. Mỗi lần đổi ghi `updated_at`, `updated_by`.

## Quyền

| Quyền Chat | Vai trò Gateway | Được làm |
|---|---|---|
| Không truy cập | (hủy đăng ký) | Không thấy menu Chat |
| Chỉ xem | `observer` | Xem pool và lịch sử, kể cả ghi chú nội bộ. Không có composer hay nút thao tác |
| Nhân viên | `agent` | Nhận, trả lời/ghi chú khi phụ trách hoặc hỗ trợ, tự tham gia hỗ trợ, chuyển hội thoại của mình, trả về pool, chờ khách, đóng/mở lại hội thoại của mình |
| Giám sát | `supervisor` | Như Nhân viên, cộng thao tác trên mọi hội thoại và thêm/gỡ người hỗ trợ cho người khác |

- **Admin cũng phải được bật quyền Chat.** Admin tự bật trên trang Tài khoản của bạn (nút "Bật quyền Chat cho tôi", cấp Giám sát) hoặc trong trang Tài khoản.
- Tài khoản Chỉ xem chỉ nhận Không truy cập hoặc Chỉ xem. Đổi một tài khoản đang là Nhân viên/Giám sát sang Chỉ xem phải chọn lại quyền Chat; giao diện tự đổi sang Chỉ xem.
- Cột **Chat** trên trang Tài khoản hiện trạng thái đồng bộ. "Chưa đồng bộ" (vàng) có nút Thử lại. "Chưa gỡ được quyền" (đỏ) nghĩa là Gateway chưa nhận lệnh hủy: người đó không lấy được phiên mới (chat-session từ chối ký) nhưng phiên đang mở còn tối đa 5 phút.
- Nút **Đồng bộ Chat** đồng bộ lại toàn bộ tài khoản và gỡ đăng ký thừa ở Gateway (tài khoản không còn trong CSKH). Dùng sau lần cấu hình đầu tiên hoặc khi Gateway từng ngừng hoạt động.

## Cấu hình và triển khai

1. Ở Chat-server, sinh khóa (khóa bí mật chỉ nằm trong `.local/issuers/` của máy chạy lệnh):
   - `npm run issuer:keygen -- issuer cskh-desk shs staff <kid>`: stdout là dòng JSON public, gửi cho người quản trị Gateway thêm vào `ASSERTION_ISSUERS`.
   - `npm run issuer:keygen -- admin shs`: stdout là `shs=<hash>` cho `ADMIN_KEY_HASHES`.
   - Gateway phải có origin production của CSKH trong `ALLOWED_ORIGINS` (GW-06).
2. Chạy migration: `npm run db:migrate` (áp dụng `024_chat_access.sql`).
3. Đặt secret cho Edge Function. Khai báo trong `.env` rồi chạy `npm run deploy:chat-secrets`:

   | Biến | Ý nghĩa |
   |---|---|
   | `CHAT_GATEWAY_URL` | Gốc Gateway, ví dụ `https://chat-server-poc.vercel.app` (không cần `/v1/chat`) |
   | `CHAT_ASSERTION_KID` | `kid` đã đăng ký ở Gateway |
   | `CHAT_ASSERTION_PRIVATE_KEY_FILE` | Đường dẫn file PEM PKCS#8 (`cskh-desk-<kid>.pem`) |
   | `CHAT_ADMIN_KEY_FILE` | Đường dẫn file admin key (`admin-shs.key`) |
   | `CHAT_ALLOWED_ORIGINS` | Tùy chọn. Mặc định `APP_URL` + `http://127.0.0.1:5173` |

4. Deploy function: `node --env-file=.env scripts/deploy-functions.mjs --functions-only` (gồm `chat-session`).
5. Vào trang Tài khoản, cấp quyền Chat rồi bấm **Đồng bộ Chat**.

Xoay khóa: Gateway thêm `kid` mới → đổi `CHAT_ASSERTION_KID` và file PEM rồi chạy lại `deploy:chat-secrets` → Gateway gỡ `kid` cũ.

Bundle frontend không được chứa `BEGIN PRIVATE KEY`, `CHAT_ADMIN_KEY` hay `CHAT_ASSERTION`; `scripts/check-public-bundle.mjs` kiểm việc này.

## Hành vi chính

- **Không gian làm việc:** Chat chiếm toàn bộ phần còn lại của cửa sổ, không dùng padding/max-width/footer của các trang nghiệp vụ. Danh sách và lịch sử tin nhắn cuộn riêng; desktop có nút ẩn/hiện danh sách. Ô soạn tự tăng chiều cao theo nội dung, có giới hạn để giữ chỗ đọc tin. Nhận/chuyển/đóng hội thoại ở thanh chính; thêm người hỗ trợ, chờ khách, trả lại pool và rời hỗ trợ trong menu **Thêm**. Trên điện thoại, mở hội thoại sẽ thay danh sách; quay lại vẫn giữ nháp.
- **Pool:** tab Chưa nhận / Của tôi / Đang có người chăm sóc / Chờ khách / Đã xong. Tìm STK là so khớp đúng cả chuỗi. Gateway không có API đếm: chỉ hiện số chưa đọc của các dòng đã tải và nút "Còn nữa".
- **Người chăm sóc:** badge trên mỗi dòng và banner cố định đầu hội thoại. Nhận đồng thời: chỉ một người thắng, người kia thấy thông báo và nút Tham gia hỗ trợ.
- **Tin nhắn:** plain text, tự nhận link `http/https`, mở tab mới với `noopener noreferrer`. Không render HTML. Ghi chú nội bộ nền vàng, khách không thấy. Khách chỉ thấy tên "CSKH SHS".
- **Gửi tin:** mỗi tin có `clientMessageId` riêng; mạng rớt thì gửi lại đúng id. Response chứa Message được ghép ngay vào cache, không chờ tải lại lịch sử. Kết quả chưa rõ (`unknown`) không tự gửi lại mà nhắc kiểm tra lịch sử. Bị từ chối (`rejected`) thì trả nội dung về ô soạn.
- **Tải tin:** metadata và lịch sử chạy song song. Mỗi lần cập nhật chỉ đọc 19 tin mới nhất; trang tin cũ lấy 50 tin khi cuộn lên. Giữ lịch sử đã tải khi hai cửa sổ còn giao nhau; nếu mất kết nối lâu đến mức có khoảng trống thì lấy cursor của cửa sổ mới để cuộn lại không bỏ sót tin.
- **Realtime:** HTTP bắt đầu ngay khi có phiên, song song với kết nối socket. Khi nhận `ready`, đối soát snapshot lần nữa để khép khoảng trống giữa HTTP và socket. Event đến trong lúc HTTP đang chạy được gom thành một lượt tải tiếp, không liên tục hủy request. Tin mới tải ngay; danh sách/metadata gom 200 ms. Reconnect có backoff, gửi cursor cuối để Gateway trả bù event; dừng hẳn khi đóng 4403. Mất kết nối quá 10 giây thì hiện chip cảnh báo; xin ticket/handshake quá 15 giây thì hủy và thử lại.
- **Phiên:** gia hạn trước hạn, single-flight; 401 gia hạn một lần; 403 thì dừng và báo mất quyền. Đăng xuất thu hồi phiên Gateway, đóng socket, xóa draft và cache.
- **Thông báo:** badge chưa đọc trên menu và tiền tố `(N)` trên tiêu đề tab (Của tôi + Chưa nhận). Âm báo khi có hội thoại mới, bật/tắt ở đầu trang Chat (lưu theo thiết bị).

## Kiểm thử

| Lệnh | Phạm vi |
|---|---|
| `npm test` | Unit: client (phiên, realtime, receipt, linkify, draft, badge, fail-closed), Edge Function `admin-users` (đồng bộ) và `chat-session` (ký assertion) chạy đúng bản bundle sẽ deploy |
| `npm run test:chat-db` | Migration 024 trên PostgreSQL cô lập (PGlite) |
| `npm run test:chat-gateway` | Kịch bản nghiệm thu CHAT-PLAN §8.2 với Gateway local thật |
| `npm run test:chat-ui` | Trình duyệt headless: hai nhân viên + người chỉ xem với Gateway local thật, Supabase giả lập |
| `npm run test:chat-latency` | Kiểm thử HTTP/WS giả lập: bỏ chờ socket/metadata, event trong lúc tải, tin mới khi lịch sử cũ đang chậm, hiển thị response gửi ngay, chống trùng và giữ dữ liệu khi refresh lỗi. Báo cáo `docs/validation/chat-latency.json` |
| `node scripts/test-chat-layout.mjs` | Kiểm tra bố cục desktop/tablet/phone, ô soạn tự giãn, giữ nháp, menu và chuyển trang; HTTP/WebSocket đều giả lập. Dùng cùng biến Playwright/URL bên dưới. Báo cáo `docs/validation/chat-layout.json` |

### Kiểm thử với Gateway local

Theo CHAT-PLAN §0: trong `D:\Dev\Chat-server` sinh khóa `cskh-desk` (kid `dev`) và admin key, rồi chạy `npm run dev:local` với `ASSERTION_ISSUERS`, `ADMIN_KEY_HASHES` và `ALLOWED_ORIGINS='http://127.0.0.1:5173'`. Sau đó ở CSKH:

```powershell
$env:CHAT_IT_GATEWAY='http://127.0.0.1:8080'
$env:CHAT_IT_SERVER_DIR='D:\Dev\Chat-server'
$env:CHAT_IT_KEY_FILE='D:\Dev\Chat-server\.local\issuers\cskh-desk-dev.pem'
$env:CHAT_IT_ADMIN_KEY_FILE='D:\Dev\Chat-server\.local\issuers\admin-shs.key'
npm run test:chat-gateway
npm run test:chat-ui
```

`test:chat-ui` cần dev server (`npm run dev`) và Playwright (`PLAYWRIGHT_MODULE`, `CARE_BROWSER_PATH` như các bộ UI test khác). Ảnh chụp nằm ở `.local/chat-qa/`. Các test chỉ dùng persona tổng hợp, không nhắn tới khách thật, và gỡ đăng ký nhân viên test sau khi chạy.

Rà soát và sửa độ trễ phía CSKH ngày 24/10/2026: [kết quả và giới hạn](validation/chat-latency.md). Thay đổi frontend và Edge Function `chat-session` cần triển khai riêng; các phép đo giả lập không phải benchmark production.

Chưa kiểm với Supabase thật: `admin-users` và `chat-session` chỉ được chạy trong Node với Supabase giả lập. Sau khi deploy, kiểm tay theo mục Cấu hình bước 5 và kịch bản §8.2 trên PoC (cần GW-06).


## Giữ ấm trước đăng nhập

26/10/2026: đã code local vòng ping public ở entry, độc lập chat_module và phiên; chưa deploy. [Contract, cấu hình và giới hạn](chat-keepalive.md).
