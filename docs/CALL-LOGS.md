# Nhật ký cuộc gọi

Phân hệ riêng tại `/call-logs`, dùng chung tài khoản, nhân sự và phòng ban. Không tự tạo ticket, Nhật ký CSKH hoặc bài thư viện. Migration 023 đã áp dụng lên Supabase production lúc 10:29:01 ngày 23/10/2026 (giờ Việt Nam). Edge Function admin-users đã triển khai và đối chiếu mã nguồn sau khi tải lại. Frontend vẫn ở máy local, sẵn sàng để phát hành; em chưa commit/push/deploy frontend.

## Dữ liệu và nhập liệu

Mỗi lần gọi có mã CG, thời điểm bắt đầu/kết thúc, nhân viên gọi, khách hàng, điện thoại, TKCK, NAV tại thời điểm ghi nhận, mục đích, trạng thái kết nối và nội dung trao đổi. Thời điểm lưu bằng timestamptz và nhập/hiển thị theo giờ Việt Nam. Ngày kết thúc riêng hỗ trợ cuộc gọi qua nửa đêm. Thời lượng được tính từ hai thời điểm.

- Bắt buộc ngày giờ gọi, nhân viên, mục đích, trạng thái và ít nhất một trong điện thoại/TKCK.
- Điện thoại/TKCK lưu văn bản để giữ số 0 đầu. NAV không âm, tối đa 18 chữ số phần nguyên và 2 chữ số thập phân; để trống khác giá trị 0. API trả NAV dạng chuỗi để tránh mất độ chính xác JavaScript.
- Người sở hữu quyết định quyền truy cập. Nhân viên gọi lấy từ danh mục nhân sự và độc lập với người nhập. Nhân viên nhập hộ vẫn sở hữu bản ghi của mình; Quản lý có thể đổi người sở hữu.
- Lưu và nhập tiếp hỗ trợ nhập liên tục. Ghi nhận lần gọi tiếp điền sẵn khách hàng, liên kết lần trước, không sao chép NAV/ghi chú/lịch hẹn cũ.
- Mỗi cuộc gọi có tối đa một công việc tiếp theo, gồm hành động, hạn, người phụ trách và trạng thái. Có thể tóm tắt nhiều bước trong hành động; mỗi lần gọi mới có công việc riêng. Ngày hẹn không được trước cuộc gọi.
- Trạng thái kết nối: Đã kết nối, Không nghe máy, Máy bận, Không liên lạc được, Sai số.
- Công việc: Cần thực hiện, Đã hoàn thành, Đã hủy. Hoàn thành lưu thời điểm; mở lại xóa thời điểm hoàn thành. Quá hạn là việc pending có hạn trước thời điểm hiện tại; Hôm nay có thể bao gồm cả việc đã quá giờ trong ngày.

## Quyền

Quyền Nhật ký cuộc gọi được cấu hình độc lập trong Tài khoản. Mặc định tài khoản cũ không được cấp thêm quyền. Admin đang hoạt động có toàn quyền.

| Quyền | Phạm vi |
|---|---|
| Không truy cập | Không đọc được bảng, tra cứu hoặc thống kê cuộc gọi |
| Nhân viên | Tạo/nhập Excel; xem và sửa cuộc gọi sở hữu; xem cuộc gọi có công việc được giao; cập nhật trạng thái công việc của mình hoặc của cuộc gọi sở hữu |
| Chỉ xem toàn bộ | Xem, tìm kiếm, thống kê và xuất dữ liệu toàn phân hệ |
| Quản lý toàn bộ | Toàn bộ thao tác, đổi chủ sở hữu, xóa cuộc gọi, quản lý mục đích |

Viewer chỉ nhận Không truy cập hoặc Chỉ xem. Nhân viên được giao công việc không được sửa nội dung cuộc gọi của người khác. Người có quyền sở hữu có thể giao công việc cho tài khoản có quyền ghi đang hoạt động; người đó nhận quyền đọc cuộc gọi liên quan. Xóa cuộc gọi chỉ dành cho Quản lý/Admin, xóa cả công việc đi kèm; các lần gọi sau vẫn tồn tại, liên kết tới bản bị xóa được bỏ.

Database kiểm tra quyền hiện tại, không phụ thuộc quyền cũ trong JWT. Giao diện làm mới hồ sơ khoảng 30 giây khi tab mở; thay đổi quyền xóa cache và đóng nội dung đang xem. Cập nhật cuộc gọi, cập nhật công việc và xóa đều kiểm tra phiên bản để không ghi đè thay đổi đồng thời.

## Tra cứu, thống kê và báo cáo

Ba tab: Danh sách cuộc gọi, Cần theo dõi, Thống kê. Bộ lọc được dùng chung: từ khóa, thời gian gọi, nhân viên, người sở hữu, mục đích, trạng thái, NAV, người phụ trách và tình trạng công việc. Khi tab Cần theo dõi chưa có lựa chọn tình trạng, mặc định chỉ hiển thị việc cần làm.

Lịch sử khách hàng ưu tiên số TKCK chính xác; khi không có TKCK dùng điện thoại đã bỏ dấu phân cách. Chưa chuẩn hóa `+84` thành `0`, chưa gộp khách chỉ có điện thoại với bản ghi có TKCK. Giao diện nêu rõ cách đếm để tránh hiểu là CRM đã hợp nhất khách hàng.

Thống kê được tính server theo cùng bộ lọc và RLS, gồm số lần gọi, số định danh khách, kết nối/tỷ lệ, thời lượng, công việc cần làm/hôm nay/quá hạn/hoàn thành. Thời lượng chỉ tính cuộc đã kết nối có đủ giờ; mẫu số thời lượng trung bình cũng chỉ gồm những cuộc này. Nhóm theo ngày/tuần (thứ Hai)/tháng/nhân viên/mục đích/trạng thái. NAV chỉ dùng để lọc; không cộng NAV lặp qua các lần gọi.

Xuất Excel lấy toàn bộ kết quả được phép xem, không chỉ trang đã tải; có sheet Bộ lọc, thời gian Việt Nam, thông tin người nhập và thời lượng. Xuất dùng mốc bắt đầu để loại bản tạo thêm trong lúc xuất, không phải snapshot transaction của mọi thay đổi đồng thời. File báo cáo không phải mẫu import.

## Nhập Excel

Tải mẫu có các cột trong ảnh gốc và bốn cột bổ sung: Ngày kết thúc, Ngày giờ hẹn, Người phụ trách, Trạng thái công việc. Đọc sheet Du lieu hoặc sheet đầu tiên của file cũ. Tự ánh xạ theo tên cột; có giao diện đổi ánh xạ. Tên danh mục phải duy nhất hoặc nhập ID trong sheet Danh muc. Người sở hữu là tài khoản nhập file.

1. Chọn file XLSX tối đa 10 MB, 1.000 dòng, tối đa 50 MB sau giải nén.
2. Kiểm tra ánh xạ, bấm Kiểm tra và xem trước. Lỗi và cảnh báo ghi rõ dòng nguồn. Chưa ghi bản ghi nghiệp vụ.
3. Điện thoại/TKCK cần Text; công thức, macro, ảnh nhúng và ô gộp bị từ chối. Dòng ẩn vẫn được đọc. Ngày text theo dd/mm/yyyy; giờ HH:mm[:ss]; Excel date/time hợp lệ cũng được đọc.
4. Với hành động tiếp theo phải có ngày giờ hẹn; nếu thiếu người phụ trách dùng tài khoản nhập. Nếu danh mục trùng tên thì dùng ID để phân biệt.
5. Xem các dòng và đánh dấu đã kiểm tra/chấp nhận cảnh báo trước khi nhập.
6. Server kiểm tra lại dữ liệu, quyền và cảnh báo trùng. Nếu khác bước xem trước phải xác nhận lại. Ghi cả đợt trong một transaction.

Khi mất mạng, dùng Kiểm tra kết quả hoặc Thử lại cùng yêu cầu. Mã yêu cầu được giữ trong localStorage theo tài khoản, không lưu nội dung khách hàng. Cùng mã yêu cầu không tạo thêm bản ghi; chỉ bỏ theo dõi sau khi đối chiếu dữ liệu. Cảnh báo trùng chỉ đối chiếu các bản ghi mà người nhập có quyền xem, không tiết lộ dữ liệu người khác.

## Trạng thái triển khai và bước còn lại

Các bước 1–3 đã hoàn tất trên production ngày 23/10/2026. Việc còn lại là bước 4.

1. Sao lưu hồ sơ và quyền tài khoản trước thay đổi schema; đã lưu trong .local/backups (Git ignored).
2. Chạy `supabase/migrations/023_call_logs.sql` bằng công cụ migration hiện có hoặc SQL Editor trong transaction. Migration yêu cầu schema tới 022 đã có.
3. Triển khai lại Edge Function `admin-users` để lưu/cập nhật `call_log_access`.
4. Phát hành frontend và cấp quyền cho tài khoản cần dùng; kiểm tra quyền nhân viên, quản lý, viewer trên môi trường triển khai.

Không cấp tự động cho người dùng cũ, không nhập file thật hay đổi dữ liệu nghiệp vụ khi kiểm thử local. Thay đổi schema phải đi trước Edge Function và frontend mới.

## Kiểm thử

- `npm test`: unit tests hiện có và ngày giờ, workbook thật, chữ số đầu, NAV, dữ liệu lỗi, quyền trong admin handler.
- `npm run test:call-db`: PGlite chạy migration thật, RLS/RPC, phân quyền theo dòng, xung đột, thống kê, import/retry. Không đọc .env.
- `npm run test:call-ui`: trình duyệt headless với toàn bộ request Supabase được giả lập. Cần local dev server và Playwright; hỗ trợ biến PLAYWRIGHT_MODULE, CARE_BROWSER_PATH, CARE_UI_URL như các bộ UI test hiện có.
- `npm run build`: TypeScript, build và kiểm tra static site.

Bằng chứng: `docs/validation/call-database.json`, `docs/validation/call-ui.json`, `docs/validation/call-production.json`, `docs/validation/call-deployment.json`. Ảnh và file Excel test nằm trong `.local/call-qa` (Git ignored).
