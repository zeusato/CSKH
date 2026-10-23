# Thư viện lời giải độc lập

Thư viện dùng `library_entries` và `library_attachments`, không còn là bộ lọc ticket đã xử lý. Migration `021_independent_library.sql` sao chép một lần các ticket `resolved` đang tồn tại; không chuyển hoặc xóa dữ liệu ticket/nhật ký. Những lần hoàn thành ticket sau đó không tự thêm bài.

## Sử dụng

- Ticket đã xử lý có nút **Lưu vào thư viện**. Người lưu xem và sửa tiêu đề, mô tả, lời giải của bản sao rồi lưu. Tất cả ảnh đã tải xong được giữ cùng bài. Nếu còn ảnh đang tải, server yêu cầu đợi hoàn tất.
- Nhật ký có cùng nút cho người có quyền ghi. Có thể lưu hướng dẫn hữu ích ngay cả khi nhật ký chưa hoàn thành; bắt buộc nhập tiêu đề và lời giải.
- Sau khi lưu, nút đổi thành **Xem trong thư viện**. Lưu lặp cùng nguồn trả về bài hiện có, không ghi đè nội dung đã biên tập.
- Sửa, mở lại hoặc xóa nguồn không thay đổi bài. Sửa/xóa bài cũng không tác động nguồn; nếu xóa bài thì có thể lưu lại nguồn còn tồn tại.
- Thư viện có tìm kiếm theo mã bài/mã nguồn/nội dung, lọc nguồn/hệ thống/phân mục/ngày lưu, phân trang và xuất Excel/PDF. Mã `TV-…` độc lập với mã nguồn. Ngày lưu khác ngày hoàn thành nguồn.
- Bài chuyển từ thư viện cũ có nhãn nguồn chuyển đổi; vẫn giữ bài cũ chưa có lời giải. Khi biên tập bằng giao diện, cần bổ sung lời giải.
- Tên danh mục và bối cảnh xử lý là bản chụp tại lúc lưu. Hiện giao diện sửa tiêu đề, mô tả và lời giải; không đổi nguồn hoặc bối cảnh lịch sử của bài.

## Quyền

Bài từ ticket theo quyền workspace: tài khoản hoạt động được đọc, Admin/User được ghi. Bài từ nhật ký dùng quyền nhật ký: read/write được xem, write hoặc Admin được sửa/xóa/lưu. Viewer không được ghi. Quyền áp dụng ở database, tìm kiếm/bộ đếm, xuất file và Storage; không phụ thuộc nguồn còn tồn tại hay không. Thu hồi quyền làm mất quyền đọc bài tương ứng.

## Ảnh và dọn kho

Triển khai dùng **bản ghi sở hữu riêng, dùng chung file bất biến** trong bucket private `ticket-images`. Không lưu signed URL và không cần sao chép file sang bucket thứ hai. `library_attachments` giữ tên, loại file, kích thước và đường dẫn riêng; không có khóa ngoại sang ticket hoặc ảnh ticket.

Client không có quyền ghi đè/xóa object trực tiếp. Khi xóa metadata của một bên, job GC chỉ được nhận đường dẫn nếu cả hai bảng attachment đều không còn tham chiếu. Chính sách đọc Storage cho phép chủ thể có quyền đọc một trong hai bản ghi sở hữu. Vì vậy xóa ticket rồi chạy cleanup vẫn đọc/xuất được ảnh từ thư viện; xóa bài trước cũng không làm mất ảnh của ticket. File chỉ được dọn khi chủ sở hữu cuối cùng bị xóa.

Lưu nội dung và metadata ảnh trong một transaction, có khóa nguồn/ảnh và khóa theo nguồn để xử lý hai lần lưu đồng thời. Không cần job sao chép file hoặc trạng thái bài lưu dở. Đây là điều chỉnh so với phương án sao chép file trong bản kế hoạch ban đầu.

## Triển khai và xác minh

1. Kiểm tra kết nối SQL và tạo snapshot JSON ở `.local/backups` bằng `node --env-file=.env scripts/library-db.mjs --backup`. Snapshot chứa dữ liệu nghiệp vụ, không commit/share; đây là bản sao hàng và metadata, không phải bản backup nhị phân toàn bộ ảnh.
2. Chạy `node --env-file=.env scripts/migrate.mjs` bằng kết nối có quyền migration. Migration khóa ghi ticket/ảnh trong giao dịch chuyển đổi ngắn, tạo bản ghi và cập nhật GC trước commit; không tải/copy file ảnh. Migration runner ghi checksum để không chạy lại backfill.
3. Kiểm tra số bài `migrated`, đối chiếu nội dung/ảnh với nguồn tại mốc chuyển đổi; kiểm tra REST đã nhận schema mới. Nếu thất bại trước commit, transaction rollback toàn bộ thay đổi của migration này.
4. Đưa frontend đã build lên hosting theo quy trình dự án. Database mới tương thích frontend cũ, nhưng chỉ frontend mới dùng `/library` độc lập và nút lưu. Cần triển khai frontend ngay sau migration để tránh người dùng còn thấy quy tắc cũ.
5. Sau chuyển đổi không rollback bằng cách xóa các bảng mới. Giữ dữ liệu đã lưu và sửa tiến. Edge Function cleanup hiện có tiếp tục hoạt động qua RPC `claim_storage_gc` đã cập nhật, không cần deploy function mới.

Kiểm thử cô lập: `node scripts/test-library-database.mjs`; UI giả lập mạng: `node scripts/test-library-ui.mjs` với `PLAYWRIGHT_MODULE`, `CARE_BROWSER_PATH` nếu cần. Test UI không dùng tài khoản thật hoặc ghi dữ liệu sản xuất.
