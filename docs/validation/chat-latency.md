# Rà soát độ trễ chat CSKH — 24/10/2026

## Phát hiện và thay đổi

| Luồng | Nguyên nhân trong source trước sửa | Đã sửa |
|---|---|---|
| Mở chat | HTTP đợi socket `ready`; socket lỗi thì đợi fallback 8 giây sau khi mở phiên. Lịch sử lại đợi detail trả về rồi mới mount query. | HTTP và socket chạy song song sau khi mở phiên; detail và lịch sử cũng song song. `ready` kích hoạt đối soát để không hở khoảng nhận tin. |
| Nhận tin | Cộng 200 ms trước khi đọc nội dung; invalidate infinite query đọc tuần tự lại mọi trang đã tải, chỉ cập nhật sau cả chuỗi. Mỗi trang 50 tin khiến Gateway cần lấy ít nhất 51 bản ghi upstream khi lịch sử đủ dài. | Nội dung tải ngay, chỉ đọc 19 tin mới nhất. Gateway dùng thêm 1 bản ghi để tạo cursor: 20 thường nằm trong một trang Chatwoot (các activity/template bị lọc vẫn có thể cần thêm trang). Tin cũ vẫn lấy 50 khi được yêu cầu, giữ cache và vị trí cuộn. |
| Gửi tin | Bỏ qua Message trong response thành công, xóa dòng đang gửi rồi refetch lịch sử; người dùng phải chờ thêm một vòng HTTP. | Ghép Message đã xác nhận trực tiếp vào cache; hủy snapshot cũ đang chạy và chống trùng theo ID. Receipt/unknown/idempotency giữ nguyên. |
| Tin đến khi đang tải | Invalidate lúc query chưa có dữ liệu có thể dùng lại snapshot đang chạy; invalidate khi có cache có thể liên tục hủy/restart request chậm. | Cho request hoàn thành, gom các event thành một lượt tải tiếp. Không khôi phục query đã bị xóa khi đăng xuất. |
| Kết nối treo | Xin ticket hoặc socket không trả `ready` không có deadline phía client. | Deadline 15 giây, hủy request/kết nối cũ và reconnect theo backoff. Giữ cảnh báo offline sau 10 giây đến khi kết nối lại thành công. |
| Cấp phiên | Edge Function đọc cờ module rồi mới đọc profile sau bước xác thực. | Hai truy vấn độc lập chạy song song; vẫn kiểm cờ, quyền và trạng thái tài khoản trước khi ký. |

`src/lib/chat/messages.ts` tách việc cập nhật trang mới nhất khỏi tải trang cũ. Khi hai cửa sổ không còn giao nhau sau gián đoạn dài, bỏ cửa sổ cũ và dùng cursor mới để không nối nhầm hai đoạn lịch sử có khoảng trống. Khi tải nền lỗi tạm thời, tin đã có vẫn hiển thị; lỗi mất quyền/không tìm thấy vẫn chặn hiển thị.

## Bằng chứng kiểm thử

- `npx vitest run --pool=threads`: 155 pass, 11 integration test bỏ qua vì không cấu hình Gateway local. Pool threads tránh lỗi filesystem cache `ENOENT` của runner trên sandbox Windows; không sửa test để bỏ lỗi chức năng.
- `npm run test:chat-latency`: 6 kịch bản trình duyệt pass; toàn bộ Auth, Gateway HTTP và WebSocket giả lập. Chủ động giữ response detail/WS/history để chứng minh không còn các phụ thuộc chờ. Kết quả tại [chat-latency.json](chat-latency.json).
- `node scripts/test-chat-layout.mjs`: desktop/tablet/phone, ô soạn, draft, dark theme, đổi trang đều pass; [chat-layout.json](chat-layout.json).
- `npm run build`: TypeScript + Vite + kiểm static site pass. Cảnh báo chunk lớn ở các thư viện export có sẵn vẫn còn.

Không dùng timing của fixture để suy ra tốc độ production. Không gửi tin tới khách thật; chưa triển khai frontend hoặc Edge Function trong lượt này.

## Phần còn phụ thuộc Gateway

Đọc source Gateway hiện có tại máy: WebSocket phát metadata, client phải gọi HTTP mới lấy nội dung. Gateway còn nhịp poll sự kiện mặc định 1 giây, đồng thời có `nudge()` sau mutation để đẩy sớm trên instance đang giữ socket. Vì vậy không thể quy mọi tin nhận chậm thành đúng 1 giây, cũng không thể loại bỏ toàn bộ độ trễ bằng sửa giao diện.

Thời gian xác thực Supabase, mở phiên Gateway, Chatwoot đọc/ghi và mạng cần được đo lại trên bản triển khai thật. Hồ sơ Gateway có phép đo trước một lần tối ưu khác; không coi số liệu đó là thời gian hiện tại. Source Gateway không được chỉnh trong lượt này.
