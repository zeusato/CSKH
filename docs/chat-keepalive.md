# Giữ ấm Chat Server trước đăng nhập — 26/10/2026

**26/10/2026 — REQUIRED: tạm dừng toàn bộ Chat KH theo yêu cầu Đại ca.** Cờ keepalive trên Vercel production/preview/development đã false; adapter mặc định off, chỉ explicit true mới chạy. Tab cũ cần tải lại để ngừng timer; Gateway chặn mọi warmup từ client cũ.

## Rollout26/10/2026

Feature commit bcda5ae đã push main; Vercel production dpl_GZynwKtLtGNgR7qx3jxeWBbr8Zwq READY tại https://cskhshs.vercel.app. CI40279559058success. Trang public và entry bundle đã kiểm chứa wake client; CORS Gateway cho đúng origin đã pass.

Server feature32535a1 đã deploy READY và public wake200. Đây là kiểm HTTP/bundle, chưa phải benchmark tải hoặc nghiệm thu gửi/nhận; cold start và Redis quota vẫn có giới hạn đã ghi. Các mốc local/chưa deploy bên dưới là lịch sử trước rollout.


Đại ca yêu cầu mở ứng dụng là đánh thức chat, không phụ thuộc đăng nhập hoặc quyền chat. Đã code local, chưa deploy/đóng gói/phát hành.

- GET https://chat-server-poc.vercel.app/v1/chat/wake ngay sau khi ứng dụng khởi động, sau đó khoảng mỗi20giây tính từ đầu lượt trước. Không chồng request; timeout60giây. Lỗi giãn40/80/160/300giây, tự hồi phục; không toast/log lỗi hoặc chặn render.
- Không cookie, Authorization, proof, STK, nội dung tin hay khóa warmup nội bộ. Không mở session/WS, không gọi signer và không thay quyền nghiệp vụ. Cờ bật/tắt chat theo phiên giữ nguyên; warmup là tác vụ public độc lập.
- Gateway gom public wake và internal warmup bằng một bộ đếm PostgreSQL20giây. 200 {ok:true,cached:boolean}; 202 {ok:false,warming:true,retryAfterMs} chỉ báo đang đánh thức; 503/404/403 được giãn nhịp. Client không dùng kết quả này làm trạng thái sẵn sàng gửi tin.
- Bản runtime được chép có chọn lọc từ Chat-server packages/chat-client/keepalive.mjs (thay đổi local26/10, nền4ea0a35); không dependency mới, không import đường dẫn máy. Khi đổi protocol, đồng bộ bản runtime và contract ở cả ba app.
- Web: chạy một vòng ở entry, dọn khi HMR/pagehide; pageshow/online/hiện lại tab kiểm tiếp khi đã tới hạn. Tab ẩn vẫn được ping nhưng browser/OS có thể trì hoãn hoặc dừng timer. Nhiều tab có vòng riêng; Gateway gộp downstream, không cam kết giảm lượt request ingress.
- Electron: main process chạy một vòng cho toàn app, giữ khi thu nhỏ xuống tray; suspend hủy lượt đang chạy, resume xét lại khi tới hạn; before-quit dọn timer/listener. Không đổi preload/web SHA hoặc luồng giao dịch.

Triển khai: server trước (migration0008 tự chạy theo boot, CHAT_PUBLIC_WARMUP_ENABLED mặc định bật với Chatwoot), kiểm ALLOWED_ORIGINS chứa đúng domain CSKH/SHOne. CORS chỉ giới hạn browser, endpoint vẫn là public cho app native; không coi Origin là xác thực. Sau đó build/deploy từng frontend, đóng gói SHA PC theo quy trình hiện có. Chưa chạy request vào production trong kiểm thử.

Cấu hình public: CSKH VITE_CHAT_GATEWAY_URL (gốc hoặc /v1/chat), SHOne VITE_CHAT_API_BASE_URL; mặc định Gateway PoC nếu biến chưa đặt, chuỗi rỗng/URL sai sẽ tắt mạng. Hai web tắt bằng VITE_CHAT_KEEPALIVE_ENABLED=false. SHA PC dùng SHA_BROKER_CHAT_GATEWAY_URL và tắt riêng bằng SHA_CHAT_KEEPALIVE_DISABLED=true. Không đặt secret trong các biến này.

Kiểm chứng local26/10: Vitest162pass/11live Gateway tests skip (opt-in chưa cấu hình); TypeScript và Vite production build pass. Runtime copy khớp SHA-256 nguồn Chat-server: 75e173657d2117e36ce4c2cd7b00ee185029178241eed117e4baf09f6e716aa3. Chưa deploy/phát hành; cold start, Redis quota và tải production vẫn cần nghiệm thu riêng. Ping không bảo đảm backend luôn sống khi không còn ứng dụng mở.
