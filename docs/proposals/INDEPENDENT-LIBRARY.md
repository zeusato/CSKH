# Kế hoạch tách thư viện khỏi ticket và nhật ký CSKH

Ngày lập: 23/10/2026. Đây là bản kế hoạch ban đầu; triển khai thực tế và quy tắc sử dụng được cập nhật tại [LIBRARY.md](../LIBRARY.md). Migration 021 và 022 đã chạy qua SQL Editor trên Supabase ngày 23/10/2026. Phần ảnh triển khai bằng bản ghi sở hữu độc lập trên file bất biến dùng chung, thay cho phương án sao chép file/bucket/job dự kiến bên dưới.

## Mục tiêu và quy tắc nghiệp vụ

- Ticket chuyển sang **Đã xử lý** vẫn ở danh sách ticket, không tự xuất hiện trong thư viện. Chi tiết ticket hiện nút **Lưu vào thư viện** sau khi cập nhật trạng thái thành công.
- Bấm nút sẽ tạo một bài thư viện có ID riêng, chứa bản sao nội dung tại thời điểm lưu. Sửa, mở lại hoặc xóa ticket không sửa/xóa bài thư viện; chiều ngược lại cũng độc lập.
- Nhật ký CSKH có thể chủ động lưu nội dung vào thư viện, không cần tạo ticket trung gian.
- Bài thư viện có màn hình xem, sửa, xóa riêng. Thư viện chỉ truy vấn dữ liệu đã lưu vào thư viện.

Các lựa chọn đề xuất để triển khai nhất quán:

- Một nguồn tạo tối đa một bài thư viện đang tồn tại. Bấm nhiều lần hoặc hai người lưu đồng thời trả về cùng bài; sau khi lưu, nút đổi thành **Xem trong thư viện**. Không tự ghi đè bài khi nội dung nguồn thay đổi. Nếu xóa bài thư viện thì có thể lưu lại từ nguồn còn tồn tại.
- Ticket chỉ được lưu khi trạng thái hiện tại là `resolved`; khi đã có bài, vẫn cho mở bài nếu ticket được mở lại.
- Nhật ký không bắt buộc đã xử lý vì có thể chứa hướng dẫn hữu ích ngay trong quá trình chăm sóc. Khi lưu, yêu cầu có tiêu đề và nội dung lời giải; thông tin phản hồi có thể được bổ sung trong hộp thoại mà không sửa nhật ký gốc.
- Giữ lại nội dung đang thấy trong thư viện cũ bằng đợt sao chép một lần các ticket đã xử lý tại thời điểm chuyển đổi. Sau mốc chuyển đổi chỉ lưu theo thao tác chủ động.
- Nội dung lấy từ nhật ký giữ phạm vi đọc của phân hệ nhật ký để không tự mở rộng quyền xem khi đưa vào thư viện chung. Đây là lựa chọn phân quyền đề xuất, độc lập với vòng đời của nguồn.

## Hiện trạng đã kiểm tra trong mã nguồn

| Thành phần | Hiện trạng | Thay đổi cần làm |
| --- | --- | --- |
| `src/App.tsx` | `/library` dùng `<Tickets library/>` | Chuyển sang trang `Library` riêng |
| `src/pages/Tickets.tsx` | Ép `status='resolved'`, gọi `searchTickets`, đếm ticket đã xử lý, mở `TicketDetail` | Tách toàn bộ nhánh thư viện, bộ đếm, bộ lọc và lời giới thiệu |
| `src/lib/api.ts` | Chỉ đọc/ghi bảng `tickets`; xóa ticket gọi dọn ảnh | Giữ API ticket; thêm API thư viện độc lập |
| `src/components/TicketDetail.tsx` | Xem/sửa/xóa ticket, xuất PDF và ảnh | Thêm thao tác lưu/xem bài thư viện |
| `src/components/CareLogDetail.tsx` | Nhật ký có API, quyền đọc/ghi riêng | Thêm thao tác lưu/xem bài thư viện theo quyền |
| `src/lib/export-excel.ts` | Luôn xuất dữ liệu ticket, kể cả khi gọi từ trang thư viện | Tạo luồng xuất bài thư viện riêng |
| `supabase/migrations/001_workspace.sql` | Ảnh tham chiếu ticket bằng `ON DELETE CASCADE`; xóa metadata đưa ảnh vào hàng đợi dọn | Ảnh thư viện phải có metadata và object riêng |
| `supabase/functions/storage-cleanup/index.ts` | Hiện chỉ xóa object trong `ticket-images` | Mở rộng dọn ảnh thư viện và xử lý retry có kiểm soát |

Không có bản ghi thư viện riêng để chỉ cần bỏ liên kết xóa: nguyên nhân hiện tại là hai màn hình cùng đọc một bảng.

## Thiết kế dữ liệu đề xuất

Tạo migration mới sau migration hiện hành; không sửa lại lịch sử migration đã chạy.

**`library_entries`** lưu `id`, mã bài riêng, `title`, `description`, `resolution`, hệ thống, phân mục, người tạo/cập nhật, thời điểm lưu/cập nhật và `version` để chống ghi đè đồng thời. Có các trường tìm kiếm được chuẩn hóa và chỉ mục phục vụ tìm tiếng Việt, phân trang theo con trỏ.

Nguồn tham khảo gồm `source_type` (`ticket` hoặc `care_log`), `source_id`, `source_code`, `source_version`, ngày tiếp nhận/hoàn thành tại thời điểm lưu. `source_id` là định danh xuất xứ bất biến, không dùng khóa ngoại xóa dây chuyền; unique `(source_type, source_id)` ngăn lưu trùng. Không cần đọc nguồn để hiển thị bài. Khi mở liên kết nguồn, kiểm tra lại quyền và sự tồn tại; nếu nguồn đã xóa, báo rõ và vẫn đọc được bài.

Lưu các tên danh mục tại thời điểm sao chép để bài vẫn có bối cảnh nếu danh mục đổi tên; ID danh mục dùng chung phục vụ lọc có thể dùng `ON DELETE SET NULL`. Ngày lưu bài khác ngày hoàn thành nguồn; bộ lọc và nhãn hiển thị phải phân biệt hai thời điểm.

**`library_attachments`** tham chiếu bài thư viện, có object độc lập trong bucket private `library-images`. Không dùng lại đường dẫn object hoặc signed URL của ticket. Xóa bài chỉ xóa ảnh thuộc bài đó.

Ánh xạ nội dung:

| Dữ liệu bài | Ticket | Nhật ký CSKH |
| --- | --- | --- |
| Tiêu đề | `title` | Gợi ý từ mô tả, người lưu kiểm tra/chỉnh sửa |
| Vấn đề | `description` | `description` |
| Lời giải | `resolution` | `response_content` |
| Hệ thống / phân mục | `system_id` / `category_id` | `system_id` / `category_id` |
| Bối cảnh xử lý | Ngày tiếp nhận/hoàn thành, bộ phận/nhân sự xử lý | Ngày tiếp nhận/hoàn thành, bộ phận/nhân sự tiếp nhận và phối hợp |
| Ảnh | Sao chép các ảnh `ready` được chọn | Hiện chưa có ảnh đính kèm trong phân hệ nhật ký |

Không mặc định sao chép trường tài khoản/user, thông tin khách hàng/môi giới hoặc ghi chú nội bộ vào bài mới. Hộp thoại cho xem và biên tập nội dung trước khi lưu vì mô tả/lời giải cũng có thể chứa thông tin này. Đợt chuyển dữ liệu cũ giữ mô tả/lời giải, bối cảnh xử lý và ảnh; không sao chép thêm các trường định danh khách hàng sang bài.

## API, quyền và tính nhất quán

- Thêm `library-api.ts`, kiểu dữ liệu riêng và các thao tác lưu từ nguồn, tìm, đếm, lấy chi tiết, sửa/xóa bài. Bộ đếm và xuất file phải áp dụng cùng quyền/lọc với danh sách.
- Server kiểm tra tài khoản hoạt động, quyền ghi và quyền đọc nguồn; ticket phải còn `resolved`. Nguồn đã sửa sau khi mở hộp thoại cần đối chiếu `source_version` rồi yêu cầu tải lại, không âm thầm lưu bản khác.
- Bài từ ticket: tài khoản hoạt động được đọc; Admin/User được ghi theo mô hình workspace hiện có. Bài từ nhật ký: đọc theo `can_read_care_logs`, lưu/sửa/xóa theo `can_write_care_logs`. Viewer chỉ đọc trong phạm vi được cấp; tài khoản khóa không được truy cập. Kiểm tra cả RLS, RPC, Edge Function, Storage và xuất file.
- Không nhận metadata nguồn, tác giả, phạm vi quyền do client tự khai báo mà thiếu kiểm tra server. RPC đặc quyền phải kiểm tra quyền rõ ràng, giới hạn trường ghi và cố định `search_path`.
- Ghi nội dung và metadata trong transaction; unique nguồn xử lý bấm lặp và hai phiên cùng lưu. Chỉ cập nhật giao diện thành công sau xác nhận từ server.
- Sao chép Storage không thuộc transaction PostgreSQL: dùng trạng thái đang chuẩn bị/hoàn tất, khóa idempotency và job có thể chạy tiếp. Giữ bản chụp nội dung cùng danh sách ảnh; giữ object nguồn khỏi GC khi job sao chép còn hợp lệ. Nếu ticket/ảnh nguồn bị xóa giữa chừng, job vẫn hoàn thành từ dữ liệu đã giữ. Job lỗi phải retry hoặc hủy và dọn object tạm, không để trạng thái treo vô hạn.
- Chỉ đưa bài vào danh sách chính khi nội dung và toàn bộ ảnh đã chọn được sao chép thành công. Nếu không có ảnh, hoàn tất ngay trong luồng lưu nội dung. Không báo thành công khi ảnh chưa lưu đủ.
- Cập nhật job dọn Storage để phân biệt bucket/path, hỗ trợ ảnh thư viện và không xóa object còn được job sao chép sử dụng. Khi job kết thúc, giải phóng phần giữ ảnh nguồn để GC tiếp tục.

## Giao diện

1. Chi tiết ticket đã xử lý hiện **Lưu vào thư viện**. Chi tiết nhật ký hiện nút này với người có quyền ghi nhật ký.
2. Mở hộp thoại xem trước tiêu đề, mô tả, lời giải, danh mục và ảnh (nếu có); cho biên tập bản sao. Bắt buộc tiêu đề/lời giải trước khi lưu bài mới, không thay đổi quy tắc hoàn thành ticket.
3. Lưu thành công hiển thị thông báo và **Xem trong thư viện**. Lưu lỗi giữ nội dung đang nhập để thử lại.
4. Trang thư viện mở `LibraryDetail`, chỉnh sửa bằng `LibraryForm`; có tìm kiếm, lọc nguồn/hệ thống/phân mục/ngày lưu, phân trang, xuất Excel/PDF từ bài độc lập. Không còn nút tạo ticket và bộ lọc trạng thái ticket trong thư viện.
5. Khi xóa ticket/nhật ký, thông báo rõ nội dung đã lưu ở thư viện vẫn được giữ. Khi xóa bài thư viện, thông báo nguồn vẫn còn nguyên.

## Chuyển đổi dữ liệu và thứ tự triển khai

1. Bổ sung bảng, chỉ mục, quyền, bucket, API và cơ chế sao chép/dọn ảnh; kiểm thử trên cơ sở dữ liệu thử nghiệm.
2. Làm trang thư viện độc lập, hộp thoại lưu, nút ở ticket/nhật ký và xuất file; dùng cờ tính năng để chưa chuyển người dùng trước khi dữ liệu sẵn sàng.
3. Sao lưu dữ liệu và lập manifest nguồn/ảnh. Tại đợt chuyển đổi, tạm ngưng ghi/xóa ticket và thao tác ảnh ở server để chốt tập ticket `resolved` nhất quán, tránh thiếu dữ liệu khi sao chép. Đánh giá số lượng/ảnh trước để chọn khoảng bảo trì phù hợp.
4. Chạy job sao chép theo lô có checkpoint, chạy lại không trùng. Gắn nhãn nguồn chuyển đổi cũ; giữ nguyên bài cũ thiếu lời giải thay vì làm mất nội dung đang có, nhưng đánh dấu cần bổ sung. Lưu người chạy/mốc chuyển đổi riêng với người tạo nguồn.
5. Đối chiếu số bài, nội dung, metadata, số ảnh và khả năng đọc ảnh trước khi bật trang thư viện mới và mở lại ghi ticket. Không tự sao chép nhật ký cũ.
6. Nếu lỗi trước khi chuyển, giữ giao diện cũ và tiếp tục job từ checkpoint. Nếu lỗi sau khi chuyển, giữ nguyên dữ liệu thư viện mới, tạm tắt thao tác lỗi và sửa tiến; không quay lại giao diện cũ khiến các bài mới hoặc bài có nguồn đã xóa biến mất khỏi màn hình.
7. Cập nhật tài liệu vận hành, hướng dẫn CSKH và kiểm tra sau triển khai. Không xóa bảng ticket/nhật ký trong bất kỳ bước chuyển đổi nào.

## Tiêu chí nghiệm thu

- Chuyển ticket sang `resolved` không tăng số bài thư viện; bấm lưu mới tạo bài. Server từ chối lưu ticket chưa hoàn tất dù gọi API trực tiếp.
- Bấm hai lần, retry do mất mạng, hai người lưu đồng thời đều chỉ tạo một bài; không ghi đè bài đã biên tập.
- Sửa/mở lại/xóa ticket hoặc nhật ký không đổi nội dung bài đã lưu. Xóa nguồn rồi chạy cleanup vẫn đọc được toàn bộ ảnh của bài.
- Sửa/xóa bài thư viện không tác động nguồn; nguồn còn tồn tại có thể được lưu lại sau khi bài bị xóa.
- Mất kết nối, lỗi sao chép ảnh hoặc xóa nguồn giữa lúc lưu không tạo bài hoàn tất thiếu nội dung; retry/cleanup không làm mất ảnh đã lưu.
- Nhật ký lưu được vào thư viện mà không tạo ticket; tài khoản không có quyền nhật ký không thấy bài nguồn nhật ký, ảnh, bộ đếm hoặc dữ liệu xuất tương ứng.
- Kiểm tra đầy đủ Admin, User, Viewer, tài khoản khóa, quyền nhật ký read/write/none và thu hồi quyền trong phiên đang mở.
- Tìm kiếm, lọc, phân trang, đếm và Excel/PDF chỉ lấy bài thư viện; hoạt động khi nguồn đã bị xóa.
- Chuyển dữ liệu cũ đối chiếu đủ bài/ảnh; chạy lại job không nhân đôi. Kiểm tra cả ticket thiếu lời giải, ảnh lỗi và khôi phục sau lỗi.
- Chạy test nghiệp vụ/quyền/concurrency, kiểm tra giao diện desktop/mobile và production build trước phát hành.

## Phần đổi nhãn thực hiện cùng yêu cầu này

Đổi “Kênh phát sinh lỗi” thành “Kênh phát sinh” trên form, bộ lọc, chi tiết, nhãn xuất file và mẫu Excel. Parser vẫn nhận tên cột cũ, đồng thời từ chối file chứa cả hai cột trùng ý nghĩa. Giữ nguyên tên trường `system_id` và dữ liệu hệ thống. Các migration lịch sử và tài liệu nghiệm thu cũ được giữ làm dấu vết; thông báo lỗi SQL cũ có thể chuẩn hóa bằng migration tiếp theo khi triển khai phần thư viện.
