# Nhật ký CSKH — hướng dẫn sử dụng và triển khai

Nhật ký CSKH lưu công việc riêng của bộ phận CSKH. Bản ghi không đi vào danh sách ticket hoặc thư viện lời giải. Danh mục Hệ thống liên quan, phân mục, phòng ban và nhân sự được dùng chung.

## 1. Cấp quyền

Trong **Tài khoản → Tạo tài khoản/Chỉnh sửa → Quyền Nhật ký CSKH**, Admin chọn:

| Quyền | Thao tác |
|---|---|
| Không truy cập | Không thấy menu và không đọc được nhật ký. Đây là mặc định cho tài khoản không phải Admin. |
| Chỉ xem | Xem, tìm kiếm, lọc, xuất Excel và PDF. |
| Chỉnh sửa | Có quyền xem, tạo, sửa, xóa và import Excel. |

Admin đang hoạt động luôn có toàn quyền. Viewer chỉ được Không truy cập hoặc Chỉ xem; không cấp Chỉnh sửa. Khi đổi User có quyền ghi thành Viewer, form chuyển quyền nhật ký về Chỉ xem để Admin rà lại trước khi lưu. Có thể chọn Không truy cập nếu cần.

Quyền được kiểm tra ở database/RPC, không chỉ trên giao diện. Khi thu hồi quyền, các yêu cầu mới bị chặn ngay theo dữ liệu tài khoản hiện tại; giao diện cập nhật ở lần kiểm tra hồ sơ nền, khoảng 30 giây khi tab đang mở. File đã xuất ra máy không thể thu hồi từ xa.

## 2. Tạo và theo dõi vấn đề

Mở **Nhật ký CSKH → Tạo nhật ký**. Trường bắt buộc:

- Phân loại yêu cầu: Hỗ trợ / Khiếu nại / Ý kiến đóng góp.
- Mô tả vấn đề.
- Bộ phận tiếp nhận.
- Trạng thái xử lý.
- Thời gian tiếp nhận.
- Thời gian hoàn thành, nếu trạng thái là Đã xử lý.

**Kênh phát sinh lỗi** dùng danh sách Hệ thống liên quan. Bộ phận/nhân sự phối hợp là thông tin tùy chọn từ danh mục chung; không tạo ticket hoặc thông báo tới bộ phận khác.

Nhân sự tiếp nhận độc lập với người tạo bản ghi, để hỗ trợ nhập hộ và nhập dữ liệu lịch sử. Có thể nhập thời gian trong quá khứ. Thời gian hoàn thành không được trước tiếp nhận; khi mở lại bản ghi, hệ thống xóa thời gian hoàn thành cũ. Ngày giờ hiển thị theo Việt Nam.

Nếu có người khác sửa trước khi lưu/xóa, hệ thống báo xung đột phiên bản. Nội dung form đang nhập vẫn được giữ để đối chiếu. Không tự ghi đè bản mới.

Bấm vào bất kỳ ô thông tin nào trên dòng nhật ký để mở chi tiết; có thể dùng Tab rồi Enter hoặc Space. Tài khoản có quyền chỉnh sửa thấy nút **Sửa** và **Xóa** ở cuối dòng. Sửa mở form trực tiếp, Xóa yêu cầu xác nhận và làm mới danh sách sau khi hoàn tất. Viewer chỉ mở xem chi tiết.

## 3. Tìm kiếm và xuất báo cáo

- Tìm theo mã `NK-…`, mô tả, nội dung phản hồi hoặc ghi chú, hỗ trợ không dấu.
- Bộ lọc gồm trạng thái, phân loại, kênh, phân mục, bên tiếp nhận/phối hợp, khoảng ngày và đợt nhập. Dropdown đợt nhập hiện hiển thị 100 đợt gần nhất; liên kết theo ID đợt vẫn dùng được cho đợt cũ hơn.
- Nút Xuất Excel xuất toàn bộ kết quả theo bộ lọc hiện tại, không chỉ trang đang mở. Sheet Bộ lọc ghi điều kiện xuất; nội dung dài nằm thêm ở sheet Nội dung dài.
- Mở chi tiết một bản ghi để Xuất PDF A4. Sau khi tạo có liên kết Tải PDF nếu trình duyệt chặn tải tự động.
- File báo cáo Excel không phải mẫu import. Để nhập dữ liệu mới, tải mẫu ở màn Nhập Excel.

## 4. Nhập Excel

1. Mở **Nhập Excel → Tải mẫu Excel**. Mẫu có sheet Du lieu, Huong dan, Danh muc và metadata phiên bản. Mẫu không có dòng ví dụ để tránh nhập nhầm.
2. Điền dữ liệu từ dòng 2 của sheet **Du lieu**. Giữ nguyên tên 13 cột; có thể đổi thứ tự cột.
3. Nhập ngày theo `dd/mm/yyyy` hoặc ô ngày Excel, ví dụ `17/09/2026`. Hai cột ngày của mẫu dùng định dạng này và được lưu lúc 00:00 theo giờ Việt Nam. File cũ có thêm giờ vẫn được chấp nhận và giữ nguyên giờ.
4. Chọn file `.xlsx`. Hệ thống đọc và hiển thị bảng xem trước, lỗi/cảnh báo theo đúng dòng Excel. Chưa ghi dữ liệu nghiệp vụ vào database.
5. Xem khung **Chi tiết lỗi và cảnh báo** phía trên bảng: mỗi lỗi ghi rõ dòng Excel, cột, giá trị trong file và hướng sửa. Lỗi nhân sự ghi rõ bộ phận theo danh mục để đối chiếu. Có thể lọc các dòng lỗi/cảnh báo, chuyển trang, mở nội dung đầy đủ và tải báo cáo lỗi. Ngày trong bảng xem trước hiển thị `dd/mm/yyyy`; mở ô để xem giá trị gốc nếu file có giờ.
6. Nếu có lỗi, sửa file rồi tải lại. Hệ thống không tự tạo danh mục mới hoặc tự bỏ dòng lỗi.
7. Khi toàn bộ file hợp lệ, đánh dấu đã kiểm tra và chấp nhận cảnh báo, rồi bấm **Nhập N bản ghi**.
8. Khi ghi thành công, cửa sổ nhập tự đóng và danh sách tự làm mới, bỏ các bộ lọc cũ để hiển thị đợt vừa nhập. Bộ đếm trạng thái và danh sách đợt nhập cũng được cập nhật. Bấm **Bỏ lọc đợt** để xem toàn bộ nhật ký.

Quy tắc:

- Tối đa 1.000 dòng dữ liệu/file, file nén 10 MB, nội dung giải nén 50 MB, payload sau chuẩn hóa 5 MB và mỗi ô văn bản 32.767 ký tự. Các giới hạn áp dụng đồng thời.
- Dòng trống được bỏ qua. Dòng ẩn hoặc bị lọc trong Excel vẫn được đọc. Chỉ sheet Du lieu được nhập.
- Không hỗ trợ công thức, ô gộp, macro, ảnh hoặc file nhúng; với công thức hãy sao chép rồi dán dưới dạng giá trị.
- Nhân sự phải khớp tên và bộ phận trong danh mục hiện hành. Tên không tồn tại hoặc trùng trong cùng bộ phận phải xử lý trước khi nhập.
- Giữ nguyên thời gian nghiệp vụ trong file. Người import là người tạo trên hệ thống; nhân sự tiếp nhận vẫn theo file.
- Chỉ tạo mới. Nội dung tương tự là cảnh báo để người dùng xem lại, không tự xóa hoặc bỏ qua.
- Ghi toàn bộ đợt trong một transaction. Nếu lỗi lúc ghi, không để lại dữ liệu nhập một phần.
- Server kiểm tra lại danh mục, quyền và cảnh báo ngay lúc ghi. Nếu kết quả thay đổi sau preview, phải xem lại và xác nhận lại.

### Khi mất kết nối lúc nhập

Giữ nguyên màn hình và dùng **Kiểm tra kết quả** hoặc **Thử lại cùng yêu cầu**. Mã yêu cầu được giữ trong phiên trình duyệt để tra cứu khi tải lại trang. Không chọn lại file thành một yêu cầu mới khi chưa biết kết quả cũ, vì yêu cầu mới có thể tạo dữ liệu trùng.

Nếu không còn preview sau reload, dùng Kiểm tra kết quả. Chỉ bỏ theo dõi yêu cầu sau khi đã xác minh; trạng thái chưa thấy đợt hoàn tất không chứng minh chắc yêu cầu cũ đã thất bại nếu đang xử lý.

## 5. Triển khai backend và frontend

Đặc tả: [UPGRADE-CARE-LOGS.md](UPGRADE-CARE-LOGS.md). Kết quả kiểm thử và trạng thái triển khai thực tế: [validation/care-logs.md](validation/care-logs.md).

Thứ tự triển khai:

```powershell
npm ci
npm test
npm run test:care-db
npm run build
npm run db:migrate
node --env-file=.env scripts/deploy-functions.mjs --function=admin-users
```

Sau đó phát hành frontend bằng quy trình Vercel hiện có. Migration và Edge Function phải đi trước frontend mới. Không chỉ deploy frontend rồi coi tính năng đã sẵn sàng.

Migration `019_care_logs.sql` thêm cột quyền tài khoản, bảng nhật ký, bảng đợt nhập riêng tư, guard/RLS, trigger, chỉ mục và RPC. Không thay đổi dữ liệu ticket. Không tự cấp quyền nhật ký cho User/Viewer hiện có. Không chạy lại bootstrap Admin.

Áp dụng SQL cần một trong hai: `DATABASE_URL` hợp lệ hoặc `SUPABASE_ACCESS_TOKEN`. Deploy Edge Function cần `SUPABASE_ACCESS_TOKEN`; service-role key không thay thế Management token.

Nếu máy không kết nối IPv6, sao chép **Session pooler** URL từ Supabase Connect vào cấu hình quản trị. Nếu cần CA của Supabase, tải từ Dashboard và đặt đường dẫn tại `DATABASE_SSL_CA_FILE`; script migration giữ kiểm tra chứng chỉ và hostname. Tham khảo [hướng dẫn SSL Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement). Không tắt xác minh TLS để xử lý lỗi chứng chỉ.

Không đưa database password, service-role key hoặc Management token vào biến `VITE_`, Git hoặc báo cáo kiểm thử.

## 6. Kiểm thử cục bộ

`npm run test:care-db` chạy PostgreSQL cô lập bằng PGlite, không sử dụng `.env`, không tạo tài khoản hoặc dữ liệu thử trên Supabase. Kiểm thử bao gồm RLS, quyền với JWT cũ, import nguyên khối, lỗi giữa transaction, retry, cảnh báo mới, giới hạn 1.000 dòng và mốc thời gian lịch sử.

`npm run test:care-ui` yêu cầu Playwright khả dụng và bản ứng dụng đang chạy. Có thể cấu hình `PLAYWRIGHT_MODULE` tới module Playwright đã cài, `CARE_BROWSER_PATH` tới Chromium/Chrome và `CARE_UI_URL` tới URL local. Kiểm thử tạo browser context cô lập và giả lập toàn bộ request Supabase; không dùng phiên đăng nhập thực.

Unit tests đọc/ghi workbook thật, kiểm tra PDF tiếng Việt và handler Admin với Auth giả lập. Kết quả local không thay thế smoke test trên Supabase sau khi triển khai.
