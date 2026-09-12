# Bộ nhận diện web SHS CSKH

- Logo nguồn: các file `public/LOGO*.png` do chủ dự án cung cấp. Bộ icon dùng biểu tượng cam gốc, cắt phần trong suốt và giữ tỉ lệ.
- Nền OG: `flow-og-background.jpg`, tạo bằng Google Flow trong project đang mở của chủ dự án. Brief: nền ngà sáng, các thẻ ticket trắng nổi và dải cam đậm ở nửa phải, khoảng trống bên trái dành cho chữ; không yêu cầu Flow vẽ logo hay chữ.
- Thành phẩm: `public/og/shs-cskh.jpg`, 1200 × 630. Logo gốc và chữ tiếng Việt được ghép bằng mã để giữ độ chính xác. Ảnh không chứa dữ liệu khách hàng hoặc ticket thật.
- Icon: favicon ICO nhiều kích thước, PNG 16/32/192/512, Apple Touch 180 và maskable 512. Manifest liên kết các file đã tạo sẵn.

Để tái tạo, cài Python với Pillow và chạy từ thư mục dự án:

```sh
python scripts/generate-brand-assets.py
```

Script sử dụng font có sẵn trong dự án. Commit các thành phẩm sau khi kiểm tra trực quan. Vercel không cần Python hoặc quyền truy cập Google Flow.
