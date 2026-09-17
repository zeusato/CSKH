# Đặc tả nâng cấp: Phân hệ Nhật ký CSKH

Ngày lập: 17/09/2026. Phiên bản tài liệu: 1.1.

Trạng thái: đã cập nhật năm quyết định nghiệp vụ D-01 đến D-05 theo xác nhận của chủ dự án. Các chi tiết kỹ thuật còn là thiết kế triển khai, cần kiểm chứng bằng kiểm thử. Tài liệu này không xác nhận chức năng đã được xây dựng hoặc triển khai lên Supabase.

Cập nhật triển khai: mã nguồn phân hệ và kiểm thử cục bộ đã được bổ sung. Xem [báo cáo triển khai và các phần còn chờ](validation/care-logs.md), [hướng dẫn sử dụng](CARE-LOGS.md). Trạng thái backend/website thực tế được ghi ở báo cáo này, không suy ra từ đặc tả.

## 1. Mục tiêu và phạm vi đã thống nhất

Bổ sung phân hệ để bộ phận CSKH ghi nhận, tra cứu và theo dõi các vấn đề nghiệp vụ đang được quản lý bên ngoài ứng dụng. Phân hệ sử dụng chung ứng dụng, tài khoản và các danh mục phù hợp; dữ liệu nghiệp vụ được lưu riêng với ticket hiện tại.

Yêu cầu từ cuộc trao đổi:

| Mã | Yêu cầu |
|---|---|
| YC-01 | Tạo bảng `care_logs` riêng để lưu nhật ký CSKH. |
| YC-02 | Tận dụng hệ thống danh mục hiện có khi cùng ý nghĩa nghiệp vụ. |
| YC-03 | Admin cấp quyền truy cập nhật ký tại màn quản lý tài khoản. |
| YC-04 | Có danh sách, xem chi tiết, tạo, chỉnh sửa và theo dõi trạng thái. |
| YC-05 | Hỗ trợ tìm kiếm, bộ lọc, xuất Excel và xuất PDF. |
| YC-06 | Cung cấp mẫu Excel với các cột được đặt tên cụ thể để nhập dữ liệu cũ. |
| YC-07 | Sau khi tải file, hiển thị dữ liệu đã nhận diện để người dùng xem trước. Chỉ ghi bản ghi nghiệp vụ khi người dùng xác nhận. |
| YC-08 | Nhật ký độc lập với nội dung ticket phối hợp và thư viện lời giải hiện tại. |

Ảnh tham chiếu có 13 cột nghiệp vụ: Phân loại yêu cầu; Mô tả vấn đề; Kênh phát sinh lỗi; Phân mục; Bộ phận tiếp nhận; Nhân sự tiếp nhận; Bộ phận phối hợp xử lý; Nhân sự phối hợp xử lý; Nội dung phản hồi từ bộ phận CSKH; Trạng thái xử lý; Thời gian tiếp nhận; Thời gian hoàn thành; Ghi chú.

Đã chốt: kênh phát sinh lỗi dùng danh mục hệ thống liên quan; bộ phận/nhân sự phối hợp dùng danh mục chung; Viewer chỉ được cấp tối đa quyền đọc nhật ký; quyền Chỉnh sửa bao gồm xóa; trường bắt buộc theo mục 3 và mục 6. Mục 15 ghi lại các quyết định này. Các nội dung còn ghi “đề xuất”, bao gồm giới hạn file, vẫn là thiết kế cần kiểm chứng; không coi sự im lặng là phê duyệt.

### 1.1. Kết quả mong muốn

- CSKH có thể chuyển danh sách đang theo dõi trong Excel vào ứng dụng mà vẫn giữ đúng nội dung, người tiếp nhận và thời gian nghiệp vụ.
- Người dùng nhìn thấy cách hệ thống diễn giải từng dòng trước khi nhập chính thức.
- Admin kiểm soát ai được đọc và ai được chỉnh sửa nhật ký.
- Bản ghi nhật ký không xuất hiện trong danh sách, bộ đếm, tìm kiếm hoặc thư viện ticket.
- Phân hệ mới không làm thay đổi quyền và luồng làm việc hiện tại của ticket.

### 1.2. Giới hạn bản đầu đề xuất

- Một vấn đề là một bản ghi; một bộ phận/nhân sự tiếp nhận và tối đa một bộ phận/nhân sự phối hợp.
- Import chỉ tạo mới, không cập nhật hoặc ghi đè bản ghi đã tồn tại.
- Import `.xlsx`; chưa hỗ trợ `.xls`, `.xlsm`, CSV, ảnh nhúng, file đính kèm hoặc nhiều sheet dữ liệu trong một lần nhập.
- Chưa có SLA, giao việc, thông báo tới bên phối hợp, tích hợp Zalo/email hoặc tự chuyển nhật ký thành ticket.
- Chưa có bình luận theo hội thoại và lịch sử phiên bản đầy đủ. Có người tạo, người cập nhật, thời điểm và nguồn nhập để truy vết cơ bản.
- Ảnh đính kèm nhật ký chưa thuộc phạm vi đã chốt. Nếu bổ sung phải có bảng metadata và chính sách Storage riêng; không tái sử dụng trực tiếp metadata ảnh ticket.

## 2. Hiện trạng dự án và tác động kiến trúc

Đối chiếu mã nguồn tại thời điểm lập tài liệu:

| Thành phần | Hiện trạng | Cách mở rộng |
|---|---|---|
| Ứng dụng | React, TypeScript, Vite; router ở `src/App.tsx` | Thêm route `/care-logs` và mục menu Nhật ký CSKH. |
| Truy vấn | TanStack Query; nghiệp vụ ticket ở `src/lib/api.ts` | Tách API, kiểu dữ liệu và query key cho nhật ký. |
| Auth | Supabase Auth; hồ sơ ở `app_users`; role `admin`, `user`, `viewer` | Thêm quyền riêng cho nhật ký, giữ role hiện tại. |
| Quản lý tài khoản | `src/pages/Users.tsx`, Edge Function `admin-users` | Bổ sung đọc/ghi quyền nhật ký trong luồng tạo và sửa tài khoản. |
| Danh mục | `categories`, `systems`, `departments`, `staff` | Dùng chung; Kênh phát sinh lỗi tham chiếu `systems`, bộ phận/nhân sự phối hợp tham chiếu `departments`/`staff`. |
| Ticket | `tickets`, tìm kiếm RPC, trigger và RLS riêng | Giữ bảng và luồng ticket. Nhật ký có bảng, RPC, trigger và RLS riêng. |
| Thư viện | Trang `Tickets` với `library=true`, lọc `resolved` | Không nối nhật ký vào nguồn dữ liệu này. |
| Excel | ExcelJS trong Web Worker | Dùng lại kỹ thuật xử lý workbook; tách cấu hình cột và worker import. |
| PDF | `pdf-lib`, fontkit, font Noto Sans và logo SHS | Dùng lại bố cục và tiện ích; tạo exporter nhật ký với đủ 13 trường. |
| Migration | Repo có migration 001–018, kiểm tra checksum | Thêm migration kế tiếp còn trống; không sửa migration đã áp dụng. |

Luồng dữ liệu dự kiến:

```text
Tài khoản → kiểm tra quyền nhật ký → danh sách / chi tiết / form
                                        ↓
                                 API và RPC nhật ký
                                        ↓
                          RLS + kiểm tra dữ liệu hiện hành
                                        ↓
                                    care_logs

Excel mẫu → người dùng điền → đọc file trong worker → xem trước
                                                      ↓
                                             xác nhận nhập
                                                      ↓
                              server kiểm tra lại + giao dịch nguyên khối
                                                      ↓
                                  care_log_import_batches + care_logs
```

Không cần tách một ứng dụng hoặc máy chủ web mới. Hạn chế tách lại toàn bộ module ticket trong đợt nâng cấp này; chỉ trích xuất tiện ích dùng chung khi có nhu cầu thực tế.

## 3. Nghiệp vụ và quy tắc dữ liệu

### 3.1. Các trường nghiệp vụ

| Trường hiển thị | Trường dữ liệu dự kiến | Quy tắc đề xuất |
|---|---|---|
| Mã nhật ký | `code`, `number` | Hệ thống sinh `NK-000001` từ sequence riêng; người dùng không nhập. |
| Phân loại yêu cầu | `request_type` | Bắt buộc; Hỗ trợ / Khiếu nại / Ý kiến đóng góp. |
| Mô tả vấn đề | `description` | Bắt buộc; văn bản nhiều dòng, sau trim phải có nội dung. |
| Kênh phát sinh lỗi | `system_id` | Chọn từ `systems` như Hệ thống liên quan của ticket; được để trống. Không tạo danh mục kênh riêng. |
| Phân mục | `category_id` | Chọn từ `categories`; được để trống. |
| Bộ phận tiếp nhận | `receiving_department_id` | Bắt buộc; liên kết `departments`. |
| Nhân sự tiếp nhận | `receiving_staff_id` | Chọn từ `staff` thuộc bộ phận tiếp nhận; được để trống khi nhập lịch sử thiếu thông tin. |
| Bộ phận phối hợp xử lý | `coordinating_department_id` | Tùy chọn, dùng chung danh mục `departments` hiện có. |
| Nhân sự phối hợp xử lý | `coordinating_staff_id` | Tùy chọn, dùng chung danh mục `staff`; khi có thì phải có bộ phận phối hợp phù hợp. |
| Nội dung phản hồi từ bộ phận CSKH | `response_content` | Văn bản nhiều dòng; được để trống cả với dữ liệu lịch sử đã xử lý. |
| Trạng thái xử lý | `status` | Bắt buộc trong import; form tạo mới mặc định Tiếp nhận. |
| Thời gian tiếp nhận | `received_at` | Bắt buộc; form tạo mới mặc định thời gian hiện tại. Import giữ thời gian trong file. |
| Thời gian hoàn thành | `completed_at` | Bắt buộc nếu đã xử lý; để trống với trạng thái khác. |
| Ghi chú | `notes` | Văn bản nhiều dòng độc lập với mô tả và phản hồi. |

Đề xuất không thêm trường tiêu đề bắt buộc, vì mẫu tham chiếu chỉ có mô tả. Danh sách sử dụng đoạn đầu mô tả làm nội dung chính, bên cạnh mã nhật ký. Nếu sau này bổ sung tiêu đề, cần cập nhật schema và phiên bản mẫu có chủ đích.

Giới hạn văn bản đề xuất: 100.000 ký tự mỗi trường mô tả/phản hồi/ghi chú tại database và form. Excel có giới hạn riêng: không cho import một ô văn bản quá 32.767 ký tự, không cắt nội dung âm thầm. Xuất nội dung dài theo cơ chế tại mục 9.

### 3.2. Trạng thái và mốc thời gian

| Giá trị lưu | Nhãn | Quy tắc |
|---|---|---|
| `received` | Tiếp nhận | Chưa hoàn thành, `completed_at` rỗng. |
| `in_progress` | Đang xử lý | Chưa hoàn thành, `completed_at` rỗng. |
| `resolved` | Đã xử lý | Phải có thời gian hoàn thành, không trước thời gian tiếp nhận. |
| `cancelled` | Đã hủy | `completed_at` rỗng; có thể ghi lý do trong ghi chú. |

- Form chuyển sang Đã xử lý gợi ý giờ hiện tại; cho sửa lại nếu đang ghi nhận công việc đã xảy ra.
- Import không tự điền giờ hiện tại cho dòng đã xử lý nhưng thiếu giờ hoàn thành; trả lỗi để người dùng bổ sung.
- Mở lại bản ghi đã xử lý sẽ xóa `completed_at`. Giao diện thông báo rõ trước khi lưu.
- Database lưu `timestamptz`; giao diện, mẫu và báo cáo diễn giải theo `Asia/Ho_Chi_Minh`.
- `created_at` là thời điểm dữ liệu được ghi vào ứng dụng, độc lập với `received_at` và `completed_at`.
- Có thể nhập tiếp nhận trong quá khứ; thời gian nghiệp vụ nằm trong tương lai được cảnh báo khi xem trước, không tự sửa.
- Thời lượng xử lý tính từ tiếp nhận tới hoàn thành; chưa có SLA hoặc trừ ngày nghỉ.
- Trigger của nhật ký phải được thiết kế riêng để giữ giờ lịch sử; không sao chép nguyên trigger ticket đang tự lấy thời gian hoàn thành.

### 3.3. Danh mục và nhân sự

- Phân mục, phòng ban và nhân sự cùng nghĩa được dùng chung bằng khóa ngoại.
- Kênh phát sinh lỗi chính là danh sách Hệ thống liên quan (`systems`) đang dùng cho ticket; dùng chung ID, tên và thứ tự hiển thị hiện có. Nhãn trên form, bộ lọc và mẫu import nhật ký là “Kênh phát sinh lỗi”. Đây không phải kênh tiếp nhận điện thoại/email/Zalo và không phải nguồn MG/Khách hàng.
- Bộ phận/nhân sự phối hợp chọn trực tiếp từ `departments`/`staff`, không tạo danh bạ riêng cho nhật ký. Chọn các trường này chỉ ghi nhận thông tin, không tự tạo ticket hoặc quy trình phối hợp.
- Nhân sự tiếp nhận khác người tạo bản ghi. `staff` là danh bạ; `app_users` là tài khoản đăng nhập, không giả định hai bảng có cùng ID.
- Form có thể gợi ý bộ phận từ hồ sơ tài khoản. Chỉ gợi ý nhân sự nếu có ánh xạ đã xác định; không tự ghép người chỉ dựa vào trùng tên.
- Khi thêm mới hoặc thay đổi cặp bộ phận/nhân sự, kiểm tra nhân sự hiện thuộc bộ phận đã chọn ở cả frontend và database.
- Với bản ghi cũ có nhân sự đã chuyển phòng, cho giữ nguyên cặp cũ nếu người dùng chỉ sửa nội dung; hiển thị chú thích đã chuyển phòng, tương tự ticket.
- Import là tạo mới: cặp không khớp danh mục hiện hành phải sửa trước khi nhập. Việc cho phép giữ phòng ban lịch sử khác danh mục cần một quyết định nghiệp vụ riêng.
- Danh mục đang được `care_logs` tham chiếu không được xóa. Thông báo cần nói rõ đang được nhật ký hoặc dữ liệu liên quan sử dụng.
- Quyền chỉnh sửa nhật ký không tự cấp thêm quyền quản lý danh mục.
- Khi danh mục dùng chung được đổi tên, nhật ký hiển thị tên mới. Việc giữ nguyên tên lịch sử chưa nằm trong bản đầu.

## 4. Phân quyền

### 4.1. Mô hình đề xuất

Thêm `app_users.care_log_access` với các giá trị `none`, `read`, `write`; mặc định `none` cho tài khoản không phải Admin. Admin đang hoạt động có toàn quyền hiệu lực, không phụ thuộc giá trị lưu tại trường này.

| Đối tượng | Không truy cập | Chỉ xem | Chỉnh sửa |
|---|---|---|---|
| User | Có thể được cấp | Có thể được cấp | Có thể được cấp |
| Viewer | Có thể được cấp | Có thể được cấp | Không cho phép, đã chốt D-03 |
| Admin | Không áp dụng | Không áp dụng | Luôn toàn quyền khi hoạt động |
| Tài khoản bị khóa / chưa có hồ sơ | Không có quyền hiệu lực ở mọi trường hợp | — | — |

Khi tạo Admin, lưu `care_log_access=none` và tính quyền hiệu lực từ role Admin. Khi đổi Admin thành User, quyền riêng được ghi theo lựa chọn rõ ràng của Admin thao tác, không vô tình kế thừa toàn quyền.

Khi đổi User có quyền `write` thành Viewer, màn hình yêu cầu chọn `none` hoặc `read` và gửi cập nhật role/quyền trong cùng thao tác. Database cũng chặn tổ hợp `viewer + write`; không chỉ kiểm tra trên giao diện.

### 4.2. Ma trận thao tác

| Thao tác | Không truy cập | Chỉ xem | Chỉnh sửa | Admin |
|---|---|---|---|---|
| Thấy menu, danh sách, chi tiết, bộ đếm | Không | Có | Có | Có |
| Tìm kiếm, lọc | Không | Có | Có | Có |
| Xuất Excel/PDF | Không | Có | Có | Có |
| Tạo, sửa, đổi trạng thái | Không | Không | Có | Có |
| Xóa bản ghi | Không | Không | Có | Có |
| Tải mẫu, xem trước và thực hiện import | Không | Không | Có | Có |
| Xem danh sách theo đợt import | Không | Có | Có | Có |
| Cấp/thu hồi quyền nhật ký | Không | Không | Không | Có |

Đề xuất mọi người có quyền nhật ký cùng truy cập một kho, không giới hạn theo người tạo hoặc phòng ban. Nếu cần giới hạn theo nhóm sau này, phải sửa cả chính sách đọc, RPC tìm kiếm, xuất file và import.

### 4.3. Thực thi quyền

- Bổ sung guard `private.can_read_care_logs()` và `private.can_write_care_logs()` kiểm tra `auth.uid()`, trạng thái hoạt động, role và quyền hiện tại từ database.
- Bật RLS trên `care_logs` và bảng thông tin đợt nhập; cấp quyền tối thiểu cho `authenticated`, chặn `anon`.
- Mọi endpoint đọc chi tiết, tìm kiếm, đếm, xuất file, kiểm tra import và ghi import đều phải áp dụng quyền nhật ký.
- Không nhận quyền, người tạo hoặc danh tính thực thi từ payload trình duyệt làm nguồn tin cậy.
- Chỉ Edge Function `admin-users` đã kiểm tra Admin hiện hành được thay đổi quyền; client không được update trực tiếp hồ sơ để tự nâng quyền.
- Thu hồi quyền có hiệu lực với yêu cầu database mới kể cả JWT cũ còn hạn. Hồ sơ nền hiện kiểm tra khoảng 30 giây phải cập nhật UI và xóa cache nhật ký khi mất quyền.
- Nếu dùng lõi tìm kiếm `SECURITY DEFINER`, guard phải là quyền nhật ký, không phải chỉ `is_active_user()` của ticket. Hàm có `search_path` cố định và kiểm tra tham số.
- Dữ liệu/file người dùng đã tải hợp lệ về máy không thể thu hồi từ xa. Không hứa xóa được bản sao đã xuất khi đổi quyền.

### 4.4. Thay đổi màn quản lý tài khoản

Thêm lựa chọn “Quyền Nhật ký CSKH” vào cả form tạo và sửa tài khoản; nhãn: Không truy cập / Chỉ xem / Chỉnh sửa. Với Admin, hiển thị “Toàn quyền theo vai trò Admin”. Với Viewer, không có lựa chọn Chỉnh sửa. Nhãn trợ giúp của quyền Chỉnh sửa nêu rõ bao gồm tạo, sửa, xóa và import nhật ký.

Danh sách tài khoản hiển thị quyền nhật ký để Admin dễ rà soát. Lưu xong phải đọc lại và hiển thị đúng giá trị server đã chấp nhận; lỗi quyền không được báo thành công.

## 5. Màn hình và trải nghiệm sử dụng

### 5.1. Danh sách `/care-logs`

- Cùng phong cách với ứng dụng hiện tại: logo SHS, màu cam, sáng/tối, hỗ trợ màn hình nhỏ và bàn phím.
- Thanh công cụ: tìm kiếm, bộ lọc, làm mới, xuất Excel; người được chỉnh sửa thấy thêm Tạo nhật ký và Nhập Excel.
- Cột ưu tiên: mã/mô tả, phân loại, kênh, tiếp nhận, trạng thái, nhân sự tiếp nhận. Thông tin dài và phối hợp xem trong chi tiết hoặc cột mở rộng.
- Không ép tất cả 13 trường thành bảng quá rộng trên màn hình nhỏ.
- Có phân trang cursor, trạng thái đang tải/lỗi/rỗng; bộ lọc và bản ghi đang mở có thể lưu vào URL theo cách hiện tại.
- Query key dùng `care-logs`, `care-log`, `care-log-counts`, không dùng `tickets` hoặc `ticket-counts`.
- Tab trạng thái, nếu dùng bộ đếm toàn kho, phải có nhãn giải thích tương tự trang ticket. Bộ đếm chỉ tính dữ liệu nhật ký mà người dùng được đọc.

### 5.2. Tạo và chỉnh sửa

Form chia bốn nhóm:

1. Vấn đề: phân loại, mô tả, kênh, phân mục.
2. Tiếp nhận và phối hợp: hai cặp phòng ban/nhân sự tách biệt.
3. Xử lý: trạng thái, nội dung phản hồi, tiếp nhận và hoàn thành.
4. Ghi chú.

Hiển thị trường bắt buộc, lỗi gần trường và giữ nội dung khi lưu lỗi. Cảnh báo đóng khi đang nhập chưa lưu. Kiểm tra phiên bản khi lưu hoặc xóa để tránh ghi đè thay đổi của người khác; cho giữ nội dung đang nhập khi phát hiện xung đột.

### 5.3. Chi tiết

Hiển thị đầy đủ nội dung nghiệp vụ, mã, trạng thái, người tạo/cập nhật, thời điểm ghi hệ thống và thông tin đợt nhập nếu có. Có Xuất PDF; người có quyền chỉnh sửa có thêm Sửa và Xóa.

Bản ghi đã xử lý vẫn nằm trong Nhật ký CSKH, không tự trở thành tài liệu thư viện.

### 5.4. Tìm kiếm và bộ lọc

- Tìm kiếm không phân biệt hoa/thường và dấu tiếng Việt theo mã nhật ký, mô tả, phản hồi và ghi chú.
- Ưu tiên mã chính xác, sau đó mô tả và nội dung. Kết quả có thứ tự ổn định với khóa phụ ID để phân trang.
- Lọc theo phân loại, kênh, phân mục, bộ phận/nhân sự tiếp nhận, bộ phận/nhân sự phối hợp, trạng thái, đợt nhập và khoảng ngày.
- Khoảng ngày cho chọn thời điểm tiếp nhận, hoàn thành hoặc tạo trên hệ thống; ngày cuối bao gồm hết ngày theo giờ Việt Nam.
- Sắp xếp theo tiếp nhận, hoàn thành hoặc tạo mới nhất. Quy tắc xử lý giá trị hoàn thành rỗng phải ổn định giữa các trang.
- Tìm kiếm và bộ lọc chỉ tác động tới nhật ký; không gọi RPC tìm ticket để ghép dữ liệu hai loại.

## 6. Mẫu Excel import

### 6.1. Cấu trúc workbook

Tên tải xuống đề xuất: `SHS-Mau-nhap-nhat-ky-CSKH-v1.xlsx`.

| Sheet | Vai trò |
|---|---|
| `Du lieu` | Sheet duy nhất được đọc để nhập; dòng 1 là tên cột, dòng 2 trở đi là dữ liệu. |
| `Huong dan` | Hướng dẫn, trường bắt buộc, ví dụ, quy tắc ngày giờ, giới hạn và phiên bản mẫu. |
| `Danh muc` | Danh sách giá trị hợp lệ tại thời điểm tải, dùng cho dropdown và tra cứu. |
| `_meta` | Sheet kỹ thuật ẩn chứa mã loại mẫu và phiên bản, không chứa bí mật hoặc quyền. |

Sheet `Du lieu` không có bản ghi ví dụ được nhập sẵn để tránh người dùng vô tình import ví dụ. Ví dụ chỉ nằm ở `Huong dan`. Header cố định, có filter, wrap text và độ rộng cột phù hợp. Data validation là hỗ trợ nhập, không thay thế kiểm tra khi tải lên.

### 6.2. Tên cột chuẩn của mẫu v1 đề xuất

| STT | Tên cột | Bắt buộc có giá trị | Quy tắc nhập |
|---|---|---|---|
| 1 | Phân loại yêu cầu | Có | Hỗ trợ / Khiếu nại / Ý kiến đóng góp. |
| 2 | Mô tả vấn đề | Có | Văn bản; giữ xuống dòng. |
| 3 | Kênh phát sinh lỗi | Không | Tên hệ thống trong danh mục `systems` hiện có. |
| 4 | Phân mục | Không | Tên từ danh mục phân mục. |
| 5 | Bộ phận tiếp nhận | Có | Tên phòng ban hiện có. |
| 6 | Nhân sự tiếp nhận | Không | Tên nhân sự, xác định trong bộ phận tiếp nhận. |
| 7 | Bộ phận phối hợp xử lý | Không | Tên phòng ban trong danh mục `departments` dùng chung. |
| 8 | Nhân sự phối hợp xử lý | Không | Tên nhân sự trong danh mục `staff` dùng chung, thuộc bộ phận phối hợp đã chọn. |
| 9 | Nội dung phản hồi từ bộ phận CSKH | Không | Văn bản; giữ xuống dòng. |
| 10 | Trạng thái xử lý | Có | Tiếp nhận / Đang xử lý / Đã xử lý / Đã hủy. |
| 11 | Thời gian tiếp nhận | Có | Ngày giờ theo quy tắc mục 6.3. |
| 12 | Thời gian hoàn thành | Khi Đã xử lý | Không trước tiếp nhận; trạng thái khác phải để trống. |
| 13 | Ghi chú | Không | Văn bản; giữ xuống dòng. |

Tất cả cột trong mẫu đã phát hành phải tồn tại kể cả khi ô được phép để trống. Có thể đổi thứ tự cột; hệ thống ánh xạ theo tên, không theo vị trí.

Header được chuẩn hóa Unicode NFC, khoảng trắng đầu/cuối, xuống dòng và khoảng trắng liên tiếp; so khớp không phân biệt hoa/thường. Không tự đoán tên cột gần giống hoặc bỏ dấu để ghép cột. Nếu cần hỗ trợ tên cũ, khai báo alias rõ theo phiên bản.

Thiếu cột, trùng cột sau chuẩn hóa, cột lạ có dữ liệu, phiên bản mẫu không được hỗ trợ hoặc không có sheet `Du lieu` đều phải báo cụ thể và chặn nhập. Không âm thầm bỏ qua cột có dữ liệu.

### 6.3. Kiểu dữ liệu Excel

- Mẫu và bảng xem trước hiển thị ngày theo `dd/mm/yyyy`. Hỗ trợ ô ngày Excel và chuỗi `dd/MM/yyyy`, diễn giải 00:00 giờ Việt Nam, không cảnh báo chỉ vì thiếu giờ. Tiếp tục chấp nhận `dd/MM/yyyy HH:mm` từ file cũ và giữ nguyên giờ.
- Tôn trọng hệ ngày 1900/1904 của workbook; kiểm thử ngày Excel và chuyển đổi giờ Việt Nam độc lập với múi giờ máy tính.
- Không đoán chuỗi ngày theo kiểu Mỹ hoặc chuỗi mơ hồ. Ngày không tồn tại, serial không hợp lệ hoặc ngoài khoảng hỗ trợ phải báo lỗi.
- Nội dung văn bản giữ Unicode và xuống dòng; trim đầu/cuối, không xóa khoảng trắng bên trong nội dung dài.
- Ô có công thức bị từ chối, kể cả khi có giá trị tính sẵn. Hướng dẫn người dùng dán dưới dạng giá trị trước khi tải lên.
- Chuỗi văn bản bắt đầu bằng dấu `=` vẫn là văn bản nếu kiểu ô là text; xử lý an toàn khi xuất, không thực thi như công thức.
- Ô gộp trong vùng dữ liệu bị từ chối vì không thể xác định chắc giá trị từng dòng.
- Dòng trống hoàn toàn được bỏ qua. Dòng thiếu một phần vẫn phải kiểm tra và báo lỗi theo số dòng Excel gốc.
- Dòng đang ẩn hoặc bị filter trong Excel vẫn được đọc; thông báo rõ trước khi xác nhận.
- Các sheet hướng dẫn/danh mục không được nhập. Sheet dữ liệu khác ngoài `Du lieu` không được tự gộp; thông báo để người dùng biết phạm vi đã đọc.

### 6.4. Đối chiếu danh mục

- Tải danh mục hiện hành khi kiểm tra file, không tin danh mục được nhúng trong file mẫu cũ.
- Chuẩn hóa tên bằng Unicode NFC, trim, khoảng trắng liên tiếp và không phân biệt hoa/thường. Giữ dấu tiếng Việt để tránh ghép nhầm tên.
- Nhân sự được xác định bằng tên và bộ phận. Nếu vẫn có nhiều người trùng tên trong cùng bộ phận, báo không xác định duy nhất; không chọn dòng đầu tiên.
- Nếu có tên gần giống, có thể gợi ý nhưng người dùng phải sửa/chọn xác nhận rõ; bản đầu ưu tiên sửa Excel rồi tải lại.
- Giá trị không tồn tại không tự tạo danh mục và không tự biến thành rỗng. Người có quyền quản lý danh mục có thể bổ sung ở màn Danh mục, sau đó kiểm tra lại file.
- Quyền chỉnh sửa nhật ký không cho phép dùng import để tạo hoặc sửa danh mục ngoài quyền hiện có.

## 7. Luồng import và xem trước

### 7.1. Bước 1 — Chuẩn bị

Người có quyền Chỉnh sửa mở Nhập Excel, tải mẫu và xem hướng dẫn. Màn hình nói rõ: chỉ tạo mới, chưa thay đổi dữ liệu khi tải file, cần xác nhận ở bước cuối.

Giới hạn khởi điểm đề xuất, cần đo trước khi chốt: tối đa 1.000 dòng dữ liệu/file, 10 MB file nén, 50 MB nội dung giải nén và 5 MB payload JSON sau chuẩn hóa. Áp dụng đồng thời các giới hạn; đạt giới hạn dòng không có nghĩa được vượt giới hạn dung lượng.

Thông báo giới hạn phải có ngay tại chỗ chọn file. Không tự chia một file thành nhiều giao dịch trong khi giao diện hứa nhập toàn bộ hoặc không nhập.

### 7.2. Bước 2 — Đọc và kiểm tra file

- Đọc bằng Web Worker để giao diện không bị treo; tải thư viện khi mở chức năng import.
- Kiểm tra định dạng thực tế, kích thước, giới hạn giải nén, sheet, phiên bản và cột trước khi dựng toàn bộ bảng dữ liệu.
- Không chỉ dựa vào đuôi file hoặc kích thước nén; cần cơ chế kiểm tra ZIP/giới hạn bộ nhớ trước khi parse sâu. Nếu thư viện hiện có không cung cấp đủ, bổ sung thành phần kiểm tra phù hợp khi triển khai.
- Chuẩn hóa giá trị, đối chiếu danh mục, kiểm tra quy tắc nghiệp vụ và khả năng trùng.
- Client có thể gọi RPC kiểm tra chỉ đọc để xác thực danh mục/trùng với dữ liệu hiện hành. Chưa tạo `care_logs` hoặc đợt nhập ở bước này.
- Không tải/lưu file gốc vào Storage trong bản đầu; file và dữ liệu xem trước chỉ giữ trong phiên trình duyệt. Không ghi nội dung nghiệp vụ vào log console hoặc hệ thống telemetry.
- Có nút hủy việc phân tích và chọn file khác; khi chọn file mới phải bỏ kết quả file cũ.

### 7.3. Bước 3 — Xem trước

Hiển thị tên file, sheet được đọc, số dòng nguồn, số dòng trống bỏ qua, số dòng hợp lệ, số dòng lỗi và số dòng có cảnh báo. Một dòng có thể có nhiều lỗi/cảnh báo; cách đếm cần rõ, không cộng số ô lỗi thành số dòng lỗi.

Bảng xem trước có số dòng Excel gốc và tất cả 13 trường. Có phân trang hoặc chỉ render vùng đang xem; cho lọc Tất cả / Có lỗi / Có cảnh báo. Các trường dài được mở xem đầy đủ, không chỉ có đoạn cắt mà không thể kiểm tra phần còn lại.

Ngày trong bảng xem trước hiển thị `dd/mm/yyyy` theo giờ Việt Nam. Danh mục hiển thị tên hệ thống đã nhận diện. Mở ô để xem giá trị gốc, bao gồm giờ nếu có. Khung lỗi riêng phía trên bảng ghi rõ dòng, cột, giá trị và hướng sửa, không cần cuộn ngang tới cột cuối.

Ví dụ thông báo:

| Dòng | Cột | Loại | Thông báo |
|---|---|---|---|
| 8 | Nhân sự tiếp nhận | Lỗi | Không tìm thấy nhân sự “Nguyễn A” trong bộ phận “CSKH”. |
| 12 | Thời gian hoàn thành | Lỗi | Thời gian hoàn thành đang trước thời gian tiếp nhận. |
| 17 | Phân mục | Lỗi | “Tra soat” chưa khớp danh mục hiện có; hãy chọn tên trong mẫu mới nhất. |
| 23 | Thời gian tiếp nhận | Lỗi | Ngày không tồn tại. Nhập ngày hợp lệ theo dd/mm/yyyy. |
| 29 | Dữ liệu dòng | Cảnh báo | Có nội dung giống bản ghi NK-000123; mở bản ghi để kiểm tra. |

Có thể tải báo cáo lỗi `.xlsx` gồm số dòng, tên cột, giá trị và lý do; xử lý văn bản an toàn như các báo cáo Excel khác.

Nút “Nhập N bản ghi” chỉ bật khi không có lỗi và mọi cảnh báo cần xác nhận đã được người dùng xem/chấp nhận. Không tự nhập những dòng hợp lệ trong file còn lỗi. Bản đầu sửa dữ liệu trong Excel rồi tải lại, không yêu cầu xây một trình sửa bảng trực tuyến.

### 7.4. Bước 4 — Xác nhận và ghi dữ liệu

- Tóm tắt số bản ghi, cảnh báo được chấp nhận và nội dung “Tạo mới, không cập nhật bản ghi cũ”.
- Client gửi danh sách đã chuẩn hóa, số dòng nguồn, phiên bản mẫu, ID danh mục đã nhận diện, tên file, khóa yêu cầu và xác nhận cảnh báo.
- Server kiểm tra lại quyền hiện hành, kiểu dữ liệu, giới hạn, danh mục, cặp nhân sự/phòng ban, mốc thời gian và trùng lặp. Không tin preview là bằng chứng dữ liệu hợp lệ.
- Nếu danh mục đã đổi/xóa hoặc quyền đã thay đổi từ lúc preview, từ chối với thông tin rõ ràng và yêu cầu kiểm tra lại. Không tự ghép danh mục sang ID khác.
- Nếu có cảnh báo mới so với preview, không tự ghi; trả kết quả cập nhật để người dùng xác nhận lại. Xác nhận cũ không áp dụng cho payload đã thay đổi.
- Thực hiện tạo đợt nhập và tất cả dòng trong **một giao dịch database**. Không lặp gọi insert từ trình duyệt và không gọi insert từng lô độc lập từ Edge Function để giả lập tính nguyên khối.
- Nếu một dòng lỗi, không tạo bản ghi nhật ký và không để lại đợt nhập thành công giả. Sequence có thể có khoảng trống sau rollback; mã không cần liên tục tuyệt đối.
- Khi thành công, trả mã đợt nhập, số dòng đã nhập và liên kết mở danh sách theo đợt. Cập nhật lại danh sách và bộ đếm nhật ký.

### 7.5. Trùng lặp và gửi lại yêu cầu

Phân biệt hai tình huống:

| Tình huống | Hành vi |
|---|---|
| Bấm hai lần, retry hoặc timeout sau khi server đã ghi | Dùng cùng khóa yêu cầu; trả kết quả đợt cũ, không tạo lần nữa. |
| Người dùng chủ động nhập file mới có nội dung giống | Cảnh báo trùng; không mặc định xóa/bỏ dòng hoặc kết luận chắc là cùng sự việc. |

Đề xuất phát hiện trùng dựa trên tổ hợp phân loại, mô tả chuẩn hóa, thời gian tiếp nhận và bên tiếp nhận; bổ sung hash toàn payload để phát hiện nhập lại cùng nội dung. Đây là gợi ý kiểm tra, không phải khóa duy nhất nghiệp vụ.

Khóa chống gửi lặp có phạm vi theo người thực hiện và request ID, được bảo vệ bằng unique constraint/khóa giao dịch. Payload hash do server tính theo thứ tự dòng và giá trị chuẩn hóa; cùng request ID nhưng payload khác phải bị từ chối.

Client tạo request ID khi xác nhận một phiên bản preview và giữ lại khi retry. Đổi file hoặc đổi dữ liệu phải có preview và request ID mới. Có thể lưu request ID vào `sessionStorage` để tra cứu kết quả sau reload, không lưu toàn bộ dữ liệu file vào đó.

Khi mất kết nối lúc ghi, giao diện thông báo “Chưa xác định được kết quả”, cho kiểm tra trạng thái bằng request ID. Không tuyên bố thất bại rồi khởi tạo yêu cầu mới ngay. Endpoint tra cứu cũng kiểm tra quyền hiện hành; chỉ người thực hiện hoặc Admin được đọc thông tin kỹ thuật của yêu cầu.

Hai người chủ động nhập cùng nội dung gần đồng thời vẫn là hai yêu cầu độc lập. Bản đầu cảnh báo trùng không bảo đảm ngăn mọi tình huống đồng thời; nếu nghiệp vụ muốn cấm trùng tuyệt đối phải có định danh nguồn duy nhất hoặc quy tắc nghiệp vụ bổ sung.

## 8. Thiết kế database và API dự kiến

### 8.1. Bảng `care_logs`

| Nhóm | Cột và ý nghĩa |
|---|---|
| Định danh | `id uuid`, `number bigint` từ sequence riêng, `code` sinh từ number. |
| Nội dung | `request_type`, `description`, `response_content`, `notes`. |
| Danh mục | `category_id` tham chiếu `categories`; `system_id` tham chiếu `systems` cho Kênh phát sinh lỗi. |
| Tiếp nhận | `receiving_department_id`, `receiving_staff_id`. |
| Phối hợp | `coordinating_department_id`, `coordinating_staff_id` tham chiếu danh mục `departments`/`staff` dùng chung. |
| Tiến độ | `status`, `received_at`, `completed_at`. |
| Theo dõi ghi | `created_at`, `created_by`, `updated_at`, `updated_by`, `version`. |
| Nguồn dữ liệu | `entry_source` = `manual` hoặc `excel_import`; `import_batch_id`, `import_row_number` chỉ có khi import. |
| Tìm kiếm | Cột chuẩn hóa và `tsvector` phù hợp trường tìm kiếm. |

Các ràng buộc bắt buộc khi triển khai:

- Khóa ngoại danh mục dùng `ON DELETE RESTRICT`; danh tính tài khoản có thể `ON DELETE SET NULL` theo chính sách hiện tại.
- Chỉ nhận enum phân loại/trạng thái hợp lệ; giới hạn độ dài và yêu cầu mô tả có nội dung.
- Nhân sự có giá trị thì bộ phận tương ứng không được rỗng; kiểm tra cặp tham chiếu bằng trigger/logic server.
- Trạng thái Đã xử lý yêu cầu `completed_at >= received_at`; trạng thái khác không có `completed_at`.
- Client không sửa mã, số, người tạo, thời gian tạo, nguồn nhập hoặc thông tin đợt nhập sau khi tạo.
- Khi cập nhật, database tăng `version`; API cập nhật/xóa có điều kiện theo version và báo xung đột khi không có dòng khớp.
- `import_batch_id` và `import_row_number` có cùng nhau, duy nhất theo cặp; trường nguồn nhập phải khớp.
- Giới hạn số dòng và payload import được kiểm tra phía server, không chỉ ở trình duyệt.

### 8.2. Bảng thông tin đợt nhập

Đề xuất bảng `care_log_import_batches` gồm: `id`, `imported_by`, `imported_at`, `file_name`, `template_version`, `row_count`, `request_id`, `payload_hash`.

- Chỉ ghi đợt hoàn thành trong cùng transaction với bản ghi. Không cần bảng staging chứa dữ liệu chưa xác nhận ở bản đầu.
- `row_count` là số dòng được nhập ban đầu; khi có bản ghi bị xóa sau này, giao diện phân biệt số nhập ban đầu và số còn tồn tại.
- Cột kỹ thuật request/hash không trả trong truy vấn danh sách thông thường. Dùng grant theo cột hoặc API chỉ trả trường cần thiết; không để truy vấn `select *` làm lộ toàn bộ metadata không cần dùng.
- Client không được insert/update/delete trực tiếp đợt nhập; chỉ luồng import được tạo metadata. Chính sách này cũng bảo vệ khả năng chống gửi lặp.
- Chưa có nút xóa toàn bộ một đợt nhập; việc đó cần thiết kế riêng vì bản ghi có thể đã được chỉnh sửa sau khi nhập.

### 8.3. RPC/API

| API dự kiến | Vai trò | Quyền |
|---|---|---|
| `search_care_logs` | Tìm kiếm, bộ lọc, cursor, cutoff cho export | Đọc nhật ký |
| `care_log_counts` | Đếm nhật ký theo trạng thái | Đọc nhật ký |
| API đọc chi tiết `care_logs` | Đọc toàn bộ một bản ghi | Đọc nhật ký + RLS |
| API tạo/sửa/xóa `care_logs` | CRUD thủ công, kiểm tra version | Ghi nhật ký + RLS |
| `validate_care_log_import` | Kiểm tra chỉ đọc: danh mục, lỗi, cảnh báo trùng | Ghi nhật ký |
| `commit_care_log_import` | Kiểm tra lại và ghi nguyên khối, chống gửi lặp | Ghi nhật ký |
| `get_care_log_import_result` | Tra kết quả theo request ID | Ghi nhật ký; người thực hiện hoặc Admin |
| `admin-users` mở rộng | Cấp/thu hồi quyền nhật ký | Admin |

Tên là dự kiến, cần thống nhất khi triển khai. Ưu tiên RPC PostgreSQL cho giao dịch import nguyên khối, để trình duyệt gọi với JWT hiện tại. Nếu dùng Edge Function làm lớp bao ngoài, vẫn phải gọi một RPC nguyên khối và truyền danh tính theo cơ chế server đã xác thực.

Không sử dụng service-role key ở trình duyệt. Nếu RPC đặc quyền dùng `SECURITY DEFINER`, phải tự kiểm tra guard ngay đầu hàm, khóa `search_path`, giới hạn execute, kiểm tra mọi trường đầu vào và không nhận SQL từ client.

Các hàm validate/commit cần chia sẻ quy tắc kiểm tra ở database để hạn chế lệch nhau; kiểm tra frontend phục vụ phản hồi nhanh, database là nơi quyết định cuối cùng.

### 8.4. Chỉ mục và hiệu năng

- Chỉ mục theo `(received_at desc, id desc)`, `(created_at desc, id desc)`, trạng thái kết hợp thời gian, thời gian hoàn thành, khóa danh mục có nhu cầu lọc và `import_batch_id`.
- GIN cho tìm kiếm đã chuẩn hóa; cân nhắc trigram khi cần tìm chuỗi con, dựa trên đo thực tế.
- Unique index cho request ID theo người nhập và cặp batch/dòng nguồn.
- Không mặc định sao chép toàn bộ chuỗi tối ưu tìm kiếm ticket: đo kế hoạch truy vấn của nhật ký và giữ RLS/guard đúng ngay từ đầu.
- Giới hạn import và mục tiêu thời gian chỉ được công bố chính thức sau thử nghiệm; kết quả benchmark ticket cũ không chứng minh hiệu năng nhật ký.

## 9. Xuất Excel và PDF

### 9.1. Xuất Excel

- Xuất toàn bộ kết quả theo bộ lọc đã xác nhận trong hộp thoại, không chỉ trang đang mở; mặc định hộp thoại giữ bộ lọc hiện tại.
- Có mã nhật ký, đủ trường nghiệp vụ, thông tin người tạo/cập nhật và đợt nhập khi phù hợp. File báo cáo khác file mẫu import.
- Header, ngày giờ và tên trạng thái tiếng Việt; giữ xuống dòng, mã văn bản và ký tự đầu chuỗi. Giá trị giống công thức phải được ghi thành văn bản an toàn.
- Văn bản vượt giới hạn ô được tách sang sheet `Nội dung dài` có mã bản ghi, trường, thứ tự phần; không cắt mất dữ liệu.
- Mỗi lần xuất dùng cutoff tạo bản ghi và cơ chế chống lặp ID khi phân trang. Đây không phải snapshot giao dịch của toàn bộ dữ liệu khi có người sửa/xóa đồng thời.
- Kiểm tra quyền ở mỗi lần lấy dữ liệu; nếu mất quyền giữa chừng, dừng xuất và báo lỗi, không báo file thiếu dữ liệu là thành công.
- Có tiến độ và thông báo lỗi rõ. Tạo workbook trong worker, giải phóng worker/bộ nhớ sau khi hoàn thành hoặc lỗi.
- File báo cáo không được hứa có thể import lại nguyên trạng. Muốn nhập phải dùng mẫu import đúng phiên bản.

### 9.2. Xuất PDF

- Bản đầu xuất một bản ghi từ màn chi tiết, tương tự ticket; không mặc định gộp cả danh sách vào một PDF.
- Khổ A4, logo SHS, font tiếng Việt, header/footer/số trang; tiêu đề “Phiếu theo dõi vấn đề CSKH”.
- Có đầy đủ mô tả, phản hồi, ghi chú, phân loại, kênh, bên tiếp nhận/phối hợp và mốc thời gian; trạng thái rỗng có nhãn phù hợp.
- Nội dung dài tự sang trang, không tràn/cắt chữ. Tên danh mục dài vẫn đọc được.
- Có liên kết tải lại PDF sau khi tạo để xử lý trình duyệt chặn tải tự động; phân biệt lỗi tải module/font với lỗi lấy dữ liệu.
- Chỉ dùng dữ liệu được phép đọc ở thời điểm lấy dữ liệu; không đưa khóa hoặc URL riêng tư không cần thiết vào file.

## 10. Danh sách thay đổi mã nguồn dự kiến

Giữ cấu trúc đang có thay vì áp đặt cấu trúc `features/` trong kế hoạch cũ.

| Vị trí | Thay đổi |
|---|---|
| `src/App.tsx` | Menu, route, kiểm tra truy cập `/care-logs`. |
| `src/lib/types.ts`, `src/lib/auth.tsx` | Bổ sung quyền, tính quyền hiệu lực, cập nhật hồ sơ/cache khi quyền thay đổi. |
| `src/pages/Users.tsx` | Hiển thị và chỉnh quyền nhật ký. |
| `src/pages/CareLogs.tsx` (mới) | Danh sách, tìm kiếm, lọc, điều phối form/chi tiết/import/export. |
| `src/components/CareLogForm.tsx` (mới) | Form nghiệp vụ riêng. |
| `src/components/CareLogDetail.tsx` (mới) | Chi tiết và thao tác. |
| `src/components/CareLogImportDialog.tsx` (mới) | Chọn file, preview, lỗi/cảnh báo, xác nhận và kết quả. |
| `src/lib/care-log-types.ts`, `care-log-api.ts` (mới) | Kiểu dữ liệu, query/RPC và mapping trạng thái. |
| `src/lib/care-log-import.ts` (mới) | Mapping cột, chuẩn hóa dữ liệu, điều phối preview và request ID. |
| `src/workers/care-log-import.worker.ts` (mới) | Đọc Excel và xử lý file ngoài luồng UI. |
| Module mẫu và xuất file nhật ký (mới) | Template version, danh mục, Excel và PDF. Dùng chung tiện ích đã tách khi phù hợp. |
| `src/pages/Catalogs.tsx`, `src/lib/catalog-mutations.ts` | Thông báo ràng buộc tham chiếu nhật ký; dùng lại danh mục hệ thống, phòng ban và nhân sự hiện có. |
| `src/styles.css` | Kiểu hiển thị nhật ký/preview, tái sử dụng token hiện có. |
| `supabase/functions/admin-users/index.ts` | Validate, ghi và trả quyền nhật ký. |
| `supabase/migrations/` | Migration mới cho quyền/schema/RLS/RPC/chỉ mục. |
| `scripts/`, unit tests và kiểm thử database | Kiểm chứng quyền, import nguyên khối, chống lặp, export và hồi quy ticket. |
| `README.md`, `docs/OPERATIONS.md`, `docs/validation/` | Hướng dẫn sử dụng, vận hành, import và bằng chứng nghiệm thu sau khi triển khai. |

Không bổ sung gói mới chỉ vì cần đọc Excel nếu dependency đang có đáp ứng. Khả năng parse an toàn và giới hạn bộ nhớ phải được kiểm tra trước khi chốt thư viện/worker.

## 11. Kế hoạch thực hiện

| Giai đoạn | Công việc | Điều kiện hoàn thành |
|---|---|---|
| 0. Chuẩn bị triển khai | Áp dụng D-01 đến D-05 đã chốt; rà mẫu 13 cột và quyền; lấy file ví dụ đã loại dữ liệu nhạy cảm nếu có | Schema và mẫu v1 nhất quán với các quyết định đã chốt. |
| 1. Dữ liệu và quyền | Migration bổ sung, RLS/guard, quyền trong `admin-users` và UI tài khoản | Kiểm thử trực tiếp API/database chứng minh đúng quyền, JWT cũ và không tự nâng quyền. |
| 2. Nghiệp vụ nhật ký | Danh sách, form, chi tiết, trạng thái, tìm kiếm, lọc và chống ghi đè | CRUD và tìm kiếm hoạt động; ticket/thư viện không nhận dữ liệu nhật ký. |
| 3. Xuất dữ liệu | Excel theo bộ lọc, PDF chi tiết | Mở lại file, đối chiếu nội dung, render PDF kiểm tra trực quan. |
| 4. Mẫu và preview import | Tạo mẫu, parse worker, mapping danh mục, bảng preview và báo lỗi | Chưa ghi database trước xác nhận; lỗi được chỉ đúng dòng/cột. |
| 5. Ghi import | RPC nguyên khối, kiểm tra lại, request ID, tra kết quả và đợt nhập | Không nhập một phần; retry không tạo thêm; mất mạng xử lý đúng. |
| 6. UAT và phát hành | Kiểm thử tổng thể, dữ liệu mẫu thực tế, tài liệu sử dụng và triển khai | Có kết quả nghiệm thu và xử lý các điểm chưa đạt trước khi mở quyền sử dụng. |

Các giai đoạn là thứ tự phụ thuộc, không phải cam kết số ngày. Ước lượng triển khai dựa trên phạm vi đã chốt và kết quả thử nghiệm giới hạn import.

## 12. Tiêu chí nghiệm thu

### 12.1. Nghiệp vụ và tính độc lập

| Mã | Tình huống | Kết quả yêu cầu |
|---|---|---|
| NV-01 | Tạo/sửa/xóa nhật ký | Dữ liệu đúng trường; lỗi giữ nội dung; người tạo/cập nhật do server ghi. |
| NV-02 | Chuyển trạng thái, nhập lịch sử, mở lại | Giữ mốc lịch sử hợp lệ; chặn hoàn thành trước tiếp nhận; mở lại xóa hoàn thành. |
| NV-03 | Hai người cùng chỉnh sửa/xóa | Không ghi đè im lặng; người dùng nhận thông báo xung đột phiên bản. |
| NV-04 | Tạo nhật ký Đã xử lý | Không xuất hiện trong ticket, thư viện, bộ đếm hoặc export ticket. |
| NV-05 | Nhân sự tiếp nhận khác người nhập | Cả hai thông tin được giữ riêng và hiển thị đúng. |
| NV-06 | Danh mục có nhật ký tham chiếu | Không xóa được; thông báo có ý nghĩa. |
| NV-07 | Nhân sự chuyển phòng | Bản ghi cũ còn đọc/sửa nội dung được; cặp mới/import được kiểm tra. |
| NV-08 | Tìm kiếm không dấu, lọc kết hợp, phân trang | Kết quả đúng; không trùng/mất dòng trên tập dữ liệu không đổi. |
| NV-09 | Chọn Kênh phát sinh lỗi | Dùng cùng ID, tên và thứ tự của `systems`; form, bộ lọc, mẫu và import thống nhất. |
| NV-10 | Chọn bộ phận/nhân sự phối hợp | Dùng danh mục chung, kiểm tra đúng cặp; không tự tạo ticket hoặc bản ghi thư viện. |

### 12.2. Quyền và hồi quy

| Mã | Tình huống | Kết quả yêu cầu |
|---|---|---|
| Q-01 | Chưa đăng nhập hoặc bị khóa | Không đọc/ghi nhật ký hoặc metadata import. |
| Q-02 | User không có quyền mở URL/gọi API trực tiếp | Không lấy được danh sách, chi tiết, số lượng hoặc export. |
| Q-03 | Chỉ xem gọi insert/update/delete/validate/commit | Đọc/xuất được; mọi luồng ghi và import bị chặn. |
| Q-04 | User có quyền ghi | CRUD, import được; không tự nâng quyền tài khoản hoặc tạo danh mục ngoài quyền. |
| Q-05 | Admin cấp/thu hồi quyền | Giá trị đúng sau lưu; quyền database cập nhật với JWT cũ. |
| Q-06 | Thu hồi quyền khi đang preview/export | Commit bị chặn; lần lấy dữ liệu tiếp theo bị chặn; UI xóa cache khi nhận thay đổi. |
| Q-07 | Đổi role Admin/User/Viewer | Không có tổ hợp sai hoặc vô tình kế thừa quyền Admin. |
| Q-08 | Gọi RPC với payload giả mạo quyền/người tạo | Server từ chối hoặc ghi theo danh tính thực, không tin payload. |
| Q-09 | Luồng ticket hiện tại và bảo vệ Admin cuối cùng | Đăng nhập, ticket, danh mục, ảnh, export và quản lý tài khoản vẫn đúng. |
| Q-10 | Cấp quyền cho Viewer hoặc xóa bằng User có quyền ghi | Viewer không nhận được quyền ghi kể cả gọi API trực tiếp; User có quyền Chỉnh sửa được xóa nhật ký sau xác nhận và kiểm tra version. |

### 12.3. Import

| Mã | Tình huống | Kết quả yêu cầu |
|---|---|---|
| I-01 | Tải mẫu mới | Tên cột đúng phiên bản, có hướng dẫn/danh mục, không có dòng ví dụ bị nhập nhầm. |
| I-02 | Đổi thứ tự cột; header có khoảng trắng/xuống dòng | Ánh xạ đúng tên chuẩn, không lệch dữ liệu sang cột khác. |
| I-03 | Thiếu/trùng/sai cột, phiên bản sai | Chặn và nêu tên cột/phiên bản cần sửa. |
| I-04 | Danh mục thiếu, tên trùng, sai bộ phận | Báo đúng dòng/cột; không tự tạo/đoán danh mục. |
| I-05 | Excel date, chuỗi ngày, hệ 1900/1904, máy khác múi giờ | Giá trị ngày giờ đúng và nhất quán theo giờ Việt Nam. |
| I-06 | Ngày không hợp lệ, hoàn thành thiếu/sớm, trạng thái sai | Không được commit; lỗi cụ thể theo dòng. |
| I-07 | Công thức, ô gộp, file sai định dạng/quá giới hạn | Báo lỗi an toàn; không treo UI hoặc thực thi nội dung file. |
| I-08 | Dòng trống, dòng ẩn, sheet khác | Số dòng và phạm vi nhập được giải thích chính xác. |
| I-09 | Có cả dòng đúng và sai | Không ghi dòng nào trước khi sửa hết lỗi. |
| I-10 | Preview rồi hủy/đổi file/đóng dialog | Không tạo nhật ký/đợt nhập; tài nguyên worker được giải phóng. |
| I-11 | File hợp lệ, người dùng xác nhận | Toàn bộ dòng được nhập một lần, giữ dữ liệu nghiệp vụ và số dòng nguồn. |
| I-12 | Cố ý làm một dòng lỗi ở bước database | Toàn bộ giao dịch rollback, không có dữ liệu một phần. |
| I-13 | Danh mục/quyền thay đổi sau preview | Kiểm tra lại và chặn phù hợp; không lưu bằng dữ liệu xác nhận cũ. |
| I-14 | Retry, bấm lặp, hai request cùng khóa đồng thời | Có một đợt và một bộ bản ghi duy nhất. |
| I-15 | Cùng request ID nhưng payload khác | Bị từ chối, không làm thay đổi đợt cũ. |
| I-16 | Timeout sau khi giao dịch đã thành công | Tra cứu/retry cùng request ID trả kết quả cũ, không tạo lại. |
| I-17 | Trùng trong file hoặc với database | Hiển thị cảnh báo/bản ghi liên quan; không tự bỏ dòng. |
| I-18 | Payload sửa bằng công cụ ngoài UI | Server vẫn áp dụng cùng quy tắc và giới hạn; không giả mạo nguồn/audit. |

### 12.4. Xuất file, giao diện và hiệu năng

- Excel giữ đầy đủ tiếng Việt, xuống dòng, toàn bộ kết quả lọc và nội dung dài; không thực thi công thức từ nội dung người dùng.
- PDF được render kiểm tra bản ngắn, nhiều trang, tên dài, phản hồi/ghi chú dài và trạng thái chưa hoàn thành; không thiếu/tràn chữ.
- Import cỡ tối đa trên máy và cấu hình staging mục tiêu vẫn cho UI phản hồi và hủy; ghi lại thời gian parse, preview, validate, commit và bộ nhớ quan sát được.
- Đo tìm kiếm với dữ liệu tổng hợp ở quy mô sử dụng dự kiến và tải đồng thời; ghi rõ cấu hình, số mẫu, p95 và lỗi. Chưa đưa ra SLA khi chưa có phép đo.
- Kiểm tra sáng/tối, bàn phím, responsive và zoom 125%/150%; nút xác nhận/lỗi vẫn nhìn thấy.
- Unit tests tập trung vào mapping, ngày giờ, dữ liệu lỗi, quyền và retry; kiểm thử database tập trung vào RLS, transaction, concurrency và ràng buộc. Không chỉ kiểm tra ẩn/hiện nút.
- Chạy `npm test`, `npm run build` và kiểm tra release phù hợp. Bộ kiểm thử database/import có tạo dữ liệu chỉ chạy trên staging, có danh sách fixture và cleanup xác định.

## 13. Triển khai và vận hành

### 13.1. Trước phát hành

1. Đối chiếu schema, quyền và mẫu với các quyết định đã chốt tại mục 15; kiểm chứng các giới hạn kỹ thuật còn là đề xuất.
2. Rà schema hiện hành và số migration kế tiếp trước khi viết migration mới.
3. Có backup phù hợp và kiểm thử migration trên staging.
4. Triển khai schema/quyền/RPC theo cách tương thích frontend cũ; tài khoản không phải Admin mặc định chưa có quyền nhật ký.
5. Triển khai phiên bản `admin-users` hỗ trợ quyền mới, sau đó frontend.
6. Kiểm chứng quyền bằng tài khoản Admin, User không quyền, User đọc/ghi và Viewer; kiểm tra trực tiếp API.
7. UAT nhập một file mẫu nhỏ, kiểm tra preview và đối chiếu bản ghi, Excel, PDF.
8. Admin cấp quyền cho nhóm sử dụng sau khi nghiệm thu, hướng dẫn tải mẫu hiện hành.

Không chạy bootstrap Admin, benchmark tạo lượng lớn dữ liệu hoặc bộ test ghi dữ liệu lên production chỉ để xác nhận deploy frontend.

### 13.2. Theo dõi vận hành

- Theo dõi số đợt nhập thành công, số dòng, thời gian xử lý và mã lỗi kỹ thuật; không ghi toàn bộ nội dung vấn đề vào log kỹ thuật.
- Giao diện hỗ trợ mở danh sách theo đợt nhập để kiểm tra sau nhập.
- Khi đổi danh mục hoặc phiên bản mẫu, thông báo tải mẫu mới; server vẫn kiểm tra phiên bản/danh mục hiện hành.
- Lưu tài liệu hướng dẫn xử lý tên không khớp, ngày giờ sai, trùng dữ liệu và chưa rõ kết quả sau mất mạng.
- Chính sách lưu metadata đợt nhập, bản ghi và backup theo chính sách dữ liệu của đơn vị; không tự đặt lịch xóa dữ liệu nghiệp vụ.

### 13.3. Khôi phục khi có sự cố

- Có thể tạm ẩn chức năng import ở frontend để giảm thao tác, nhưng chặn quyền ghi thực tế phải thực hiện phía server nếu cần dừng nhập.
- Nếu lỗi frontend, quay lại bản trước trong khi giữ schema bổ sung và dữ liệu đã nhập; không rollback bằng cách drop bảng có dữ liệu.
- Nếu lỗi RPC, sửa bằng migration mới và kiểm tra chống gửi lặp trước khi cho retry.
- Không xóa cả đợt nhập để “nhập lại” khi chưa kiểm tra các dòng đã được người dùng chỉnh sửa sau nhập.
- Cập nhật tài liệu vận hành và báo cáo nghiệm thu bằng kết quả thật; tài liệu này không thay thế bằng chứng kiểm thử.

## 14. Rủi ro và biện pháp xử lý

| Rủi ro | Biện pháp trong thiết kế |
|---|---|
| Triển khai nhầm Kênh phát sinh lỗi thành danh mục kênh tiếp nhận riêng | Dùng `system_id` tham chiếu `systems` theo D-01 đã chốt; kiểm tra cùng nguồn dữ liệu trên form, filter và import. |
| Ghép nhầm nhân sự trùng tên | Ghép theo tên + bộ phận; nhiều kết quả thì báo lỗi. |
| Dữ liệu lịch sử bị thay giờ hiện tại | Lưu mốc nghiệp vụ riêng, validate rõ, trigger nhật ký giữ giờ nhập. |
| Quyền Viewer/tài khoản ngoài CSKH đọc nhật ký ngoài ý muốn | Quyền riêng mặc định none, RLS và guard ở mọi API. |
| File import ghi một phần hoặc lặp do mạng | Một transaction, request ID, payload hash và endpoint tra kết quả. |
| Preview đã cũ so với danh mục/quyền | Server kiểm tra lại ngay lúc commit; thay đổi cần preview/xác nhận lại. |
| File nén nhỏ nhưng gây quá tải bộ nhớ | Giới hạn giải nén, số dòng/payload, worker và kiểm thử cỡ giới hạn. |
| Nhật ký lọt vào thư viện/tìm kiếm ticket | Bảng/RPC/query key riêng; kiểm thử hồi quy nguồn dữ liệu. |
| Xuất file thiếu nội dung hoặc lệch ngày | Kiểm tra mở lại Excel, render PDF và test múi giờ/nội dung dài. |
| Người dùng tưởng báo cáo Excel là mẫu import | Tên file, sheet và hướng dẫn phân biệt rõ; chỉ nhận đúng mẫu. |

## 15. Các quyết định nghiệp vụ đã chốt

Chủ dự án đã xác nhận năm nội dung dưới đây; không cần hỏi lại các quyết định này khi triển khai trong phạm vi đã xác định.

| Mã | Nội dung | Quyết định đã chốt | Tác động |
|---|---|---|---|
| D-01 | Kênh phát sinh lỗi | Chính là danh sách Hệ thống liên quan đang có; lưu `system_id` tham chiếu `systems`. Không tạo danh mục kênh riêng. | Schema, tên cột mẫu, filter và nguồn dropdown. |
| D-02 | Bộ phận/nhân sự phối hợp | Dùng chung `departments` và `staff` hiện có; giữ hai trường tùy chọn trong nhật ký. | Form, schema, mẫu Excel và kiểm tra cặp nhân sự/phòng ban. |
| D-03 | Quyền của Viewer | Theo đề xuất: chỉ được `none` hoặc `read`, không được `write`. | Constraint, guard, UI đổi role. |
| D-04 | Phạm vi quyền Chỉnh sửa | Bao gồm xóa bản ghi, có xác nhận và kiểm tra version; chưa hỗ trợ xóa cả đợt nhập. | Ma trận quyền, UI và chính sách DELETE. |
| D-05 | Trường bắt buộc | Theo đề xuất: phân loại yêu cầu, mô tả vấn đề, bộ phận tiếp nhận, trạng thái xử lý, thời gian tiếp nhận; thêm thời gian hoàn thành nếu Đã xử lý. Các trường còn lại được để trống, nhưng giá trị đã nhập phải hợp lệ. | Form, mẫu Excel, validation frontend và database. |

Phạm vi đọc chung toàn kho của người có quyền nhật ký tiếp tục là mô hình đề xuất tại mục 4, không bổ sung giới hạn theo người tạo/phòng ban trong bản đầu. Xác nhận D-05 ở trên là xác nhận trường bắt buộc, không phải yêu cầu thêm phân quyền theo từng dòng dữ liệu.

Các mặc định kỹ thuật cần kiểm chứng khi triển khai: giới hạn import, phương pháp kiểm tra ZIP trước khi parse, thời gian transaction, mức tải tìm kiếm và cách xử lý cảnh báo trùng. Nếu phép đo không đạt, cập nhật giới hạn và tài liệu; không tự đổi từ giao dịch nguyên khối sang nhập từng phần mà không thay đổi đặc tả.

## 16. Tài liệu liên quan

- [README dự án](../README.md)
- [Kế hoạch nghiệp vụ ticket hiện tại](../PLAN.md)
- [Thiết kế giao diện](../DESIGN.md)
- [Hướng dẫn vận hành](OPERATIONS.md)
- [Hướng dẫn triển khai Vercel](DEPLOY-VERCEL.md)
- [Báo cáo kiểm thử hiện có](validation/README.md)

Phạm vi của lần soạn tài liệu này: khảo sát mã nguồn và ghi đặc tả. Chưa tạo bảng, sửa phân quyền, triển khai UI/import hoặc chạy kiểm thử chức năng mới.
