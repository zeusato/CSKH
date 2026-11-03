# Chuyển đăng nhập sang hệ thống nhân sự và xác thực công ty

**Hợp đồng cần giữ:** sau khi IdP xác thực nhân viên, REST/RPC, Storage và Edge phải nhận cùng một UUID ứng dụng. PostgreSQL dùng UUID đó để tìm hồ sơ đang hoạt động, quyết định quyền và ghi audit. HR quản lý vòng đời nhân sự. CSKH duyệt quyền nghiệp vụ. Nhân viên có tài khoản công ty nhưng chưa được cấp quyền CSKH phải bị từ chối.

## Luồng hiện tại và phần CNTT cần thay

| Điểm tích hợp | Hiện tại | Công việc khi dùng SSO |
|---|---|---|
| Đăng nhập, phiên và khôi phục | `src/pages/Login.tsx`, `Account.tsx`, `src/lib/supabase.ts`, `auth.tsx`, `src/App.tsx`. Đăng nhập password, reset qua email, lưu/refresh session, lấy profile theo `session.user.id`, đọc lại khi tab mở mỗi 30 giây. | Chuyển qua IdP, xử lý callback/logout/refresh và khóa các API đăng nhập, tạo hoặc reset mật khẩu cục bộ sau cutover. Giữ xóa cache khi đăng xuất, khóa hoặc đổi quyền. Không chỉ ẩn nút trên UI. |
| Quản trị | `src/pages/Users.tsx`, `src/lib/api.ts`, `functions/admin-users`, script bootstrap. Edge dùng `auth.getUser(token)`, kiểm admin active rồi dùng service role để list/create/reset tài khoản và sửa profile. | Bỏ hoặc vô hiệu hóa action tạo/reset local. Tách chỉnh thuộc tính HR khỏi phân quyền ứng dụng. Duy trì kiểm tra admin ở server và bảo vệ admin hoạt động cuối cùng. Chỉ tài khoản dịch vụ được phê duyệt mới ghi hồ sơ từ HR. |
| Dữ liệu và ảnh | RLS, trigger audit và RPC đọc `auth.uid()`; có hàm `SECURITY DEFINER` với guard riêng. Storage dùng JWT để xác minh quyền với metadata attachment. | Đảm bảo token sau xác minh có subject UUID đã ánh xạ và role DB `authenticated`. Kiểm cả `private.search_shared_tickets`, hàm nhập/xuất dữ liệu và policy `storage.objects`. Giữ `service_role` ở backend. |
| Edge dọn ảnh | `functions/storage-cleanup` xác minh người dùng và profile admin/user hoặc nhận `x-worker-token` của scheduler. | Thay xác minh user JWT nếu bỏ Supabase Auth. Tách secret worker khỏi danh tính người dùng. |
| Chat tùy chọn | `functions/chat-session`, `_shared/chat-gateway.ts`, `src/lib/chat/`. Handler xác minh user, cờ DB, quyền Chat và origin, rồi ký assertion theo `app_users.id`, `session_id` và `exp`. | Khi bật lại, cung cấp session ID/hạn đã xác minh, giữ subject ổn định, đồng bộ/gỡ đăng ký Gateway khi đổi quyền. Giữ cả cờ rollout, DB flag và keepalive tắt trong giai đoạn chuyển. |

Đường dẫn `functions/` trong bảng nằm dưới [supabase/functions](../../supabase/functions). [Luồng Auth frontend](../../src/lib/auth.tsx) · [Các migration](../../supabase/migrations).

## Hai cách tích hợp

1. **Giữ Supabase Auth ở server công ty làm cầu nối IdP.** CNTT xác nhận giao thức IdP và khả năng liên kết identity của bản Auth đã chọn. Cấu hình client/callback và chính sách MFA tại IdP, diễn tập link từng tài khoản có sẵn sao cho phiên mới trả đúng UUID cũ. Một số luồng đăng nhập lần đầu sinh user mới. Nếu không chứng minh được liên kết ổn định, khóa cấp quyền cho user mới cho đến khi đối soát. Sau cutover chỉ cho phép phương thức SSO đã phê duyệt. Đây là hướng ít thay đổi RLS và SDK nhất.
2. **Bỏ Supabase Auth.** Dựng bộ xác minh/trao đổi token phía server. Kiểm chữ ký bằng khóa tin cậy, issuer, audience, expiry và trạng thái phiên của IdP. Ánh xạ subject ngoài sang UUID ứng dụng rồi cấp token nội bộ ngắn hạn cho REST/Storage/Edge, hoặc đặt backend tương thích giữa frontend và các dịch vụ này. Không cho client tự chọn UUID hay role. Sửa các handler đang gọi `service.auth.getUser` và frontend đang đòi Supabase `Session`. Nếu bỏ luôn schema Auth, thêm migration mới chuyển FK và audit sang bảng principal do công ty quản lý, đổi hàm nhận diện người dùng và kiểm lại mọi RLS/RPC. Phải nghiệm thu bằng token thật của IdP trước khi chọn phương án này.

Hai cách trên là thiết kế để CNTT triển khai. Repo hiện tại vẫn dùng mật khẩu và Supabase Auth. Trước khi lập lịch, IAM cần xác nhận giao thức, issuer/client, claim định danh bất biến, vòng đời khóa và cách nhận sự kiện nhân viên nghỉ việc.

## Chuyển danh tính mà vẫn giữ lịch sử

1. Xuất bảng ánh xạ hạn chế người xem: UUID `auth.users.id = app_users.id` cũ, issuer + subject IdP, mã nhân viên bất biến, trạng thái HR, phòng ban, role CSKH, ba quyền phân hệ. Email/tên chỉ để đối chiếu thủ công. Với nhân viên mới, tạo UUID một lần. Ràng buộc duy nhất cho cặp issuer/subject và mã nhân viên theo phạm vi HR đã thống nhất. Không tự nối theo email đổi tên hoặc mã nhân viên tái sử dụng.
2. Đối chiếu 1:1 với HR và quản lý CSKH. Giữ UUID cũ cho người đang làm; duy trì principal lịch sử ở trạng thái khóa cho người nghỉ. Hàng thiếu, trùng hoặc không xác định thì chặn đăng nhập và ghi lý do chờ xử lý. Giữ ít nhất một admin active được phê duyệt và kiểm đăng nhập trước khi đóng tài khoản cũ.
3. Phân biệt hai danh mục: `staff` là người xử lý/nhân viên gọi, có thể không có login; `app_users` là chủ thể truy cập, chủ cuộc gọi và người nhận việc. Đồng bộ HR dùng mã bền vững cho cả nhân viên lẫn phòng ban, bảo toàn UUID và quan hệ cũ. Không xóa rồi tạo lại danh mục khi đổi tên hoặc chuyển phòng. Bài thư viện giữ tên danh mục snapshot tại thời điểm lưu.
4. Khi buộc đổi UUID, lập bảng old→new được duyệt, liệt kê **toàn bộ** FK vào `auth.users`, `app_users`, `staff`, `departments`, các quan hệ chủ sở hữu/audit/batch, `feature_flags.updated_by` và subject ở Gateway. Viết migration đánh số tiếp theo, chạy trên bản restore và so lịch sử trước/sau trong transaction. Xóa Auth user có thể cascade profile, làm audit thành NULL hoặc gặp FK restrict. Với người nghỉ, khóa thay vì xóa.
5. Provision/deprovision qua backend có audit, retry idempotent theo ID nguồn, có đối soát định kỳ khi bỏ lỡ sự kiện HR. Khi nhân viên nghỉ, đặt `app_users.active=false`, thu hồi tại IdP, vô hiệu refresh session và phiên Gateway nếu bật. Giữ dữ liệu, chuyển việc đang mở cho người khác theo quyết định CSKH. Kiểm lại bằng token còn hạn. URL ảnh đã ký có thể còn dùng đến hết TTL (5 phút).
6. Trước khi mở đích, thu hồi các phiên Auth được phục hồi từ backup theo cơ chế của bản Auth đã chọn. Thử cả access token lẫn refresh token của phiên cũ. Khóa ký mới chặn access token cũ; việc chặn refresh token cần nghiệm thu riêng. Dùng tài khoản đã liên kết để kiểm đăng nhập SSO mới và lưu UUID quan sát được ở REST, RPC và Edge.

## Ma trận nghiệm thu trên staging

| Tài khoản/tình huống | Kết quả phải quan sát qua API với token của người dùng |
|---|---|
| Nhân viên công ty chưa provision, subject không ánh xạ, issuer sai, token hết hạn | Không đọc ticket/ảnh, không gọi RPC quản trị. Không tự cấp profile hoặc tạo user trùng. |
| Viewer đang hoạt động | Đọc ticket, bài từ ticket và xuất dữ liệu được phép. Bị từ chối khi sửa ticket, upload ảnh hoặc gọi RPC ghi. |
| User và Admin | User thao tác ticket/danh mục được phép; admin quản trị quyền. Cả hai cần `chat_access` riêng để dùng Chat. |
| Nhật ký CSKH | `none/read/write`, admin có quyền ghi. Viewer tối đa read. Bài thư viện nguồn nhật ký chịu cùng phạm vi đọc; thử tìm kiếm và xuất file sau khi thu hồi quyền. |
| Nhật ký cuộc gọi | `none/own/read/manage`, admin có quyền manage. Viewer tối đa read. Hai user own không thấy cuộc gọi của nhau trừ quyền đọc từ việc được giao; assignee thử hoàn tất việc nhưng không được sửa nội dung cuộc gọi người khác. |
| Hạ quyền/khóa tài khoản khi tab còn mở | Thử lại cùng token với REST, RPC tìm kiếm và tạo URL ảnh mới. Quyền bị cắt ở backend ngay khi profile đổi; UI làm mới. Người có URL ký cũ được kiểm riêng theo TTL. |
| Bảo toàn danh tính | So UUID tác giả ticket, journal, bài thư viện, chủ cuộc gọi và assignee trước/sau. Đổi email, phòng ban rồi đăng nhập lại phải ra cùng principal. Gửi lặp sự kiện HR không tạo thêm user. |
| Đóng đường vòng | Thử password grant, reset, signup và action create/reset của admin cũ qua HTTP. Chỉ phương thức đã được IAM phê duyệt còn hoạt động. Admin mới đăng nhập được và không thể tự khóa admin đang dùng để bàn giao. |

Biên bản nghiệm thu ghi người duyệt, commit, issuer/môi trường, bộ persona tổng hợp, thời điểm khóa và bằng chứng cho từng phép thử, không lưu token hoặc bí mật. [Trở về quy trình chuyển hệ thống](README.md).

