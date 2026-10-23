# Kế hoạch phân hệ Chat CSKH

Lập ngày 23/10/2026 (Asia/Ho_Chi_Minh), cập nhật cùng ngày theo các quyết định ở §11. Dựa trên Chat Server `zeusato/Chat-server` commit `ce1d50b`, **đã deploy lên PoC** `https://chat-server-poc.vercel.app`. Contract gốc nằm ở `D:\Dev\Chat-server\docs\contracts\chat-api.md`; tài liệu cho bên tích hợp là `docs\integration-guide.md` và spec REST `docs\openapi.yaml` (cùng commit). Khi tài liệu này và contract lệch nhau thì **contract thắng**, sau đó cập nhật lại tài liệu này.

Nhãn dùng trong tài liệu: **REQUIRED** = Đại ca đã yêu cầu; **PROPOSED** = đề xuất để bắt đầu code, có thể đổi; **OPEN** = cần Đại ca chốt; **GW-xx** = việc phía Chat Server (mục 9). Phía Gateway đã xong mọi mục đợt này trừ cấu hình PoC (GW-06). **Phía CSKH đã code xong C1–C5** (23/10/2026) và qua kiểm thử với Gateway local; chưa migrate/deploy lên Supabase thật và chưa chạy trên PoC (chờ GW-06). Hướng dẫn vận hành và kiểm thử: [CHAT.md](CHAT.md).

## 0. Bắt đầu nhanh cho dev

PoC chưa cấu hình issuer `cskh-desk` (GW-06), nên **pha C1–C4 code và test với Gateway chạy local**, không cần chờ PoC.

1. Chạy Gateway local trong `D:\Dev\Chat-server` (Node ≥22.17, không cần Docker):
   - sinh khóa thử: `npm run issuer:keygen -- issuer cskh-desk shs staff dev` (private key ở `.local/issuers/`, stdout là dòng JSON public) và `npm run issuer:keygen -- admin shs` (stdout là `shs=<hash>`);
   - chạy với biến môi trường: `ASSERTION_ISSUERS='[<dòng JSON trên>]'`, `ADMIN_KEY_HASHES='shs=<hash>'`, `ALLOWED_ORIGINS='http://127.0.0.1:5173'` (CSKH dev chạy ở `127.0.0.1`, mặc định của Gateway chỉ có `localhost`), rồi `npm run dev:local`;
   - Gateway nghe `http://127.0.0.1:8080/v1/chat`, engine bộ nhớ, Postgres nhúng ở `.local/pg`.
2. Đặt secret cho Edge Function local: `CHAT_ASSERTION_PRIVATE_KEY` (nội dung file PEM), `CHAT_ASSERTION_KID=dev`, `CHAT_GATEWAY_URL=http://127.0.0.1:8080`, `CHAT_ADMIN_KEY` (nội dung file `admin-shs.key`).
3. Tạo hội thoại phía khách để có dữ liệu trong pool: lấy proof bằng `npm run dev:proof -- customerA` (khách giả `TEST-ACCOUNT-A`), gọi `POST /v1/chat/sessions {proof}`, rồi `POST /v1/chat/conversations` và gửi tin. Có thể dùng chính lệnh này trong `scripts/test-chat-ui.mjs`.
4. Đọc `integration-guide.md` §3–§10 (trang nhân viên: §6) và dùng `openapi.yaml` làm nguồn DTO trước khi code client; `chat-api.md` §2–§6 khi cần quy tắc chi tiết. Khi lên PoC, chỉ đổi `CHAT_GATEWAY_URL` và secret, sau khi Chat-server cấu hình GW-06.

## 1. Mục tiêu

**REQUIRED** (Đại ca, 23/10/2026):

- Tin khách gửi từ SHOne đi qua Chat Server và đổ vào một **pool tin nhắn** trong CSKH.
- Chỉ nhân viên CSKH được phân quyền ở phân hệ này mới vào đọc và trả lời khách.
- Đồng nghiệp **thấy được ai đang chăm sóc** một khách. Nếu muốn, người khác **vẫn tham gia được**.
- Đây là một **phân hệ riêng** của CSKH, giống Nhật ký CSKH và Nhật ký cuộc gọi.
- Nhân viên phải được **đăng ký rõ ràng** với Chat Server (D25). Khách được nhận diện theo STK do SHOne ký (D11). Tin nhắn chỉ là **plain text**, FE tự nhận diện link, không có ảnh/file/HTML (D27).

**Ngoài phạm vi đợt này:** tư vấn đầu tư 1–1 (advisory), ảnh/file, typing/presence, push notification ngoài trình duyệt, báo cáo/thống kê chat, export transcript.

## 2. Kiến trúc và luồng dữ liệu

```
 SHOne (khách)                    Chat Server (Vercel)                         CSKH (Vite SPA + Supabase)
 ─────────────                    ────────────────────                         ──────────────────────────
 backend SHOne ký assertion  ──►  POST /v1/chat/sessions  ◄── assertion ───   Edge Function chat-session
 kind=customer, account_refs      Gateway: ACL, pool, claim                    (kiểm Supabase JWT + app_users,
                                  Chatwoot (nội bộ): transcript                 ký Ed25519 bằng secret)
 app SHOne ── REST/WSS ────────►  /v1/chat/*  ◄──────── REST/WSS ──────────    trang /chat (React)
                                  /v1/chat/admin/staff ◄── admin key ──────    Edge Function admin-users
                                                                               (đồng bộ quyền chat)
```

Nguyên tắc (REQUIRED theo Chat Server):

1. **Chỉ backend được ký assertion.** Private key nằm trong Supabase Edge Function secret, không bao giờ vào `VITE_*` hay bundle.
2. **Frontend gọi Gateway trực tiếp** bằng access token 5 phút giữ trong RAM. CSKH không proxy nội dung chat và không lưu tin nhắn vào Supabase.
3. **Quyền chat do Gateway quyết định**, dựa trên sổ đăng ký nhân viên. CSKH chỉ là nơi Admin bật/tắt và đồng bộ sổ đó. Nút trên UI dựa theo `capabilities` trả về, không tự suy quyền.
4. Mỗi nhân viên CSKH là một principal/Agent riêng ở Gateway, với `sub = app_users.id`.

Định danh issuer (PROPOSED, cần khớp với cấu hình `ASSERTION_ISSUERS` ở Chat Server):

| Issuer | Tenant | kinds | Bên ký |
|---|---|---|---|
| `cskh-desk` | `shs` | `["staff"]` | Edge Function `chat-session` của CSKH |
| `shone-app` | `shs` | `["customer"]` | Backend SHOne (thuộc plan bên SHOne) |

## 3. Phân quyền trong CSKH

### 3.1. Cột quyền mới

Migration `024_chat_access.sql` (PROPOSED), theo đúng pattern `care_log_access` / `call_log_access`:

```sql
alter table public.app_users add column chat_access text not null default 'none'
  check (chat_access in ('none','read','agent','supervisor'));
alter table public.app_users add constraint viewer_chat_read_only check (role <> 'viewer' or chat_access in ('none','read'));
alter table public.app_users add column chat_synced_at timestamptz;      -- lần đồng bộ Gateway thành công gần nhất
alter table public.app_users add column chat_sync_error text;            -- thông báo lỗi ngắn, không chứa secret
-- Không cần grant mới: authenticated chỉ có SELECT trên app_users (001), nên chỉ service_role (admin-users) ghi được 3 cột này.
```

Không có bảng hay RLS mới: Supabase không lưu nội dung chat (§6).

Lưu ý: policy `users_read` (001) cho **mọi user đang hoạt động đọc mọi dòng** `app_users`, nên `chat_synced_at`/`chat_sync_error` hiện với mọi nhân viên. Chấp nhận được vì cột lỗi chỉ chứa HTTP status + `code` của Gateway, không có nội dung nhạy cảm. Nếu sau này muốn giấu thì tách sang bảng trong schema `private` và trả qua action `list` của `admin-users`.

| `chat_access` | Gateway roles | Gateway queueIds | Được làm |
|---|---|---|---|
| `none` | (không đăng ký / DELETE) | – | Không thấy menu Chat |
| `read` | `["observer"]` (GW-08) | `["support-default"]` | Chỉ xem pool và lịch sử hội thoại, kể cả ghi chú nội bộ (PROPOSED). Không nhận, không trả lời, không tham gia, không chuyển |
| `agent` | `["agent"]` | `["support-default"]` | Xem pool; nhận xử lý; trả lời/ghi chú khi là người phụ trách hoặc người hỗ trợ; **tự tham gia** hỗ trợ hội thoại đang có người chăm sóc (GW-01); **chuyển** hội thoại mình đang phụ trách cho đồng nghiệp (GW-11); trả lại pool; đóng hội thoại mình phụ trách |
| `supervisor` | `["supervisor"]` | `["support-default"]` | Như agent, cộng thêm chuyển, trả về pool hoặc đóng **mọi** hội thoại trong queue, và thêm/gỡ người hỗ trợ cho người khác |

Quy tắc (**DECIDED** 23/10/2026 theo Đại ca, trừ chỗ ghi PROPOSED):

- **Admin phải được bật quyền Chat như mọi người**, không mặc nhiên có quyền. Admin tự bật được cho chính mình trên trang Tài khoản, nhưng chưa bật thì không vào Chat.
- **Tài khoản Chỉ xem (`viewer`) được xem lịch sử chat** khi Admin chọn `read`, nhưng không bao giờ được `agent`/`supervisor`. Thành viên thường (`user`) cũng có thể được cấp `read`.
- **Nhân viên thường chuyển hội thoại cho nhau và cùng tham gia chăm sóc một khách được.** Giám sát có thêm quyền thao tác trên hội thoại do người khác phụ trách.
- PROPOSED: người có quyền `read` thấy cả ghi chú nội bộ, vì đây vẫn là trao đổi nội bộ CSKH. **OPEN** nếu Đại ca muốn ẩn.
- Khóa tài khoản (`active=false`) hoặc đổi về `none` → gọi `DELETE /admin/staff/cskh-desk/{id}`: Gateway thu hồi phiên và đóng socket ngay. Đổi giữa `read`/`agent`/`supervisor` → `PUT` với roles mới, có hiệu lực ngay ở request kế tiếp.
- Đợt này chỉ có một queue `support-default`. Nhiều điểm tiếp nhận (theo nền tảng nguồn hoặc nhóm nghiệp vụ) xem mục 3.3.

### 3.2. Đồng bộ sổ đăng ký (Edge Function `admin-users`)

Bổ sung vào function hiện có, dùng secret mới `CHAT_GATEWAY_URL` và `CHAT_ADMIN_KEY`. Admin key sinh ở Chat Server bằng `npm run issuer:keygen -- admin shs`; Gateway chỉ lưu hash.

1. `create` / `update`: validate `chat_access` giống cách đang làm với `care_log_access`, ghi `app_users` trước. **Không chép quy tắc `role==='admin' → *_access='none'`** của care log/call log sang chat, vì Admin phải được bật Chat như mọi người (§11 #1).
2. **Đổi vai trò sang `viewer`** khi `chat_access` đang là `agent`/`supervisor` (trong body hoặc trong DB): trả 400 "Tài khoản Chỉ xem chỉ được quyền Chat Chỉ xem hoặc Không truy cập", để Admin chọn lại. Không để constraint `viewer_chat_read_only` ném lỗi Postgres thô. UI chủ động đổi select về `read` khi Admin chọn vai trò Chỉ xem, nên thường không chạm tới lỗi này.
3. Sau khi ghi DB, **chỉ đồng bộ khi một trong các cột `name`, `role`, `active`, `chat_access` có trong update** (đổi phòng ban không gọi Gateway). Đồng bộ dùng **dòng đọc lại từ DB**, không dùng body request, để hai Admin sửa đồng thời không đẩy trạng thái cũ lên Gateway:
   - `chat_access ≠ none` và `active` → `PUT {CHAT_GATEWAY_URL}/v1/chat/admin/staff/cskh-desk/{encodeURIComponent(id)}` với body `{displayName: name, roles, queueIds}`;
   - ngược lại → `DELETE …` (coi 404 là thành công).
4. Lời gọi Gateway nằm trong **try/catch riêng**, không rơi vào `catch` chung đang trả 400 của `admin-users`: DB đã ghi xong thì response phải phản ánh đúng điều đó. Thành công: đặt `chat_synced_at = now()`, `chat_sync_error = null`. Lỗi (kể cả timeout, đặt 10 giây): đặt `chat_sync_error` ngắn gọn (HTTP status + `code` của Gateway). Response vẫn `ok`, kèm `chatSync: 'failed'` để UI báo vàng "Chưa đồng bộ quyền chat — Thử lại" (đỏ nếu là DELETE, xem mục 7).
5. Action mới `sync-chat` (`{id}` hoặc `{all:true}`): đồng bộ lại một hoặc toàn bộ tài khoản. Dùng cho nút "Thử lại" và cho lần bật phân hệ đầu tiên (backfill). Với `{all:true}`, đối soát hai chiều:
   - đọc `GET /admin/staff`, lấy các bản ghi `issuer='cskh-desk'`, `status='active'`;
   - PUT cho mọi tài khoản có quyền trong DB;
   - DELETE mọi subject đang active ở Gateway mà trong DB không còn, bị khóa hoặc `chat_access='none'` (ví dụ user bị xóa thẳng trên Supabase dashboard). Đây là hướng lệch nguy hiểm, chỉ duyệt các dòng DB thì không bao giờ dọn được;
   - trả về số đã PUT/DELETE/lỗi.
6. Đổi tên nhân viên cũng gọi PUT để `displayName` ở Gateway cập nhật (tên ≤160 ký tự, trong giới hạn 200 của Gateway).
7. Thứ tự "ghi DB rồi gọi Gateway" có thể lệch tạm thời. Hướng lệch nguy hiểm là **CSKH đã khóa nhưng Gateway vẫn còn đăng ký**. Vì vậy:
   - khi khóa hoặc hạ quyền mà `DELETE` lỗi, UI phải hiện lỗi đỏ, không chỉ cảnh báo vàng;
   - lớp chặn thứ hai: `chat-session` từ chối ký cho tài khoản không còn quyền (§4), nên người bị khóa không lấy được phiên mới; phiên cũ tự hết hạn sau tối đa 5 phút.

Trang `Users.tsx`:
- Thêm select "Quyền Chat" (Không truy cập / Chỉ xem / Nhân viên / Giám sát) cạnh các quyền module khác. Với tài khoản Chỉ xem, select chỉ có Không truy cập / Chỉ xem. **Select này hiện cả với dòng Admin**, khác với các quyền module khác đang bị ẩn/ép `none` cho Admin.
- Trang `Account.tsx` của Admin có nút "Bật quyền Chat cho tôi". Nút này gọi `admin-users` `update` cho chính mình; không có đường tắt bỏ qua đồng bộ.
- Thêm cột/biểu tượng trạng thái đồng bộ. Không hiển thị admin key hay chi tiết kỹ thuật.

### 3.3. Nhiều điểm tiếp nhận (sau đợt đầu)

Gateway hiện đưa mọi hội thoại support vào một queue (`SUPPORT_QUEUE_ID`). Muốn tách queue theo nền tảng nguồn (SHOne web/app/kênh khác) hoặc theo nhóm nghiệp vụ thì cần GW-07 (định tuyến queue). Phía CSKH khi đó:
- thêm bảng `chat_queues` (id, tên hiển thị) và quan hệ user ↔ queue;
- đổi select quyền thành multi-select queue;
- đồng bộ `queueIds` thật thay cho hằng `support-default`.

Đợt đầu giữ schema đơn giản, nhưng đặt `queueIds` qua một hàm `chatQueuesFor(profile)` để đổi sau không phải sửa nhiều chỗ.

## 4. Edge Function `chat-session` (ký assertion)

`supabase/functions/chat-session/index.ts`, đăng ký trong `config.toml` với `verify_jwt = false`, tự kiểm JWT như `admin-users`.

**Request:** `POST`, header `Authorization: Bearer <Supabase access token>`, không có body.

**Xử lý:**
1. `service.auth.getUser(token)`; lỗi thì trả 401.
2. Đọc `app_users` của user: phải `active` và `chat_access <> 'none'`, nếu không thì trả 403 `{error:'Tài khoản chưa được cấp quyền Chat.'}`. Trường hợp `role = 'viewer'` mà `chat_access <> 'read'` (dữ liệu sai) cũng trả 403. Assertion không mang quyền; Gateway lấy quyền từ sổ đăng ký.
3. Ký JWT EdDSA theo chat-api §2.3. Header: `{"alg":"EdDSA","typ":"JWT","kid":CHAT_ASSERTION_KID}`. `sid`/`sid_exp` lấy bằng cách giải mã payload của chính Supabase access token **sau khi** `getUser` đã xác thực nó (`getUser` không trả claims); không verify lại chữ ký JWT Supabase lần nữa.

| Claim | Giá trị |
|---|---|
| `iss` | `cskh-desk` |
| `aud` | `chat-gateway` |
| `sub` | `app_users.id` (UUID; không dùng email) |
| `kind` | `staff` |
| `name` | `app_users.name` (≤160 ký tự, Gateway cho ≤200) |
| `sid` | claim `session_id` trong Supabase JWT |
| `sid_exp` | claim `exp` trong Supabase JWT (giây) |
| `jti` | `crypto.randomUUID()` |
| `iat` / `exp` | now / now + 60 |
| (không có) | `roles`, `queue_ids`, `account_refs` — Gateway sẽ từ chối nếu có |

4. Trả về `{assertion, gatewayUrl}` với header `Cache-Control: no-store`. `gatewayUrl` là base đã gồm `/v1/chat`. **Không log** assertion hay token.

**Ký trong Deno:** WebCrypto hỗ trợ Ed25519, không cần thư viện.
- `crypto.subtle.importKey('pkcs8', der, {name:'Ed25519'}, false, ['sign'])`, với `der` lấy từ PEM trong secret `CHAT_ASSERTION_PRIVATE_KEY`.
- Ký bằng `crypto.subtle.sign('Ed25519', key, data)`, kết quả mã hóa base64url.
- Import key một lần mỗi cold start và giữ trong biến module.

**Secrets:**
- `CHAT_ASSERTION_PRIVATE_KEY` (PEM PKCS#8), `CHAT_ASSERTION_KID`, `CHAT_GATEWAY_URL`.
- Sinh cặp khóa ở Chat Server: `npm run issuer:keygen -- issuer cskh-desk shs staff <kid>`. Đặt private key vào Supabase secret bằng `supabase secrets set` qua script `deploy-functions.mjs`, không commit. Gửi dòng JSON public cho người cấu hình Gateway.
- Xoay khóa: Gateway thêm kid mới → đổi secret + kid → Gateway gỡ kid cũ.

**CORS/Origin:** chỉ origin của CSKH (production + `http://127.0.0.1:5173`), không dùng `*` như `admin-users`. Request có header `Origin` ngoài danh sách thì trả 403, không ký. Đây là endpoint cấp danh tính. Không cần thêm chống CSRF vì xác thực bằng Bearer header, không dùng cookie.

**Test** (`scripts/test-chat-session.mjs`):
- tài khoản không có quyền → 403; viewer có `read` → 200; tài khoản bị khóa → 403;
- token sai → 401;
- tài khoản hợp lệ → assertion verify được bằng public key, đủ claim, không có `roles`;
- gọi hai lần ra hai `jti` khác nhau.

## 5. Frontend: trang `/chat`

### 5.1. Cấu trúc mã (PROPOSED)

```
src/lib/chat/
  contract.ts        // bản sao DTO từ Chat-server packages/contracts (ghi commit nguồn ở đầu file); KHÔNG import đường dẫn máy
  gateway.ts         // fetch wrapper: base URL, Bearer, parse ErrorBody, X-Correlation-Id cho log lỗi
  session.ts         // ChatSession: lấy assertion → POST /sessions, giữ token trong RAM, tự gia hạn
  realtime.ts        // WS: ticket, auth frame, cursor, backoff + jitter, sync.required
  drafts.ts          // draft theo `${principalId}:${conversationId}`, chỉ trong RAM
  linkify.ts         // tách text thành đoạn chữ + link http/https (D27)
  chat-access.ts     // chatAccess(profile), chatQueuesFor(profile)
src/pages/Chat.tsx   // lazy route, layout pool + hội thoại
src/components/chat/
  QueuePanel.tsx  ConversationRow.tsx  ThreadView.tsx  MessageItem.tsx
  Composer.tsx  CareBanner.tsx  ParticipantsBar.tsx  TransferDialog.tsx  ConnectionState.tsx
```

`src/lib/types.ts`: thêm `chat_access?: 'none'|'read'|'agent'|'supervisor'` vào `Profile`.

Quy tắc chung khi đọc response Gateway (`contract.ts`, `gateway.ts`), theo `openapi.yaml` của Chat-server (`D:\Dev\Chat-server\docs\openapi.yaml`, nên chép DTO từ file này):
- Bỏ qua field lạ trong response; Gateway có thể thêm field mới bất cứ lúc nào.
- Gặp giá trị enum lạ (`status`, `syncState`, `role`, receipt `status`…) thì xử lý theo hướng chặn: không hiện nút thao tác, coi như chỉ đọc, ghi `console.warn` kèm `correlationId` nếu có.
- URL WebSocket suy từ `gatewayUrl`: đổi `https:` → `wss:` (`http:` → `ws:` khi local), thêm `/realtime`. Không hardcode URL PoC.
- Mọi request gửi `credentials: 'omit'`.

`App.tsx`:
- thêm link "Chat khách hàng" (icon `MessagesSquare`) khi `chatAccess(profile) !== 'none'`;
- route `/chat` và `/chat/:conversationId` có `key={`${profile.id}-${chatAccess(profile)}`}`;
- `auth.tsx` thêm `chat-` vào regex xóa cache khi quyền đổi, và đưa `chatAccess` vào chuỗi `access`.

### 5.2. Phiên Gateway (`session.ts`)

- Khởi tạo khi vào `/chat`: gọi `chat-session` → `POST {gatewayUrl}/v1/chat/sessions {proof}` → giữ `accessToken`, `expiresAt`, `principal`, `capabilities` trong RAM, không dùng localStorage/sessionStorage. Mỗi lần gọi `chat-session` lấy Supabase token mới bằng `supabase.auth.getSession()`, không giữ token cũ: `sid_exp` của assertion bằng hạn token Supabase, nên token sắp hết hạn làm phiên chat ngắn theo.
- **Gia hạn chủ động** khi còn khoảng 45–60 giây trước `expiresAt`: Gateway chưa có refresh, nên lặp lại hai bước trên. Khi tab ẩn lâu, để token hết hạn rồi gia hạn lúc tab hiện lại.
- **Gia hạn single-flight**: giữ một Promise gia hạn dùng chung; nhiều request cùng gặp hạn hoặc cùng nhận 401 chỉ gây một lần gọi `chat-session` + `POST /sessions` (mẫu `ChatClient` ở integration-guide §4).
- Gặp 401 từ Gateway: gia hạn **một lần** rồi thử lại request; vẫn 401 thì hiện "Phiên chat đã hết, đang kết nối lại…". Assertion chỉ dùng một lần: mọi lần thử lại `POST /sessions` đều xin assertion **mới**, không gửi lại assertion cũ.
- Gặp 403 từ `chat-session` hoặc `/sessions`: dừng hẳn, hiện "Bạn chưa được cấp quyền Chat hoặc quyền vừa bị thu hồi", xóa cache `chat-*`.
- Đăng xuất CSKH hoặc đổi tài khoản: `DELETE /sessions/current` (bỏ qua lỗi), đóng WS, xóa draft và cache. Hook vào `signOut` và vào `loadProfile` khi id đổi.
- Lỗi 503 `retryable`: thử lại có backoff. Ở `POST /sessions`, mỗi lần thử lại xin assertion mới (assertion cũ chỉ còn hạn ≤60 giây). Lần mở đầu tiên Chatwoot có thể khởi động lạnh khoảng 20 giây trên PoC, nên hiện trạng thái "Đang kết nối máy chủ chat…" ổn định, không nhảy layout.
- 403 ngay ở request đầu tiên từ trình duyệt mà `chat-session` vẫn 200: thường do origin chưa có trong `ALLOWED_ORIGINS` của Gateway. Ghi `console.warn` gợi ý kiểm origin cho dev, UI vẫn báo như mất quyền.

### 5.3. Realtime (`realtime.ts`)

Theo chat-api §6 và integration-guide §7:
1. `POST /realtime-tickets` → ticket sống 30 giây, dùng một lần.
2. Mở `wss://…/v1/chat/realtime` (không đưa token/ticket vào URL), trong 5 giây gửi `{type:'auth', ticket, cursor?}`.
3. Nhận `ready` / `events` / `sync.required` / `session.expired` / `error`.

**Thứ tự khởi động (không mất tin):** mở socket và chờ `ready` **trước**, gom các frame `events` đến trong lúc tải dữ liệu HTTP (pool, hội thoại đang mở), tải xong mới áp phần đã gom. Không tải dữ liệu trước rồi mới mở socket không cursor, vì sẽ hở một khoảng.

Xử lý frame:

| Frame | Xử lý |
|---|---|
| `ready` | Lưu cursor, reset bộ đếm backoff |
| `events` | Áp từng event (bảng dưới), rồi lưu cursor |
| `sync.required` | Refetch toàn bộ query `chat-*`, đi tiếp từ cursor mới |
| `session.expired` (socket đóng 4401) | Gia hạn phiên (§5.2) rồi kết nối lại |
| `error` + `DEPENDENCY_FAILED`, `retryable:true` | Lỗi tạm phía server, server tự thử lại. Giữ nguyên dữ liệu, không reconnect |

Mã đóng: `4401` → gia hạn phiên rồi kết nối lại; **`4403` = sai giao thức (lỗi code client) → dừng hẳn, không reconnect**, hiện chip lỗi và ghi `console.error`. Các mã khác → reconnect.

- Cursor giữ trong RAM. Reconnect: backoff 1s → 2s → 4s … tối đa 30s, có jitter; mỗi lần xin ticket mới và gửi cursor cuối. Dừng hẳn khi logout, mất quyền (403) hoặc 4403.
- Event chỉ có metadata, không có nội dung tin. Áp event:

| `type` | Làm gì |
|---|---|
| `message.created` | Invalidate `['chat-messages', id]` và các list `['chat-queue', …]` (để cập nhật `unreadCount`, thứ tự) |
| `conversation.created` | Invalidate các list `['chat-queue', …]` |
| `conversation.updated` / `conversation.assigned` | Invalidate `['chat-conversation', id]` và các list `['chat-queue', …]` |
| `conversation.read` | Invalidate `['chat-conversation', id]` và list để đồng bộ badge chưa đọc giữa các tab |
| `type` lạ | Bỏ qua |

- Bỏ event trùng `eventId`. Bỏ event metadata có `revision` nhỏ hơn bản đang giữ; **`message.created` và `conversation.read` có `revision: null` và luôn được áp**.
- Gom invalidate theo `requestAnimationFrame` hoặc ~200 ms để một loạt event không gây hàng chục lần refetch.
- Mất WS lâu hơn 10 giây: hiện chip "Mất kết nối thời gian thực — dữ liệu có thể chậm" ở vị trí cố định trong header của panel, không chèn dòng làm nhảy layout. **Không poll liên tục thay socket**: khi kết nối lại, gửi cursor cuối để Gateway trả bù event (hoặc nhận `sync.required`). Nếu reconnect thất bại liên tục, có thể gọi `GET /events?cursor=` mỗi lần thử lại để bù; `resetRequired: true` thì xử lý như `sync.required`.

### 5.4. Pool và nhận biết người đang chăm sóc

Bố cục desktop (≥1200px): cột pool 360px | hội thoại | (tùy chọn) panel thông tin 280px. Tablet: pool | hội thoại, panel thông tin thành drawer. Phone: một cột, chuyển giữa pool và hội thoại, nút quay lại giữ vị trí cuộn của pool.

Tab của pool, tất cả gọi `GET /queues/support-default/conversations` với bộ lọc phía server (GW-04):

| Tab | Query | Ghi chú |
|---|---|---|
| **Chưa nhận** | `status=open&owner=none` | |
| **Của tôi** | `mine=true` (mọi trạng thái; tôi là owner hoặc người hỗ trợ) | Không dùng `GET /conversations`: với staff endpoint này trả **mọi** hội thoại trong queue. Ẩn với quyền `read` |
| **Đang có người chăm sóc** | `status=open&owner=others` | Có thể gồm hội thoại tôi đang hỗ trợ; dòng đó hiện badge "Bạn đang hỗ trợ" |
| **Chờ khách** / **Đã xong** | `status=pending_customer` / `status=resolved` | |
| Ô tìm STK | thêm `accountRef=<STK đầy đủ>` vào tab đang chọn | So khớp đúng chuỗi, không tìm gần đúng. Gateway chưa có tìm theo tên khách |

- **Gateway không có API đếm.** Không hứa con số tổng trên tab. Chỉ hiện số tin chưa đọc (cộng `unreadCount` của các dòng đã tải, quá 99 thì hiện `99+`). Nếu có trang sau thì hiện "Còn nữa" thay vì một tổng giả.
- Mỗi tab có cursor riêng. **Đổi tab hoặc đổi ô tìm STK thì bỏ cursor cũ**: Gateway trả 422 nếu dùng cursor của bộ lọc khác.
- Page mặc định 50, tối đa 100. Tải thêm khi cuộn tới cuối danh sách.

Mỗi dòng hội thoại hiển thị:
- tên khách (GW-03) và STK (`accountRef`, giữ nguyên chuỗi);
- tiêu đề, thời gian cập nhật theo giờ VN, số tin chưa đọc;
- **badge người chăm sóc**: "Chưa có người nhận" (cam), "Bạn đang chăm sóc" (xanh), "Đang được {owner.displayName} chăm sóc" (xám đậm), "+N người hỗ trợ" (GW-02).

Trong hội thoại, `CareBanner` cố định ở đầu thread:

| Trạng thái | Banner | Hành động |
|---|---|---|
| Chưa ai nhận | "Khách đang chờ phản hồi" | **Nhận xử lý** (`POST /claim` với `expectedRevision`) |
| Người khác đang chăm sóc, tôi chưa tham gia | "{owner} đang chăm sóc khách này" | **Tham gia hỗ trợ** (GW-01). Trước khi tham gia chỉ đọc được, composer khóa và ghi lý do |
| Tôi là owner | "Bạn đang chăm sóc" | Chuyển cho đồng nghiệp (GW-11), Chờ khách phản hồi, Trả lại pool, Đóng hội thoại |
| Tôi là người hỗ trợ | "Bạn đang hỗ trợ {owner}" | Rời hỗ trợ (GW-01) |
| Hội thoại đã đóng | "Hội thoại đã kết thúc" | Mở lại (chỉ khi `canReopen`) |
| Quyền `read` | "Bạn đang xem ở chế độ chỉ đọc" | Không có nút thao tác; ẩn hẳn composer, không chỉ disable |

Mỗi nút chỉ hiện khi cờ `capabilities` tương ứng là `true`; không tự suy quyền từ vai trò:

| Nút | Cờ | API |
|---|---|---|
| Nhận xử lý | `canClaim` | `POST /conversations/{id}/claim {expectedRevision}` |
| Tham gia hỗ trợ / Rời hỗ trợ | `canJoin` / `canLeave` | `POST /conversations/{id}/join` / `/leave {expectedRevision}` |
| Chuyển cho đồng nghiệp | `canTransfer` | `POST /conversations/{id}/transfer {targetPrincipalId, expectedRevision, reason?}` |
| Trả lại pool | `canRelease` | `POST /conversations/{id}/release {expectedRevision, reason?}` |
| Chờ khách phản hồi / Đóng | `canResolve` | `PATCH /conversations/{id}/status {status:'pending_customer'\|'resolved', expectedRevision}` |
| Mở lại | `canReopen` | `PATCH …/status {status:'open', expectedRevision}` |
| Thêm/gỡ người hỗ trợ cho người khác | `canManageParticipants` | `POST /conversations/{id}/participants {principalId, role:'collaborator', expectedRevision}` / `DELETE …/participants/{principalId}?expectedRevision=` |

**Dialog chuyển (`TransferDialog`)** lấy danh sách từ `GET /queues/support-default/members`, bỏ chính mình. Danh bạ này chỉ có nhân viên **đã mở Chat ít nhất một lần** (Gateway chưa có principal cho người chưa đăng nhập). Dialog ghi rõ "Chỉ hiện đồng nghiệp đã từng vào Chat". Lý do chuyển không bắt buộc, tối đa 500 ký tự. Sau khi chuyển, người chuyển mất quyền trả lời; banner đổi sang "{owner mới} đang chăm sóc" kèm nút Tham gia hỗ trợ.

- Nhận đồng thời: Gateway CAS bảo đảm chỉ một người thắng. Người thua nhận 409 `ALREADY_CLAIMED` hoặc `REVISION_CONFLICT`; UI refetch rồi hiện toast "{owner} vừa nhận khách này. Bạn có thể Tham gia hỗ trợ", không báo lỗi đỏ.
- Mọi thao tác đổi owner, người hỗ trợ hay trạng thái đều gửi `expectedRevision` lấy từ dữ liệu đang hiển thị. Gặp 409 thì refetch, không tự thử lại.
- `message` trong lỗi Gateway dành cho dev, không hiển thị cho nhân viên. UI tự ánh xạ `code` sang tiếng Việt (bảng đủ theo integration-guide §10):

| `code` | UI |
|---|---|
| `ALREADY_CLAIMED` | Refetch, toast "Đồng nghiệp vừa nhận khách này", gợi ý Tham gia hỗ trợ |
| `REVISION_CONFLICT` | Refetch, "Hội thoại vừa thay đổi, đã tải lại". Không tự thử lại |
| `INVALID_TRANSITION` | Refetch, "Trạng thái hội thoại đã đổi, đã tải lại" |
| `CONVERSATION_RESOLVED` | "Hội thoại đã kết thúc", giữ draft; hiện nút Mở lại nếu `canReopen` |
| `FORBIDDEN` | Refetch để cập nhật `capabilities`, "Bạn không còn quyền thao tác này" |
| `NOT_FOUND` | Gỡ hội thoại khỏi danh sách đang hiển thị, đóng thread nếu đang mở, "Hội thoại không còn trong phạm vi của bạn" |
| `VALIDATION_FAILED` / `PAYLOAD_TOO_LARGE` | Báo tại ô nhập; nếu do cursor thì bỏ cursor và tải lại từ trang đầu |
| `ENGINE_NOT_READY` / `DEPENDENCY_FAILED` | "Máy chủ chat đang bận, đang thử lại", backoff khi `retryable` |
| `IDEMPOTENCY_KEY_REUSED` | Lỗi code client: `console.error`, toast chung |
| `INTERNAL` / code lạ | Toast chung "Không thực hiện được, thử lại sau" |

Toast kèm `correlationId` dạng nhỏ để tra log. Khóa nút trong lúc một thao tác đang chạy, tránh bấm lặp (Gateway chưa có rate limit).

### 5.5. Thread và composer

- Lịch sử: `GET /conversations/{id}/messages` trả **mới nhất trước**, phân trang cursor; đảo thứ tự khi hiển thị. Tải thêm tin cũ khi cuộn lên và giữ vị trí cuộn. Khi `message.created` đến, tải lại trang mới nhất và ghép theo `id` (không trùng). Tin `internal` hiển thị nền vàng nhạt, nhãn "Ghi chú nội bộ — khách không thấy".
- Trạng thái đồng bộ của hội thoại:
  - `syncState: 'pending'` (hội thoại mới, engine đang khởi tạo): composer khóa với lý do "Đang khởi tạo hội thoại…", đọc lại `GET /conversations/{id}` theo nhịp 1 → 2 → 4 giây, tối đa ~30 giây, tới khi `ready`;
  - `syncState: 'failed'`: banner đỏ "Hội thoại chưa đồng bộ được với máy chủ chat", composer khóa, có nút Tải lại;
  - `needsReview: true`: badge "Cần kiểm tra" trên dòng pool và banner nhỏ trong thread. Không chặn thao tác.
- Nhân viên thấy **tên thật** của từng người gửi phía CSKH. Khách chỉ thấy "CSKH SHS" (GW-10). Composer ghi nhỏ "Khách sẽ thấy tên: CSKH SHS" để nhân viên không ký tên cá nhân vào tin nếu không cần.
- Hiển thị text theo D27 (`MessageItem` + `linkify.ts`):
  - text node + `white-space: pre-wrap`, không dùng `dangerouslySetInnerHTML`;
  - chỉ URL `http/https` thành link, mở `target="_blank" rel="noopener noreferrer"`;
  - hiển thị đúng URL thật.
- Composer:
  - hai chế độ **Trả lời khách** / **Ghi chú nội bộ**, chọn bằng segmented control có màu khác hẳn nhau; chế độ ghi chú đổi viền và placeholder;
  - mặc định luôn là Trả lời khách khi mở hội thoại; mở lại thì giữ chế độ theo draft;
  - Enter gửi, Shift+Enter xuống dòng; giới hạn 8.000 ký tự, đếm theo code point;
  - disable kèm lý do khi `capabilities.canReply`/`canAddNote` là false hoặc hội thoại `syncState='pending'` ("Đang khởi tạo hội thoại…").
- Gửi tin:
  - sinh `clientMessageId = crypto.randomUUID()` một lần cho mỗi tin; retry dùng lại đúng id **và đúng nội dung** đó; khóa nút Gửi trong lúc đang gửi để double-click không tạo hai id;
  - 201 → ghép Message vào dòng "đang gửi";
  - 202 → đọc `MessageReceipt.status`:
    - `processing` → trạng thái "Đang gửi…", tra `GET /message-requests/{clientMessageId}?conversationId={id}` có backoff;
    - `accepted` + `messageId` → coi như đã gửi, tải lại trang tin mới nhất;
    - `unknown` → "Chưa xác định được đã gửi — kiểm tra lịch sử" kèm nút tải lại, **không tự gửi lại**;
    - `rejected` → "Tin không gửi được", trả nội dung về composer để nhân viên sửa/gửi lại (gửi lại là tin mới, `clientMessageId` mới);
  - 503 `ENGINE_NOT_READY` → giữ nguyên draft, chờ `syncState: 'ready'` như trên rồi gửi;
  - 409 `CONVERSATION_RESOLVED` → giữ draft, xem bảng lỗi §5.4.
- Draft giữ theo `${principalId}:${conversationId}` trong RAM khi chuyển hội thoại hoặc resize. Không lưu draft xuống storage vì có thể chứa thông tin khách.
- Đánh dấu đã đọc: `POST /read {lastReadMessageId}` chỉ khi tab đang hiển thị (`document.visibilityState === 'visible'`), hội thoại đang mở **và tin cuối thực sự nằm trong vùng nhìn thấy** (IntersectionObserver). Mở thread mà đang cuộn ở tin cũ thì chưa tính là đã đọc. Mốc đọc chỉ tăng; response có thể trả mốc mới hơn (do tab khác) thì dùng mốc đó.

### 5.6. Thông báo trong ứng dụng (PROPOSED)

- Badge số chưa đọc trên menu "Chat khách hàng" và tiền tố `(N)` trên `document.title`. N là tổng `unreadCount` của tab **Của tôi** cộng tab **Chưa nhận** đã tải. Với quyền `read` thì không hiện badge.
- Âm báo nhẹ khi có hội thoại mới vào tab **Chưa nhận**, có nút tắt nhớ theo thiết bị (localStorage chỉ cho preference, giống theme).
- Browser Notification API: **OPEN** (cần xin quyền trình duyệt, nội dung thông báo không được chứa text tin nhắn).

### 5.7. Thiết kế

Tuân DESIGN.md:
- cam chỉ dùng cho hành động chính (Nhận xử lý, Gửi) và mục đang chọn;
- nút luôn có nhãn chữ; giữ trạng thái focus;
- dark mode dùng token sẵn có; tôn trọng `prefers-reduced-motion`.

Không tạo vùng cuộn lồng nhau ngoài hai cột pool và thread. Cần thêm hồ sơ màn hình `docs/screens`, nếu CSKH áp dụng quy ước này, cho: SCR-CHAT-POOL, PNL-CHAT-THREAD, DLG-CHAT-TRANSFER.

## 6. Dữ liệu và bảo mật

- Supabase **không lưu** nội dung chat, access token Gateway, assertion hay STK. Chỉ có `chat_access`, `chat_synced_at`, `chat_sync_error` trên `app_users`.
- Private key ký assertion và admin key chỉ ở Supabase secrets. `scripts/check-public-bundle.mjs` thêm kiểm tra bundle không chứa `CHAT_ADMIN_KEY`, `BEGIN PRIVATE KEY`, `CHAT_ASSERTION`.
- `.env.example` chỉ thêm `VITE_CHAT_GATEWAY_URL` (công khai được) nếu không lấy từ response của `chat-session`. Đề xuất lấy từ response để đổi môi trường không phải build lại.
- Gateway phải có origin CSKH trong `ALLOWED_ORIGINS` (GW-06), nếu không mọi request từ trình duyệt bị 403.
- Log phía CSKH (console, toast) chỉ ghi `code` và `correlationId`, không ghi nội dung tin hay token.
- Test không gửi tin tới khách thật. Chỉ dùng persona tổng hợp (`example.test`, STK dạng `TEST-…`).

## 7. Kế hoạch theo pha

| Pha | Việc | Phụ thuộc | Hoàn thành khi |
|---|---|---|---|
| **C0 — Chuẩn bị** | Local: Gateway chạy theo §0 (làm ngay). PoC: gửi Chat-server public key `cskh-desk` và domain production của CSKH để cấu hình GW-06; đặt Supabase secrets | Local không phụ thuộc; PoC chờ GW-06 | Local: assertion ký bằng Edge Function mở được phiên staff. PoC: như trên với URL PoC |
| **C1 — Quyền và đồng bộ** | Migration 024; `admin-users` + action `sync-chat`; select quyền trên Users; backfill | C0 | Bật/tắt quyền → Gateway `GET /admin/staff` phản ánh đúng; khóa tài khoản → phiên chat đang mở bị cắt |
| **C2 — Phiên chat** | Edge Function `chat-session` + test; `session.ts`, `gateway.ts`; route `/chat` rỗng có trạng thái kết nối | C1 | Vào `/chat` có phiên; để quá 5 phút vẫn tự gia hạn; logout thu hồi |
| **C3 — Pool + thread chỉ đọc + realtime** | QueuePanel, tab, badge người chăm sóc, ThreadView, `realtime.ts`, chế độ `read` | C2 (GW-02/03/04/08 đã có) | Khách gửi tin từ SHOne (hoặc script giả) hiện trong pool ≤2 s; reconnect không mất tin |
| **C4 — Xử lý** | Nhận xử lý, trả lời, ghi chú nội bộ, tham gia/rời hỗ trợ, trả lại pool, đóng/mở lại, chuyển cho đồng nghiệp (agent và supervisor) | C3 (GW-01/05/09/10/11 đã có) | Kịch bản §8.2 pass trên Gateway local, sau đó trên PoC khi có GW-06 |
| **C5 — Hoàn thiện** | Responsive tablet/phone, a11y bàn phím, badge chưa đọc/âm báo, linkify, kiểm bundle, tài liệu `docs/CHAT.md` + validation | C4 | Checklist §8 pass, cập nhật README phần chức năng |

## 8. Kiểm thử và nghiệm thu

### 8.1. Tự động

- `vitest`:
  - `linkify.ts`: không thành link với `javascript:`, `data:`, URL dính dấu câu tiếng Việt; tách đúng nhiều URL;
  - `session.ts`: gia hạn đúng hạn, nhiều request đồng thời chỉ gia hạn một lần (single-flight), 401 chỉ thử lại một lần, 403 dừng, mỗi lần thử lại dùng assertion mới;
  - `realtime.ts` với WebSocket giả: chờ `ready` rồi mới tải snapshot và áp event đã gom; backoff; dừng ở 4403; dedup `eventId`; event `revision: null` luôn được áp; `sync.required`;
  - xử lý receipt gửi tin: `processing` → tra lại, `unknown` không gửi lại, `rejected` trả nội dung về composer;
  - `contract.ts`: field lạ bị bỏ qua, enum lạ fail closed;
  - reducer badge người chăm sóc;
  - `drafts.ts` không lẫn giữa hai principal.
- `scripts/test-chat-session.mjs` (§4) và `scripts/test-chat-sync.mjs`:
  - tạo user test → bật quyền → Gateway có đăng ký → khóa → Gateway disabled và phiên bị cắt → dọn dữ liệu;
  - đổi vai trò sang Chỉ xem khi đang `agent` → 400 tiếng Việt, DB không đổi;
  - Gateway tắt khi bật quyền → DB đã ghi, response `chatSync:'failed'`, `chat_sync_error` có giá trị;
  - đăng ký mồ côi ở Gateway (subject không còn trong DB) → `sync-chat {all:true}` gọi DELETE.
- `scripts/test-chat-ui.mjs` (Playwright, theo kiểu `test-care-ui.mjs`), chạy với Gateway local của Chat-server:
  - `npm run dev:local` ở Chat-server, có `ASSERTION_ISSUERS` chứa public key test;
  - script phía khách ký assertion `shone-app` giả để tạo hội thoại.

### 8.2. Kịch bản nghiệm thu (persona tổng hợp)

Mã trong ngoặc là case ở Chat-server `docs/testing.md`.

1. Khách A tạo hội thoại → xuất hiện ở **Chưa nhận** của NV1 và NV2 (Q01, R01).
2. NV1 và NV2 bấm **Nhận xử lý** cùng lúc → đúng một người thành owner, người kia thấy toast và badge "Đang được NV1 chăm sóc" (Q02).
3. NV2 **Tham gia hỗ trợ** → trả lời được; CSKH thấy người gửi là NV2, khách chỉ thấy "CSKH SHS", kể cả qua realtime/event (M03, GW-01, GW-10).
4. NV1 ghi chú nội bộ → NV2 thấy, khách không thấy, kể cả qua realtime (I07).
5. NV1 (agent thường) **chuyển** hội thoại cho NV2 → NV2 thành owner, NV1 không còn quyền trả lời trừ khi tham gia lại (Q03, GW-11). NV2 trả lại pool → hội thoại về **Chưa nhận** (Q03).
5b. Tài khoản Chỉ xem có `read` → thấy pool và lịch sử, không có composer hay nút thao tác. Gọi thẳng API claim/send bằng phiên đó → 403 (GW-08).
6. Đóng hội thoại → chuyển sang **Đã xong**. Khách không nhắn tiếp được vào hội thoại đã đóng: SHOne cho khách bấm "Yêu cầu mới", tạo hội thoại mới vào pool. Nhân viên phụ trách hoặc giám sát vẫn mở lại được hội thoại cũ. Hội thoại ở "Chờ khách" tự về "Đang xử lý" khi khách trả lời (Q05).
7. Admin hạ NV2 về `none` → trong ≤5 s, WS của NV2 đóng và trang báo mất quyền (I09).
8. Tài khoản chưa có quyền Chat (kể cả Admin chưa tự bật) gọi `chat-session` → 403. Gọi Gateway bằng assertion tự ký khóa lạ → 401 (I01, I04).
9. Tin chứa `<script>`, `<img onerror>`, `javascript:` → hiển thị nguyên văn, không thực thi (S06).
10. Resize desktop → tablet → phone khi đang soạn → draft còn nguyên, đúng hội thoại (S05).

### 8.3. Hiệu năng mục tiêu (PROPOSED)

- Mở `/chat` khi Gateway đang ấm: pool hiển thị ≤1,5 s.
- Tin mới hiện trên màn nhân viên ≤2 s sau khi khách gửi.
- Bấm Nhận xử lý → phản hồi ≤1 s.

Đo trên PoC Hobby chỉ mang tính tham khảo, vì Chatwoot có cold start khoảng 20 s và gửi tin khoảng 3 s (xem evidence Chat-server).

## 9. Việc phải làm ở Chat Server trước (GW)

Phần này làm ở repo Chat-server; mỗi mục kèm schema, test và cập nhật `chat-api.md`.

**Trạng thái 23/10/2026:** GW-01–05 và GW-08–11 **đã xong và đã deploy PoC** (commit `ce1d50b`, 88/88 test). **GW-06 còn chờ:** public key `cskh-desk` và domain production của CSKH. GW-07 hoãn. Cột "Chặn pha" bên dưới chỉ còn ý nghĩa với GW-06/07. Tên tham số thật theo `chat-api.md` §4:
- lọc queue: `GET /queues/{id}/conversations?owner=none|me|others&mine=true&accountRef=…`;
- tham gia/rời: `POST /conversations/{id}/join` và `/leave` với `{expectedRevision}`;
- danh bạ: `GET /queues/{id}/members`, chỉ gồm nhân viên **đã đăng nhập chat ít nhất một lần**.

| ID | Việc | Vì sao CSKH cần | Chặn pha |
|---|---|---|---|
| GW-01 | `POST /conversations/{id}/join` và `/leave`: nhân viên trong queue tự thêm/gỡ mình làm collaborator, có audit và event | REQUIRED "đồng nghiệp vẫn tham gia được". Hiện chỉ owner/supervisor thêm được người hỗ trợ | C4 |
| GW-02 | Conversation DTO cho staff có `participants: [{id, displayName, role}]` | Badge "+N người hỗ trợ", banner "Bạn đang hỗ trợ" | C3 |
| GW-03 | Conversation DTO cho staff có `customer: {displayName}` | Pool phải hiện tên khách, không chỉ STK | C3 |
| GW-04 | Lọc queue theo `owner=none\|me\|others`, `mine=true` (owner hoặc người hỗ trợ là tôi) và tìm theo STK (`accountRef`) | Tab Chưa nhận/Đang có người đúng trên nhiều trang | C3 |
| GW-05 | `capabilities` bổ sung `canRelease`, `canManageParticipants`, `canJoin`, `canLeave`, `canReopen` | UI hiện đúng nút theo quyền server | C4 |
| GW-06 | Cấu hình PoC: `ASSERTION_ISSUERS` (`cskh-desk`, `shone-app`), `ADMIN_KEY_HASHES`, `ALLOWED_ORIGINS` có domain CSKH | Không có thì không mở được phiên | C0 |
| GW-07 | Định tuyến queue theo issuer/nguồn | Nhiều điểm tiếp nhận | Sau C5 |
| GW-08 | Vai trò staff chỉ đọc `observer`: đọc queue và lịch sử (kể cả internal), không có quyền thao tác nào | DECIDED: Chỉ xem được xem lịch sử chat | C3 |
| GW-09 | Danh bạ nhân viên trong queue cho staff (`GET /queues/{id}/members`: principalId, displayName, roles; không trả observer) | Agent chọn người nhận khi chuyển, vì `targetPrincipalId` là principal ID Gateway, không phải `app_users.id` | C4 |
| GW-10 | Serializer phía khách thay mọi tên/ID staff bằng alias tenant (`CUSTOMER_STAFF_ALIAS`, mặc định "CSKH SHS"): `sender.displayName`, `sender.id` (ID cố định, không lộ principal), `owner` trong Conversation, payload event | DECIDED: khách chỉ thấy "CSKH SHS" | C4 (và là điều kiện để SHOne hiển thị) |
| GW-11 | Đổi D18: agent là owner được transfer hội thoại của mình cho agent/supervisor khác cùng queue; supervisor transfer mọi hội thoại. Đích phải active và không phải observer | DECIDED: NV thường chuyển cho nhau được | C4 |

## 10. Phối hợp với phía SHOne

Plan bên SHOne (`D:\Dev\SHOne_real`) cần khớp các điểm sau. Trích từ chat-api, không tự quyết thay bên đó:

- Backend SHOne ký assertion `iss=shone-app`, `kind=customer`, `sub` là ID đăng nhập bất biến, `account_refs` là các STK đã xác thực thuộc người dùng. **Không** nhận STK do frontend tự gửi.
- Khách tạo hội thoại `kind=support` với `accountRef` thuộc phiên, `subject` ≤200 ký tự, `clientRequestId` dùng một lần.
- Hiển thị tin dạng plain text + linkify (D27), cùng quy tắc như §5.5.
- **DECIDED:** khách chỉ thấy tên chung "CSKH SHS" cho mọi tin phía CSKH. Gateway đảm bảo việc này ở serializer phía khách (GW-10), nên SHOne cứ hiển thị `sender.displayName` như nhận được. Không tự suy tên nhân viên từ nguồn khác. Owner của hội thoại phía khách cũng là alias.

## 11. Quyết định và câu hỏi còn mở

Đã chốt ngày 23/10/2026:

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Admin có mặc nhiên được chat? | Không. Phải bật quyền Chat; Admin tự bật được cho mình (§3.1, §3.2) |
| 2 | Chỉ xem có xem lịch sử chat? | Có, với quyền `read` (GW-08) |
| 3 | Agent thường chuyển/tham gia? | Có: chuyển hội thoại cho nhau (GW-11) và cùng tham gia một khách (GW-01) |
| 4 | Khách thấy tên gì? | Chỉ "CSKH SHS" (GW-10) |
| 5 | Tin tự động ngoài giờ? | **Chưa cần** ở đợt đầu. Tin khách nằm chờ trong pool tới khi có người nhận |
| 6 | Một pool hay chia nhóm? | **Một pool chung** `support-default` cho mọi nhân viên có quyền Chat. Chưa làm GW-07; §3.3 giữ làm hướng mở rộng |

Còn mở:

7. PROPOSED: quyền `read` thấy cả ghi chú nội bộ. **Gateway hiện đang trả ghi chú nội bộ cho observer.** Nếu Đại ca muốn ẩn thì phải sửa Gateway trước khi CSKH dựng chế độ chỉ đọc.
