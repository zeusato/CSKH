# Thiết kế giao diện webapp CSKH

Trạng thái: hướng Tinh gọn đã được người dùng chốt ngày 12/09/2026. Tài liệu này hướng dẫn triển khai thiết kế, không thay đổi phạm vi chức năng trong PLAN.md.

## 1. Nguyên tắc

Đây là công cụ CSKH dùng hằng ngày để nhập, theo dõi và tra cứu ticket. Ưu tiên đọc rõ tiếng Việt, biết ngay nút nào cần bấm, thao tác ít bước và tìm thông tin nhanh.

- Light mode mặc định cho người dùng mới. Không tự chuyển tối theo hệ điều hành ở lần dùng đầu.
- Có công tắc sáng/tối mang nhãn chữ; nhớ lựa chọn theo thiết bị bằng localStorage chỉ cho preference giao diện.
- Cam là màu nhấn xuyên suốt. Nội dung nằm trên nền trắng/xám rất nhạt, chữ tối rõ.
- Chỉ dùng màu nhấn ở nơi có ý nghĩa: nút chính, mục chọn, focus và điểm nhận diện.
- Các thao tác chính có cả nhãn chữ. Icon hỗ trợ nhận biết, không thay thế tên thao tác.
- Dùng bố cục nhất quán giữa ticket, thư viện và danh mục. Tránh nhiều vùng cuộn lồng nhau.
- Hiệu ứng ngắn cho mở/đóng, loading và phản hồi thao tác; tôn trọng reduced motion.

Áp dụng hướng dẫn `frontend-design` của Anthropic đã được đọc trong phiên làm việc: thiết kế dựa trên người dùng và nội dung thực, typography có chủ đích, cấu trúc rõ, tiết chế trang trí. [Nguồn skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)

## 2. Logo đã kiểm tra

| File | Đặc điểm đã xác minh | Cách dùng |
|---|---|---|
| `public/LOGO Light.png` | 1000 × 600, nền trong suốt, chữ SHS xanh đậm | Light mode, màn đăng nhập và PDF |
| `public/LOGO.png` | 1000 × 600, nền trong suốt, chữ SHS trắng | Dark mode |
| `public/LOGO 2.png` | 613 × 601, biểu tượng riêng trên nền trong suốt | Vị trí chỉ cần biểu tượng, cân nhắc favicon |

Kiểm tra pixel xác nhận chữ xanh khoảng `#0A2762`; phần cam của logo có gradient, mẫu phổ biến gần `#FE8700`. Đây là màu đọc từ file PNG, không được coi là mã Pantone/brand guideline chính thức.

Giữ nguyên nội dung, màu và tỉ lệ logo. Hiển thị `object-fit: contain`, có khoảng trống xung quanh. Dùng logo Light cho PDF dù người dùng đang xem ứng dụng bằng dark mode. Không thêm hiệu ứng/đổ bóng vào logo.

## 3. Bộ màu đề xuất triển khai

| Token | Light | Dark | Công dụng |
|---|---|---|---|
| `background` | `#F6F7F9` | `#17191E` | Nền tổng thể |
| `surface` | `#FFFFFF` | `#21242B` | Bảng, form, vùng đọc |
| `text` | `#202733` | `#EEF0F4` | Nội dung chính |
| `text-muted` | `#526073` | `#B5BFCD` | Thông tin phụ vẫn phải rõ |
| `border` | `#DBE0E7` | `#404650` | Phân cách và ô nhập |
| `brand-orange` | `#FE8700` | `#FE8700` | Màu tham chiếu lấy từ logo, dùng điểm nhận diện |
| `primary` | `#B84A07` | `#FFAD70` | Biến thể cam cho nút/link dễ đọc |
| `primary-foreground` | `#FFFFFF` | `#351A08` | Chữ trên nút chính |
| `selected-background` | `#FFF1E7` | `#4B3020` | Mục đang chọn |
| `brand-navy` | `#0A2762` | Theo logo trắng | Nhận diện trong logo, không thành màu nút cạnh tranh |

Màu cam của nút là biến thể đậm để chữ trắng rõ hơn; không tô lại logo thành màu nút. Khi có brand guideline chính thức, cập nhật token nhận diện và kiểm tra lại độ tương phản trên các trạng thái hover/focus/disabled.

Trạng thái dùng cả nhãn và màu: Tiếp nhận xanh lam dịu, Đang xử lý vàng nâu, Đã xử lý xanh lá, Đã hủy xám. Xóa là thao tác nguy hiểm, có nhãn và màu phù hợp, không dùng nhầm cam thương hiệu để biểu thị mọi trạng thái.

## 4. Typography, kích thước và khoảng cách

- UI dùng Segoe UI với fallback sans-serif có đủ tiếng Việt, phù hợp môi trường Windows của người dùng; không tải font chỉ để tạo khác biệt hình thức.
- Nội dung và ô nhập: 16 px; thông tin phụ trong ticket: 14 px; nhãn bảng: 14 px; tiêu đề trang: 24–28 px.
- Tiêu đề ticket đậm vừa, nội dung có line-height khoảng 1.5–1.65. Mô tả/kết quả xuống dòng và giữ khoảng cách đoạn.
- Nút/ô nhập có vùng thao tác tối thiểu khoảng 44 px. Dòng bảng theo nội dung, không ép quá thấp.
- Spacing dùng thang 4/8/12/16/24/32 px. Bo góc khoảng 8 px cho controls, có điều chỉnh nhỏ theo vai trò component.
- Không giảm cỡ chữ để nhét thêm nhiều cột. Cột phụ có thể ẩn/mở hoặc chuyển vào chi tiết.
- Ngày giờ dùng chữ số căn đều; thời gian theo `dd/MM/yyyy HH:mm` và múi giờ Việt Nam.
- Kiểm tra zoom 125% và 150% trên màn hình laptop; không che nút Lưu hoặc làm form tràn ngang.

## 5. Bố cục

```text
┌─────────────────────┬─────────────────────────────────────────┐
│ Logo SHS             │ Tên màn hình             Sáng / Tối     │
│                     ├─────────────────────────────────────────┤
│ Ticket              │ Quản lý ticket              Tạo ticket  │
│ Thư viện            │ Tìm kiếm                  Lọc hệ thống  │
│                     │ Tab trạng thái       Bộ lọc mở rộng     │
│ Danh mục            ├─────────────────────────────────────────┤
│ Tài khoản (Admin)   │ Bảng ticket: tiêu đề, thời gian,          │
│                     │ trạng thái, bên xử lý                    │
│ Hồ sơ / Đăng xuất   │ Phân trang                   Xuất Excel  │
└─────────────────────┴─────────────────────────────────────────┘
```

Sidebar ổn định khoảng 200–220 px trên desktop. Nội dung căn trái, tận dụng chiều rộng còn lại. Không đặt dashboard thống kê ở trang đầu: công việc chính bắt đầu từ danh sách ticket.

Bảng ưu tiên: mã/tiêu đề, thời điểm tiếp nhận, hệ thống/phân mục, trạng thái, bộ phận xử lý. Những trường dài ở màn chi tiết. Không hiển thị ảnh đầy đủ trong mỗi dòng danh sách.

Form tạo/sửa có bốn nhóm dễ đọc: Nội dung vấn đề; Phân loại và bên xử lý; Trạng thái và kết quả; Ảnh đính kèm. Trường bắt buộc được đánh dấu, lỗi nằm gần trường. Nút Lưu/Hủy luôn tìm thấy dễ dàng.

Chi tiết có bố cục đọc giống một phiếu xử lý: header ngắn, các mốc thời gian, mô tả, kết quả, bên xử lý, ảnh. Kết quả xử lý nổi bật đủ để CSKH tìm thấy ngay khi đọc ticket từ thư viện.

## 6. Trạng thái tương tác

| Tình huống | Cách thể hiện |
|---|---|
| Đang tải lần đầu | Skeleton gần với bảng thật, không làm layout nhảy |
| Đang tìm lại | Giữ nội dung hiện tại và chỉ báo đang tìm; không nhấp nháy trang trắng |
| Chưa có ticket | Giải thích ngắn và nút Tạo ticket |
| Không có kết quả | Hiện từ khóa/filter, có cách xóa lọc để tìm lại |
| Lưu thành công | Thông báo ngắn và cập nhật dữ liệu đúng trên danh sách |
| Lưu lỗi | Giữ nội dung nhập, nói rõ bước thử lại |
| Có người vừa sửa | Báo xung đột, cho xem bản mới và giữ nội dung đang nhập |
| Upload ảnh lỗi | Hiện lỗi đúng ảnh, có nút thử lại hoặc bỏ ảnh |
| Xóa | Dialog ghi đúng đối tượng; nút Hủy và Xóa rõ ràng |
| Xóa danh mục bị chặn | Nói đang có ticket/nhân sự/tài khoản tham chiếu, không báo lỗi database thô |

## 7. Checklist review thiết kế

- Dùng đúng logo cho nền sáng/tối, không kéo méo ảnh.
- Lần mở đầu hiển thị light ngay, không nháy dark rồi đổi lại.
- Màu, cỡ chữ và khoảng cách theo token; tất cả nội dung chính đọc được ở zoom thường.
- Label tồn tại cả khi người dùng đã nhập dữ liệu; không dùng placeholder thay label.
- Thao tác bằng Tab/Enter/Escape hợp lý; focus luôn nhìn thấy.
- Tooltip chỉ bổ sung, không chứa hướng dẫn bắt buộc để dùng ứng dụng.
- Màu trạng thái đi kèm chữ, phù hợp cả hai theme.
- Ảnh lỗi đọc được khi phóng lớn; không cắt phần chữ ở chế độ xem chi tiết.
- Bảng dài, tiêu đề dài, phòng ban dài và kết quả nhiều đoạn không phá bố cục.
- Excel/PDF là module tải khi dùng; hiệu ứng giao diện không cản gõ/tìm kiếm.

Mẫu đối chiếu đã chọn: `docs/design-reference.html`, preset Tinh gọn, khoảng cách Thoải mái, light mode. File là bản chụp mã của mẫu tương tác trong cuộc trao đổi; bản triển khai sẽ thay biểu tượng mẫu bằng logo gốc ở trên.
