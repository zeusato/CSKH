# Hướng dẫn tích hợp SHS Chat Gateway

Cập nhật vận hành 26/10/2026: frontend/native dùng **GET /wake** trước login, không cookie/Authorization/proof, theo OpenAPI. 200 `{ok:true,cached:boolean}` hoặc202 `{ok:false,warming:true,retryAfterMs}`; không dùng làm readiness chat. Ping20giây/timeout60giây, không chồng, lỗi giãn40/80/160/300giây, không UI/log lỗi. Origin web cần `ALLOWED_ORIGINS`; native không Origin được phép. Gateway gộp qua bộ đếm DB20giây. `GET /internal/warmup` vẫn chỉ dành cho GitHub runner/server có khóa riêng; frontend không giữ khóa. `/health` chỉ kiểm Gateway. Đã code local cả bốn repo, chưa deploy; quy trình ở `docs/operations-warmup.md`.

Dành cho dev của nền tảng muốn nối vào Chat Gateway: app/web của khách hoặc trang nhân viên. File này đọc độc lập được khi chép sang repo khác. Đi kèm [`openapi.yaml`](openapi.yaml) là spec REST máy đọc được (import vào Postman, Swagger UI, hoặc sinh client).

- Nguồn: repo `zeusato/Chat-server`, commit `ce1d50b` (23/10/2026). Khi có bản mới, lấy lại cả hai file.
- Spec chi tiết hơn (quy tắc nội bộ, quyết định thiết kế) nằm ở `docs/contracts/chat-api.md` của repo Chat-server. Bên tích hợp không cần đọc file đó.

## Mục lục

1. [Mô hình tổng quát](#1-mô-hình-tổng-quát)
2. [Đăng ký nền tảng (làm một lần)](#2-đăng-ký-nền-tảng-làm-một-lần)
3. [Ký assertion ở backend](#3-ký-assertion-ở-backend)
4. [Phiên chat ở client](#4-phiên-chat-ở-client)
5. [Luồng app khách hàng](#5-luồng-app-khách-hàng)
6. [Luồng trang nhân viên](#6-luồng-trang-nhân-viên)
7. [Realtime (WebSocket)](#7-realtime-websocket)
8. [Gửi tin an toàn: idempotency và receipt](#8-gửi-tin-an-toàn-idempotency-và-receipt)
9. [Hiển thị tin: plain text và link](#9-hiển-thị-tin-plain-text-và-link)
10. [Xử lý lỗi](#10-xử-lý-lỗi)
11. [Môi trường và chạy local](#11-môi-trường-và-chạy-local)
12. [Checklist trước khi go-live](#12-checklist-trước-khi-go-live)
13. [Câu hỏi thường gặp](#13-câu-hỏi-thường-gặp)

---

## 1. Mô hình tổng quát

```
 Backend nền tảng ──(1) ký assertion Ed25519──► Frontend nền tảng
                                                    │
                                                    │ (2) POST /v1/chat/sessions {proof}
                                                    ▼
                                             Chat Gateway ──► engine nội bộ (Chatwoot, không public)
                                                    ▲
                                                    │ (3) REST + WebSocket với Bearer access token
                                                    │
                                             Frontend nền tảng
```

- **Gateway quyết định mọi quyền.** Nền tảng chỉ chứng minh danh tính người dùng. Nút trên UI bật/tắt theo cờ `capabilities` Gateway trả về, không tự suy từ vai trò.
- **Hai loại người dùng:**
  - **Khách hàng** (`customer`): được nhận diện theo STK mà backend nền tảng đã xác thực và ký. Tự tạo hội thoại và nhắn tin.
  - **Nhân viên** (`staff`): danh tính do trang nhân viên ký; **vai trò và queue lấy từ sổ đăng ký** của Gateway, không lấy từ token.
- **Tenant** là biên dữ liệu: mọi nền tảng của cùng một tổ chức dùng chung tenant (SHS là `shs`). Cùng một STK ở hai tenant là hai khách khác nhau.
- **Khách luôn thấy ID chung** cố định cho nhân viên. Ở kênh CSKH (`support`) tên cũng là tên chung (mặc định `"CSKH SHS"`); ở kênh môi giới (`advisory`) khách thấy **tên riêng của môi giới** (D31). Nhân viên thấy tên thật của nhau.
- **Kênh môi giới quản lý** (`advisory`): môi giới định danh bằng **broker ID** (`remNo`, D35). Phân công lấy từ claim `advisors` trong assertion khách; app môi giới không gửi danh sách khách. Xem §5.5 và §6.4.
- **Tin nhắn chỉ là plain text.** Không có HTML, Markdown, ảnh hay file.

Base path: `/v1/chat`. Mọi ví dụ dưới đây viết `G = https://<gateway-host>/v1/chat`.

## 2. Đăng ký nền tảng (làm một lần)

Gửi cho người quản trị Gateway:

| Thông tin | Ví dụ | Ghi chú |
|---|---|---|
| Tên issuer | `shone-app`, `cskh-desk` | Cố định, duy nhất. Không bắt đầu bằng `fixture:` |
| Loại người dùng nền tảng được phát | `customer` hoặc `staff` | App khách chỉ được `customer`; trang nhân viên chỉ được `staff` |
| Public key Ed25519 | `{ "kid": "2026-10", "x": "<base64url 32 byte>" }` | **Chỉ public key.** Private key ở lại backend của bạn |
| Cờ kênh môi giới (tùy chọn) | `assertsAdvisors: true` hoặc `"optional"` lúc chuyển tiếp (issuer khách), `advisorDirectory: true` (issuer môi giới) | Xem §5.5, §6.4. Mỗi tenant tối đa một issuer `advisorDirectory` |
| Danh sách origin của web | `https://app.example.vn`, `https://staging.example.vn`, `http://127.0.0.1:5173` | Request có `Origin` ngoài danh sách bị 403. URL preview đổi theo từng deploy sẽ bị chặn nếu không được thêm |

Trang nhân viên nhận thêm từ quản trị Gateway một **admin key** của tenant, để đồng bộ sổ nhân viên (§6.1). Admin key chỉ đặt ở server, không bao giờ vào frontend.

Sinh cặp khóa (Node ≥ 22, không cần thư viện):

```typescript
import { generateKeyPairSync } from 'node:crypto';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const x = (publicKey.export({ format: 'jwk' }) as { x: string }).x;    // gửi { kid, x } cho Gateway
const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });         // cất vào secret store của backend
```

**Xoay khóa:** gửi `kid` mới cho Gateway thêm vào → backend chuyển sang ký bằng kid mới → báo Gateway gỡ kid cũ. Hai kid cùng hợp lệ trong lúc chuyển.

## 3. Ký assertion ở backend

Assertion là JWT ký EdDSA. Backend của bạn ký **mỗi lần client cần mở phiên chat**, sau khi chính backend đã xác thực người dùng. Frontend không bao giờ giữ private key và không tự ghép claim.

Header: `{"alg":"EdDSA","typ":"JWT","kid":"<kid>"}`.

| Claim | Khách | Nhân viên | Quy tắc |
|---|---|---|---|
| `iss` | ✓ | ✓ | Tên issuer đã đăng ký |
| `aud` | ✓ | ✓ | `"chat-gateway"` |
| `sub` | ✓ | ✓ | ID người dùng **bất biến** ở nền tảng, ≤256 ký tự. Không dùng email, SĐT hay tên |
| `kind` | `"customer"` | `"staff"` | Phải nằm trong loại issuer được phát |
| `name` | ✓ | ✓ | Tên thật, ≤200 ký tự. Nhân viên thấy tên khách lấy từ claim này |
| `account_refs` | ✓ (≥1) | ✗ | Mảng STK dạng **chuỗi** (giữ số 0 đầu, ≤64 ký tự) mà backend đã xác thực thuộc người dùng |
| `advisors` | issuer `assertsAdvisors: true`: ✓; `"optional"`: tùy chọn | ✗ | Mảng `{account_ref, advisor_ref, advisor_name}`, tối đa một phần tử mỗi STK. `advisor_ref` = broker ID (`remNo`), Gateway chuẩn hóa trim + chữ hoa, phải khớp `[A-Z0-9._-]{1,64}`. Không có môi giới thì gửi `[]`, **không bỏ claim**. Issuer không khai cờ mà gửi claim thì bị từ chối |
| `sid` | ✓ | ✓ | ID phiên đăng nhập ở nền tảng (dùng làm tham chiếu) |
| `sid_exp` | ✓ | ✓ | Hạn phiên đăng nhập, **giây** epoch. Phiên chat không dài hơn mốc này |
| `jti` | ✓ | ✓ | Nonce ngẫu nhiên ≤128 ký tự. Mỗi assertion chỉ dùng được **một lần** |
| `iat`, `exp` | ✓ | ✓ | **Giây** epoch; `exp − iat ≤ 60`; lệch đồng hồ cho phép 5 giây |
| `nbf` | – | – | Tùy chọn |
| `roles`, `queue_ids` | ✗ | ✗ | Có là bị từ chối. Quyền nhân viên do sổ đăng ký quản lý |

Code ký (Node, không thư viện):

```typescript
import { createPrivateKey, randomUUID, sign } from 'node:crypto';

const key = createPrivateKey(process.env.CHAT_ASSERTION_PRIVATE_KEY!); // PEM PKCS#8
const KID = process.env.CHAT_ASSERTION_KID!;
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function signChatAssertion(u: {
  sub: string; name: string; kind: 'customer' | 'staff'; accountRefs?: string[]; sid: string; sidExpSec: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'EdDSA', typ: 'JWT', kid: KID });
  const body = b64({
    iss: 'shone-app', aud: 'chat-gateway', sub: u.sub, kind: u.kind, name: u.name,
    ...(u.kind === 'customer' ? { account_refs: u.accountRefs } : {}),
    sid: u.sid, sid_exp: u.sidExpSec, jti: randomUUID(), iat: now, exp: now + 60,
  });
  const sig = sign(null, Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${sig}`;
}
```

Deno / Supabase Edge Function (WebCrypto):

```typescript
const pem = Deno.env.get('CHAT_ASSERTION_PRIVATE_KEY')!;
const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
const key = await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']); // import một lần
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o: object) => b64u(new TextEncoder().encode(JSON.stringify(o)));

async function signChatAssertion(claims: Record<string, unknown>, kid: string) {
  const data = `${enc({ alg: 'EdDSA', typ: 'JWT', kid })}.${enc(claims)}`;
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(data)));
  return `${data}.${b64u(sig)}`;
}
```

Thư viện JWT có EdDSA (jose, PyJWT + cryptography, golang-jwt, java-jwt…) cũng dùng được, miễn ra đúng header và claim như trên.

Endpoint backend của bạn trả assertion cho frontend phải:
- kiểm lại phiên đăng nhập của chính nền tảng;
- kiểm CSRF/Origin;
- trả `Cache-Control: no-store`;
- không log assertion.

Nếu người dùng không đủ điều kiện (khách chưa có STK hợp lệ, nhân viên chưa được cấp quyền) thì backend **từ chối ký**, không ký "thử".

## 4. Phiên chat ở client

```http
POST {G}/sessions
Content-Type: application/json

{ "proof": "<assertion>" }
```

→ `201`:

```json
{
  "accessToken": "…",
  "expiresAt": "2026-10-23T03:05:00.000Z",
  "principal": { "id": "<uuid>", "kind": "customer", "displayName": "Nguyễn Văn A" },
  "capabilities": { "roles": [], "queueIds": [], "accountRefs": ["058C000001"] }
}
```

Quy tắc:
- Gọi mọi API khác bằng `Authorization: Bearer <accessToken>`.
- Token **chỉ giữ trong RAM**. Không localStorage/sessionStorage/cookie/URL/log.
- Token sống tối đa 5 phút và không vượt `sid_exp`. **Chưa có endpoint refresh**: khoảng 30–60 giây trước `expiresAt`, xin assertion mới từ backend rồi gọi lại `POST /sessions`. Làm single-flight: nhiều request cùng lúc chỉ gia hạn một lần.
- Gặp 401: gia hạn **một lần** rồi thử lại request. Vẫn 401 thì dừng và báo người dùng.
- Gặp 403 ở `POST /sessions`: người dùng không còn quyền chat. Dừng, không lặp.
- Logout hoặc đổi người dùng: `DELETE {G}/sessions/current`, đóng WebSocket, xóa cache và draft của người cũ **trước khi** nạp người mới.

Client tối thiểu:

```typescript
type Grant = { accessToken: string; expiresAt: string; principal: { id: string; kind: 'customer' | 'staff'; displayName: string } };

export class ChatClient {
  private grant: Grant | null = null;
  private renewing: Promise<Grant> | null = null;
  constructor(private base: string, private getAssertion: () => Promise<string>) {}

  private async renew(): Promise<Grant> {
    this.renewing ??= (async () => {
      const res = await fetch(`${this.base}/sessions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit',
        body: JSON.stringify({ proof: await this.getAssertion() }),
      });
      if (!res.ok) throw await ChatError.from(res);
      return (this.grant = (await res.json()) as Grant);
    })().finally(() => { this.renewing = null; });
    return this.renewing;
  }

  private async token(): Promise<string> {
    const g = this.grant;
    if (!g || Date.parse(g.expiresAt) - Date.now() < 45_000) return (await this.renew()).accessToken;
    return g.accessToken;
  }

  async call<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method, credentials: 'omit',
      headers: { authorization: `Bearer ${await this.token()}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && !retried) { this.grant = null; return this.call(method, path, body, true); }
    if (!res.ok) throw await ChatError.from(res);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async logout() {
    const g = this.grant; this.grant = null;
    if (g) await fetch(`${this.base}/sessions/current`, { method: 'DELETE', headers: { authorization: `Bearer ${g.accessToken}` } }).catch(() => {});
  }
}

export class ChatError extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryable: boolean, readonly correlationId: string) { super(code); }
  static async from(res: Response) {
    const b = await res.json().catch(() => ({}));
    return new ChatError(res.status, b.code ?? 'INTERNAL', b.retryable === true, b.correlationId ?? '');
  }
}
```

## 5. Luồng app khách hàng

### 5.1. Mở widget và đếm chưa đọc

1. Khi khách đủ điều kiện (đã đăng nhập, có STK hợp lệ): mở phiên (§4) và WebSocket (§7), kể cả khi cửa sổ chat đang đóng, để có badge chưa đọc.
2. `GET {G}/conversations?kind=support&limit=100`, đọc hết các trang theo `nextCursor`. Tổng chưa đọc là tổng `unreadCount` các hội thoại.
3. **Không tạo hội thoại chỉ vì khách mở widget.** Tạo ở lần gửi tin đầu tiên.

### 5.2. Tạo hội thoại và gửi tin đầu

```http
POST {G}/conversations
{ "kind": "support", "accountRef": "058C000001", "subject": "Hỗ trợ khách hàng", "clientRequestId": "<uuid mới cho lần tạo này>" }
```

- `accountRef` phải nằm trong `capabilities.accountRefs` của phiên.
- Gửi lại cùng `clientRequestId` (do timeout, double-click) thì Gateway trả lại **đúng** hội thoại cũ, không tạo thêm.
- Hội thoại mới có `syncState: "pending"` trong vài giây, vì engine còn đang khởi tạo. Gửi tin lúc này nhận 503 `ENGINE_NOT_READY`:
  - giữ draft, đọc lại `GET {G}/conversations/{id}` theo nhịp 1 → 2 → 4 giây (tối đa ~30 giây) tới khi `syncState: "ready"`, rồi gửi;
  - không tạo hội thoại thứ hai khi chờ lâu.
- Gateway không chặn một khách có nhiều hội thoại đang mở, nhưng nhân viên làm việc trên **một pool chung**. Vì vậy **luôn tiếp tục hội thoại chưa đóng gần nhất**; chỉ tạo mới khi không còn hội thoại mở, hoặc khi khách bấm "Yêu cầu mới".

### 5.3. Trạng thái hội thoại phía khách

| `status` | Hiển thị gợi ý | Hành vi |
|---|---|---|
| `open` + `owner = null` | "Đang chờ tiếp nhận" | Gửi tin bình thường |
| `open` + `owner ≠ null` | "CSKH SHS đang hỗ trợ" | `owner.displayName` luôn là tên chung |
| `pending_customer` | "Chờ bạn phản hồi" | Khách nhắn là tự về `open`, không cần gọi API |
| `resolved` | "Đã kết thúc" | `canReply = false`. Hiện nút "Yêu cầu mới" (tạo hội thoại mới) |

Phía khách:
- **Không dùng `owner.id` hay `sender.id` để phân biệt nhân viên.** Mọi nhân viên có cùng ID `00000000-0000-0000-0000-000000000000` và cùng tên. Nhân viên đổi ca hay chuyển cho nhau thì khách không thấy gì đổi.
- Khách không bao giờ nhận ghi chú nội bộ. Nếu lỡ nhận được tin `visibility: "internal"` thì không render, coi là lỗi contract.

### 5.4. Đọc lịch sử và đánh dấu đã đọc

- `GET {G}/conversations/{id}/messages?limit=50` trả **mới nhất trước**. Tải thêm tin cũ bằng `cursor` khi cuộn lên; đảo thứ tự khi hiển thị.
- Chỉ gọi `POST {G}/conversations/{id}/read {lastReadMessageId}` khi tab đang hiển thị, hội thoại đang mở và tin cuối thực sự nằm trong vùng nhìn thấy. Mở panel chưa đủ coi là đã đọc. Mốc đọc chỉ tăng, không lùi.

### 5.5. Kênh môi giới quản lý

Chỉ áp dụng khi issuer khách được khai `assertsAdvisors` (`true`, hoặc `"optional"` trong lúc chuyển tiếp).

Thứ tự bật không gián đoạn kênh CSKH:
1. Gateway: `shone-app` đặt `"assertsAdvisors": "optional"` rồi redeploy. Assertion cũ (chưa có claim) và mới (có claim) đều được nhận.
2. SHOne deploy bản ký claim `advisors` và bật cờ phía SHOne.
3. Khi mọi phiên khách đã mang claim, Gateway đổi sang `"assertsAdvisors": true` rồi redeploy. Từ đây thiếu claim là bị từ chối, để "không có môi giới" luôn được nói rõ bằng `[]`.

Rollback: đặt lại `"optional"` (hoặc bỏ cờ nếu SHOne cũng tắt claim).

- Backend ký `advisors` từ dữ liệu tài khoản đã xác thực (SHOne: `account/information.remNo/remName`). Không nhận mã môi giới từ client.
- Mỗi lần tạo phiên, Gateway đồng bộ phân công theo `iat`. Assertion cũ hơn lần trước bị bỏ qua.
  - Cùng broker ID: giữ hội thoại hiện tại.
  - Đổi hoặc mất môi giới: hội thoại môi giới cũ chuyển `resolved`, kèm event `conversation.updated` có `payload.reason = "advisor_changed"`. Khách không gửi/mở lại được hội thoại đó.
- `POST /conversations {kind:"advisory"}` trả hội thoại chưa đóng của môi giới hiện hành nếu đã có (một thread mỗi môi giới). Không có môi giới thì trả 409 `ADVISOR_UNASSIGNED`.
- `GET /conversations?kind=advisory` chỉ trả hội thoại của môi giới hiện hành. Khách không cần xem lịch sử với môi giới cũ (D36).
- `owner.displayName` và `sender.displayName` là tên riêng của môi giới; `id` vẫn là ID chung.
- Khách nhắn được ngay cả khi môi giới chưa từng đăng nhập. Hội thoại tự gán cho môi giới khi họ vào lần đầu (event `conversation.assigned`).

## 6. Luồng trang nhân viên

### 6.1. Đăng ký nhân viên (server-to-server)

Nhân viên **phải có trong sổ đăng ký** mới mở được phiên. Backend trang nhân viên đồng bộ sổ này mỗi khi bật/tắt quyền, đổi tên hoặc khóa tài khoản:

```http
PUT {G}/admin/staff/{issuer}/{subject}        (URL-encode issuer và subject)
Authorization: Bearer <admin key>
{ "displayName": "Trần Thị B", "roles": ["agent"], "queueIds": ["support-default"] }

DELETE {G}/admin/staff/{issuer}/{subject}     → 204; thu hồi ngay mọi phiên và socket của người đó
GET    {G}/admin/staff                        → { items: StaffRegistration[] } của tenant
```

| Vai trò | Được làm với hội thoại support |
|---|---|
| `agent` | Xem pool; nhận xử lý; trả lời/ghi chú khi là owner hoặc người hỗ trợ; **tự tham gia** hội thoại đã có người phụ trách; **chuyển** hội thoại mình phụ trách cho đồng nghiệp; trả về pool; chuyển "Chờ khách" / đóng / mở lại hội thoại mình phụ trách |
| `supervisor` | Như agent, cộng thêm các thao tác đó trên **mọi** hội thoại trong queue, và thêm/gỡ người hỗ trợ cho người khác |
| `observer` | **Chỉ xem:** pool, lịch sử (kể cả ghi chú nội bộ), event. Mọi thao tác trả 403 |

- PUT tạo/cập nhật registration và principal trong cùng transaction theo (tenant,issuer,subject), giữ nguyên principal ID khi sync lặp hoặc đăng nhập lần đầu. Migration0005 backfill registration cũ thiếu principal. Agent engine được provision lúc đăng nhập hoặc assignment, có lease chống trùng và credential mã hóa.
- Đổi tên/vai trò/queue có hiệu lực ngay ở request kế tiếp, không cần nhân viên đăng nhập lại.
- DELETE cũng khóa được principal staff cũ thiếu registration; chỉ404 nếu cả hai không tồn tại. Khóa principal tăng auth_epoch và thu hồi mọi chat session; ticket/socket bị từ chối ở lần kiểm quyền kế tiếp.
- Gọi `DELETE` (hủy đăng ký) khi khóa tài khoản hoặc gỡ quyền chat. Nếu `DELETE` lỗi phải báo rõ cho quản trị, vì nhân viên đó vẫn mở được phiên mới. Phiên đang mở tự hết hạn sau tối đa 5 phút.
- Lớp chặn thứ hai: backend trang nhân viên **từ chối ký assertion** cho người không còn quyền.

### 6.2. Pool

Tất cả gọi `GET {G}/queues/{queueId}/conversations` (SHS dùng queue `support-default`):

| Tab gợi ý | Query |
|---|---|
| Chưa nhận | `status=open&owner=none` |
| Của tôi | `mine=true` (tôi là owner hoặc người hỗ trợ) |
| Đang có người chăm sóc | `status=open&owner=others` |
| Chờ khách / Đã xong | `status=pending_customer` / `status=resolved` |
| Tìm theo STK | thêm `accountRef=<STK đầy đủ>` |

- Không dùng `GET /conversations` cho tab "Của tôi": với nhân viên, endpoint này trả **mọi** hội thoại trong queue.
- Cursor gắn với bộ lọc. **Đổi tab hoặc ô tìm thì bỏ cursor cũ**: dùng cursor của bộ lọc khác bị 422.
- Không có API đếm tổng. Chỉ hiển thị số tin chưa đọc (cộng `unreadCount`) và "Còn nữa" khi có `nextCursor`.
- Với nhân viên, Conversation có thêm hai field: `customer: { id, displayName }` (tên khách) và `participants: [{ id, displayName, role, expiresAt }]` (người hỗ trợ, không gồm owner). Khách không nhận hai field này.

### 6.3. Nút thao tác theo `capabilities`

Mọi thao tác đổi trạng thái gửi `expectedRevision` = `revision` của Conversation đang hiển thị. Response là Conversation mới (`200`).

| Nút | Hiện khi | API |
|---|---|---|
| Nhận xử lý | `canClaim` | `POST /conversations/{id}/claim {expectedRevision}` |
| Tham gia hỗ trợ | `canJoin` | `POST /conversations/{id}/join {expectedRevision}` |
| Rời hỗ trợ | `canLeave` | `POST /conversations/{id}/leave {expectedRevision}` |
| Chuyển cho đồng nghiệp | `canTransfer` | `POST /conversations/{id}/transfer {targetPrincipalId, expectedRevision, reason?}` |
| Trả về pool | `canRelease` | `POST /conversations/{id}/release {expectedRevision, reason?}` |
| Chờ khách phản hồi | `canResolve` | `PATCH /conversations/{id}/status {status:"pending_customer", expectedRevision}` |
| Đóng | `canResolve` | `PATCH …/status {status:"resolved", expectedRevision}` |
| Mở lại | `canReopen` | `PATCH …/status {status:"open", expectedRevision}` |
| Thêm/gỡ người hỗ trợ cho người khác | `canManageParticipants` | `POST /conversations/{id}/participants {principalId, role:"collaborator", expectedRevision}` / `DELETE …/participants/{principalId}?expectedRevision=` |
| Ô trả lời khách | `canReply` | `POST /conversations/{id}/messages {…, visibility:"public"}` |
| Ô ghi chú nội bộ | `canAddNote` | `POST /conversations/{id}/messages {…, visibility:"internal"}` |

- **Nhận đồng thời:** Gateway bảo đảm chỉ một người thắng. Người thua nhận 409 `ALREADY_CLAIMED`. UI tải lại và mời "Tham gia hỗ trợ", không báo lỗi đỏ.
- **Danh sách người nhận chuyển:** `GET {G}/queues/{queueId}/members` → `{ items: [{ id, displayName, roles }] }`, bỏ chính mình. Gồm nhân viên **đã được đồng bộ/đăng ký**, active, đúng tenant/queue và có vai trò agent hoặc supervisor; không phụ thuộc đã đăng nhập, đang online hoặc đã có Agent engine. Fixture không xuất hiện trong môi trường tích hợp thật. Mở lại dialog chuyển phải tải mới danh sách, không dùng cache60giây hoặc yêu cầu đồng nghiệp vào Chat. `targetPrincipalId` là `id` trong danh sách này, **không phải** ID tài khoản ở nền tảng của bạn.
- Sau khi chuyển, người chuyển mất quyền trả lời trừ khi "Tham gia hỗ trợ" lại.
- Nhân viên khác vẫn thấy tên thật của người gửi. Khách thấy tên chung, nên nhắc nhân viên không cần ký tên cá nhân trong tin.

### 6.4. App môi giới (issuer `advisorDirectory`)

- `sub` của assertion staff **là broker ID** (`remNo`), cùng mã mà app khách ký trong `advisors`. Gateway chuẩn hóa trim + chữ hoa; sai định dạng thì 401.
- Lần đăng nhập đầu, Gateway tự đăng ký môi giới với **đúng một vai trò `advisor`**, không queue (D32). Admin vẫn disable được qua `DELETE /admin/staff/{issuer}/{subject}`. Hồ sơ đã disable không tự bật lại.
- Môi giới thấy hội thoại qua `GET /conversations?kind=advisory`: chỉ khách mà phân công hiện hành trỏ tới. Đổi môi giới thì người cũ mất quyền ngay ở mọi đường HTTP/WS/event.
- Không gửi danh sách khách lên Gateway. Mọi quan hệ đến từ assertion của app khách.

## 7. Realtime (WebSocket)

1. `POST {G}/realtime-tickets` (Bearer) → `{ ticket, expiresAt }`. Ticket sống 30 giây và chỉ dùng một lần.
2. Mở `wss://<gateway-host>/v1/chat/realtime`. **Không** đưa token hay ticket vào URL.
3. Trong 5 giây gửi frame `{"type":"auth","ticket":"…","cursor":"<cursor cuối, nếu có>"}`.
4. Nhận frame:

| Frame | Xử lý |
|---|---|
| `{type:"ready", cursor}` | Đã xác thực. Lưu cursor |
| `{type:"events", events, cursor}` | Áp từng event rồi lưu cursor |
| `{type:"sync.required", cursor}` | Cursor hết hiệu lực: tải lại snapshot qua HTTP, rồi đi tiếp từ cursor mới |
| `{type:"session.expired"}` | Phiên bị thu hồi/hết hạn, socket đóng mã 4401: gia hạn phiên (§4) rồi kết nối lại |
| `{type:"error", code:"DEPENDENCY_FAILED", retryable:true}` | Lỗi tạm, server tự thử lại. Giữ dữ liệu đang có |

Mã đóng: `4401` = chưa xác thực hoặc hết phiên; `4403` = sai giao thức (lỗi code của bạn, **đừng** reconnect vô hạn).

Event chỉ chứa metadata, **không có nội dung tin**. Nhận event thì gọi lại HTTP:

| `type` | `payload` | Làm gì |
|---|---|---|
| `message.created` | `{messageId, visibility}` | Tải lại tin của hội thoại (trang mới nhất) và `unreadCount` |
| `conversation.created` | `{kind}` | Thêm vào danh sách sau khi `GET /conversations/{id}` |
| `conversation.updated` | `{status}`, `{syncState}`, hoặc `{participantAdded, role}` / `{participantRemoved}` | Tải lại hội thoại. `{syncState: "ready"}` báo hội thoại đã gửi tin được (sau khi tạo hoặc sau khi nhận/chuyển), `revision: null`. Event participant chỉ gửi cho nhân viên |
| `conversation.assigned` | `{ownerId}` | Tải lại hội thoại. Khách nhận ID chung |
| `conversation.read` | `{principalId, messageId}` | Cập nhật badge (đồng bộ giữa các tab) |

- Bỏ event trùng `eventId`.
- Bỏ cập nhật metadata có `revision` nhỏ hơn bản đang giữ. `message.created` và `conversation.read` có `revision: null`, luôn áp.
- **Không mất tin lúc khởi động:** mở socket và chờ `ready` trước, gom event đến trong lúc tải snapshot HTTP, tải xong mới áp phần đã gom. Nếu tải snapshot trước rồi mới mở socket không cursor thì sẽ hở một khoảng.
- **Reconnect:** backoff có jitter 1 → 2 → 4 → 8 → … tối đa 30 giây. Mỗi lần xin ticket mới và gửi cursor cuối. Dừng hẳn khi người dùng logout hoặc mất quyền.
- Mất socket lâu: có thể dùng `GET {G}/events?cursor=` để bù, nhưng không polling liên tục thay socket.

```typescript
export function connectRealtime(client: ChatClient, wsUrl: string, onFrame: (f: any) => void) {
  let cursor: string | null = null, attempt = 0, stopped = false, ws: WebSocket | null = null;
  const open = async () => {
    if (stopped) return;
    try {
      const { ticket } = await client.call<{ ticket: string }>('POST', '/realtime-tickets');
      ws = new WebSocket(wsUrl);
      ws.onopen = () => ws!.send(JSON.stringify({ type: 'auth', ticket, ...(cursor ? { cursor } : {}) }));
      ws.onmessage = (e) => {
        const f = JSON.parse(String(e.data));
        if (f.cursor) cursor = f.cursor;
        if (f.type === 'ready') attempt = 0;
        onFrame(f);
      };
      ws.onclose = (e) => { if (e.code !== 4403) retry(); };
    } catch { retry(); }
  };
  const retry = () => {
    if (stopped) return;
    const delay = Math.min(30_000, 1000 * 2 ** attempt++) * (0.5 + Math.random() / 2);
    setTimeout(open, delay);
  };
  void open();
  return () => { stopped = true; ws?.close(); };
}
```

## 8. Gửi tin an toàn: idempotency và receipt

```http
POST {G}/conversations/{id}/messages
{ "clientMessageId": "<uuid>", "text": "Nội dung", "visibility": "public" }
```

- Mỗi tin người dùng **chủ động gửi** có `clientMessageId` mới (UUID). Retry do mạng thì dùng **lại đúng** id và nội dung đó.
- `201` → Message đã nhận, ghép vào dòng "đang gửi".
- `202` → `MessageReceipt`:
  - `processing`: tra lại `GET {G}/message-requests/{clientMessageId}?conversationId={id}` có backoff;
  - `unknown`: **không tự gửi lại**. Hiện "Chưa xác nhận được tin đã gửi, kiểm tra lịch sử" và tải lại lịch sử để đối chiếu;
  - `accepted` + `messageId`: đã nhận.
- Cùng `clientMessageId` mà khác nội dung → 409 `IDEMPOTENCY_KEY_REUSED` (lỗi code client).
- Không dùng nội dung hay thời điểm làm khóa chống trùng, vì khách có thể cố ý gửi lại cùng một câu.
- Giới hạn: `text` 1–8.000 ký tự (đếm theo code point), không được chỉ có khoảng trắng; `clientMessageId` ≤64 ký tự.
- Khóa nút gửi trong lúc đang gửi một tin; double-click không được tạo hai `clientMessageId`.

## 9. Hiển thị tin: plain text và link

Server lưu và trả nguyên chuỗi, **không làm sạch HTML**. Client bắt buộc:

- Render bằng text node (React text child, `textContent`, `Text` trên mobile). **Cấm** `innerHTML`, `dangerouslySetInnerHTML` hay WebView với `text`.
- Tự nhận diện URL và chỉ bọc phần đó thành link. Chỉ chấp nhận `http:` và `https:`; `javascript:`, `data:`, `file:` hay scheme lạ giữ là chữ.
- Link mở `target="_blank" rel="noopener noreferrer"`. Hiển thị đúng URL thật, không rút gọn, không tự tải preview.
- Giữ xuống dòng (`white-space: pre-wrap`); cho URL dài xuống dòng được.

```tsx
const URL_RE = /\bhttps?:\/\/[^\s<>"]+/gi;
const TRAILING = /[.,;:!?)\]}'"»”]+$/;

export function MessageText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let raw = m[0];
    const tail = raw.match(TRAILING)?.[0] ?? '';
    raw = raw.slice(0, raw.length - tail.length);
    let href: string | null = null;
    try { const u = new URL(raw); if (u.protocol === 'http:' || u.protocol === 'https:') href = u.href; } catch { /* để nguyên chữ */ }
    parts.push(text.slice(last, m.index));
    parts.push(href ? <a key={m.index} href={href} target="_blank" rel="noopener noreferrer">{raw}</a> : raw);
    last = m.index! + raw.length;
  }
  parts.push(text.slice(last));
  return <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{parts}</span>;
}
```

## 10. Xử lý lỗi

Mọi lỗi có dạng `{ code, message, correlationId, retryable }`. `message` dành cho dev, **không hiển thị cho người dùng**. UI ánh xạ theo `code`. Khi báo lỗi, ghi kèm `correlationId` để tra log.

| HTTP | `code` | Nguyên nhân thường gặp | Phản ứng của client |
|---|---|---|---|
| 401 | `UNAUTHENTICATED` | Token hết hạn/thu hồi; assertion sai/hết hạn/đã dùng | Gia hạn một lần; vẫn lỗi thì dừng. Với assertion: xin assertion **mới**, không gửi lại assertion cũ |
| 403 | `FORBIDDEN` | Thiếu quyền; nhân viên chưa đăng ký; **Origin không có trong allowlist** | Tải lại để cập nhật `capabilities`. Nếu xảy ra ngay request đầu tiên từ web: kiểm Origin |
| 404 | `NOT_FOUND` | Không có hoặc ngoài quyền (Gateway không phân biệt hai trường hợp) | Gỡ khỏi danh sách |
| 404 | `FEATURE_DISABLED` | Gọi `/attachments/*` | Không dùng |
| 409 | `REVISION_CONFLICT` | `expectedRevision` cũ | Tải lại hội thoại, để người dùng quyết định lại. Không tự thử lại |
| 409 | `ALREADY_CLAIMED` | Đồng nghiệp vừa nhận | Tải lại, gợi ý "Tham gia hỗ trợ" |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Cùng `clientMessageId`/`clientRequestId` nhưng khác nội dung | Lỗi code client |
| 409 | `INVALID_TRANSITION` | Chuyển trạng thái không hợp lệ | Tải lại |
| 409 | `CONVERSATION_RESOLVED` | Gửi vào hội thoại đã đóng | Khách: "Yêu cầu mới". Nhân viên: "Mở lại" nếu có quyền |
| 409 | `ADVISOR_UNASSIGNED` | Tạo hội thoại tư vấn khi chưa có người phụ trách | Báo khách liên hệ kênh khác |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 64 KiB | Kiểm độ dài |
| 422 | `VALIDATION_FAILED` | Thiếu field, quá dài, query sai, cursor dùng chéo bộ lọc | Báo tại ô nhập; bỏ cursor cũ |
| 503 | `ENGINE_NOT_READY` | Hội thoại chưa khởi tạo xong (`syncState: pending`) | Giữ draft, chờ `ready` rồi gửi (§5.2) |
| 503 | `DEPENDENCY_FAILED` | Engine tạm không phản hồi (cold start) | `retryable: true`: thử lại có backoff |
| 500 | `INTERNAL` | Lỗi không lường trước | Báo kèm `correlationId` |

Gateway chưa có rate limit (429), nhưng client vẫn nên chống spam: khóa nút khi đang gửi, debounce các thao tác lặp.

## 11. Môi trường và chạy local

| Môi trường | HTTP | WebSocket | Ghi chú |
|---|---|---|---|
| PoC | `https://chat-server-poc.vercel.app/v1/chat` | `wss://chat-server-poc.vercel.app/v1/chat/realtime` | Dữ liệu tổng hợp. Gói Hobby: lần gọi đầu sau khi nghỉ có thể mất ~20 giây, gửi tin ~3 giây. Cần quản trị cấu hình issuer/origin trước khi dùng. **Không dùng cho khách thật** |
| Local | `http://127.0.0.1:8080/v1/chat` | `ws://127.0.0.1:8080/v1/chat/realtime` | Chạy từ repo Chat-server, xem dưới |
| Production | chưa có | chưa có | Đặt URL bằng cấu hình, **không hardcode URL PoC** |

Chạy Gateway local (Node ≥ 22.17, không cần Docker) trong repo Chat-server:

```bash
npm install
```

```bash
npm run issuer:keygen -- issuer my-platform shs customer dev
```

```bash
npm run issuer:keygen -- admin shs
```

Lệnh thứ hai in một dòng JSON public (`ASSERTION_ISSUERS`); private key nằm ở `.local/issuers/`. Lệnh thứ ba in `shs=<hash>` (`ADMIN_KEY_HASHES`); key gốc nằm ở `.local/issuers/admin-shs.key`. Sau đó chạy:

```bash
ASSERTION_ISSUERS='[<dòng JSON>]' ADMIN_KEY_HASHES='shs=<hash>' ALLOWED_ORIGINS='http://127.0.0.1:5173' npm run dev:local
```

- Engine chạy trong bộ nhớ, Postgres nhúng ở `.local/pg`.
- Muốn có nhiều issuer (app khách + trang nhân viên) thì đưa cả hai dòng JSON vào cùng một mảng.
- `ALLOWED_ORIGINS` phải khớp **chính xác** origin của web dev (`localhost` khác `127.0.0.1`).
- Muốn có khách hoặc nhân viên giả mà không cần nền tảng thật: `npm run dev:proof -- customerA` (hoặc `agentA`, `supervisorC`) in một proof fixture dùng ngay cho `POST /sessions`. Chỉ có ở local.

## 12. Checklist trước khi go-live

**Bảo mật**
- [ ] Private key ký assertion chỉ ở server/secret store; bundle frontend không chứa `PRIVATE KEY`, admin key hay biến `VITE_*`/`NEXT_PUBLIC_*` bí mật.
- [ ] Backend chỉ ký sau khi kiểm phiên nền tảng; `sub` bất biến; STK lấy từ nguồn đã xác thực, không lấy từ request của client.
- [ ] Access token, ticket, assertion chỉ trong RAM; không vào URL, storage hay log.
- [ ] Logout/đổi người dùng: thu hồi phiên, đóng socket, xóa cache và draft trước khi nạp người mới.
- [ ] Text render bằng text node; chỉ link http/https; đã thử `<script>`, `<img onerror>`, `javascript:`.

**Đúng contract**
- [ ] Thời gian trong assertion tính bằng giây; `exp − iat ≤ 60`.
- [ ] Bỏ qua field lạ trong response; enum lạ thì xử lý fail closed.
- [ ] Mọi thao tác đổi trạng thái gửi `expectedRevision`; 409 thì tải lại.
- [ ] Mỗi tin có `clientMessageId` riêng; `unknown` không tự gửi lại.
- [ ] Nút hiện theo `capabilities`, không theo vai trò tự suy.
- [ ] (Khách) không dùng `sender.id`/`owner.id` để phân biệt nhân viên.

**Vận hành**
- [ ] Đã gửi Gateway: issuer, public key, danh sách origin từng môi trường.
- [ ] (Trang nhân viên) đồng bộ sổ nhân viên khi tạo/sửa/khóa tài khoản; `DELETE` lỗi được báo rõ.
- [ ] WebSocket: chờ `ready` trước khi tải snapshot, reconnect có backoff, dừng khi gặp 4403.
- [ ] Trạng thái đang kết nối/mất kết nối hiển thị ổn định, không làm nhảy bố cục.
- [ ] Test chỉ dùng dữ liệu tổng hợp, không nhắn tới khách thật.

## 13. Câu hỏi thường gặp

**Request đầu tiên từ web bị 403 dù token đúng?** Origin của trang chưa có trong allowlist của Gateway. Kiểm đúng scheme, host và port (`http://localhost:5173` ≠ `http://127.0.0.1:5173`).

**`POST /sessions` trả 401 "đã được dùng"?** Mỗi assertion chỉ dùng một lần. Mỗi lần mở hoặc gia hạn phiên phải xin assertion mới từ backend.

**`POST /sessions` trả 401 "hết hạn" dù vừa ký?** Thường do để `iat`/`exp` bằng mili giây, hoặc đồng hồ server lệch quá 5 giây.

**Nhân viên mới không đăng nhập được (403)?** Chưa có trong sổ đăng ký, hoặc `subject` đăng ký khác `sub` trong assertion.

**Phân trang trả 422 "cursor không hợp lệ"?** Đang dùng cursor của một bộ lọc hoặc tab khác. Đổi bộ lọc thì bắt đầu lại từ trang đầu.

**Đồng nghiệp không có trong danh sách chuyển?** Kiểm tra đồng bộ PUT đã thành công, registration và principal active, đúng tenant/queue, vai trò agent/supervisor. Không cần người nhận mở Chat trước; worker tự provision Agent khi chuyển. Người chỉ xem (`observer`) không nhận chuyển giao được.

**Khách thấy tên nhân viên?** Ở kênh CSKH: không, mọi tin, người phụ trách và event phía khách dùng tên chung (mặc định "CSKH SHS") và một ID chung. Ở kênh môi giới: thấy tên riêng của môi giới, ID vẫn là ID chung.

**Gửi ảnh/file hoặc định dạng chữ?** Không hỗ trợ. Chỉ plain text; link do client tự nhận diện.

**Có endpoint refresh token?** Chưa. Gia hạn bằng assertion mới → `POST /sessions`.

**Lần gọi đầu trên PoC rất chậm?** Engine trên PoC ngủ sau vài phút không có traffic; lần đánh thức mất khoảng 20 giây. Hiện trạng thái "Đang kết nối…" và thử lại khi gặp 503 `retryable`.


Bổ sung23/10 (R02): chuyển syncState ready/failed và event conversation.updated được commit cùng transaction; khi ghi event lỗi, state rollback để worker thử lại. Không tăng revision nghiệp vụ; payload chỉ metadata, client vẫn GET lại hội thoại. REST schema không đổi.
