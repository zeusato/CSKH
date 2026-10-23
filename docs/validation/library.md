# Thư viện độc lập và phân loại Lỗi — 23/10/2026

## Database thật

Đã chạy qua SQL Editor của project CSKH sau khi kết nối CLI trực tiếp bị chặn do mạng không có IPv6. Không thay mật khẩu hoặc tắt xác minh TLS.

- `021_independent_library.sql`: ghi nhận lúc 09:46:58 giờ Việt Nam.
- `022_care_log_error_request_type.sql`: ghi nhận lúc 09:49:01 giờ Việt Nam.
- Sao lưu các bảng liên quan bằng API chỉ đọc vào `.local/backups/pre-library-rest-1792723386051.json`. Bản sao không chứa file ảnh nhị phân và không nằm trong Git.
- 19 ticket đã xử lý được sao chép thành 19 bài; 21 ảnh có bản ghi sở hữu thư viện riêng. Đối chiếu nội dung không sai lệch, không trùng nguồn, đọc được 21/21 object ảnh.
- Giữ nguyên 20 ticket. Nhật ký có 1.894 bản ghi tại lần kiểm tra sau migration; tăng từ 1.893 ở bản sao trước migration do ứng dụng vẫn được sử dụng. Migration thư viện không thêm/sửa/xóa nhật ký.
- Kiểm tra API vô danh không đọc được thư viện. Không tạo tài khoản hoặc bản ghi thử nghiệm trên sản xuất.

## Kiểm thử

- Test PostgreSQL cô lập áp dụng schema/migration thật: 21 ca đạt, gồm snapshot, không tự thêm khi hoàn tất, chống lưu lặp, nguồn cũ/stale/pending ảnh, độc lập sửa/xóa, quyền, truy cập Storage, GC chủ sở hữu cuối cùng, và loại Lỗi trong CRUD/import.
- Test trình duyệt headless dùng API giả lập: lưu từ ticket, xóa nguồn vẫn mở được bài/ảnh, biên tập riêng, xuất PDF/Excel, lưu nhật ký chưa hoàn tất, layout 390 px và Viewer chỉ đọc. Ảnh phải giải mã thành công, không chỉ có thẻ img.
- Test Excel giữ nội dung dài, dữ liệu có ký tự đầu giống công thức, giờ Việt Nam, phân trang theo bộ lọc thư viện và tương thích nhãn kênh cũ/mới.

Chi tiết máy đọc được: `library-database.json`, `library-ui.json`, `library-production.json`. Ảnh bằng chứng và file xuất thử ở `.local/library-qa/`, không commit dữ liệu nghiệp vụ.
