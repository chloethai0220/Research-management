# Cổng nộp minh chứng Nghiên cứu khoa học

Ứng dụng web nhỏ (Node.js + Express) để học viên nộp minh chứng NCKH và giảng viên theo dõi, phân loại, phản hồi.

## Các trang

| Đường dẫn | Dành cho | Chức năng |
|---|---|---|
| `/` | Học viên | Điền thông tin, chọn loại minh chứng, đính kèm file/link, nhận **mã nộp** |
| `/tra-cuu` | Học viên | Nhập MSHV + email để xem trạng thái và phản hồi của giảng viên |
| `/admin` | Giảng viên | Đăng nhập bằng mật khẩu; lọc, phân loại, chấm, phản hồi, xuất CSV, cấu hình |

**Trang quản lý gồm:**
- Thống kê theo trạng thái: Mới nộp · Đang xem · Đạt · Cần bổ sung · Không đạt (bấm để lọc)
- Tìm kiếm, lọc theo loại minh chứng, lớp/khóa; xem file ngay trên trình duyệt
- Phân loại lại, gắn nhãn (VD: Scopus, ACI), điểm quy đổi, phản hồi mẫu bấm-chèn, ghi chú riêng
- Tab **Theo học viên**: bảng tổng hợp số minh chứng từng trạng thái và tổng điểm các minh chứng Đạt
- Tab **Cài đặt**: tiêu đề, hướng dẫn, hạn nộp, mở/đóng cổng, danh mục minh chứng yêu cầu
- Xuất toàn bộ ra CSV (mở bằng Excel, giữ tiếng Việt)

## Chạy thử trên máy

```bash
npm install
ADMIN_PASSWORD=matkhaucuaco npm start
# mở http://localhost:3000 và http://localhost:3000/admin
```

## Triển khai lên Render

1. Đẩy thư mục này lên một repo GitHub.
2. Trên Render chọn **New → Blueprint**, trỏ tới repo — Render đọc `render.yaml` và tạo sẵn web service + ổ đĩa.
3. Khi được hỏi, nhập `ADMIN_PASSWORD` (mật khẩu trang quản lý).
4. Sau khi deploy xong: gửi học viên link gốc, cô vào `/admin`.

### Lưu ý quan trọng về dữ liệu
- Dữ liệu (`db.json`) và file học viên nộp được lưu trong `DATA_DIR`. `render.yaml` gắn **Persistent Disk 5 GB** tại `/var/data` — cần gói **Starter** (khoảng 7 USD/tháng + ~0,25 USD/GB đĩa).
- Nếu dùng gói **Free**: Render không hỗ trợ ổ đĩa, **mọi file và dữ liệu sẽ mất** mỗi lần service ngủ/khởi động lại — chỉ dùng để chạy thử. Khi đó xóa khối `disk:` và đổi `plan: free` trong `render.yaml`.
- Nên **Xuất CSV** định kỳ để lưu bản sao.

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `ADMIN_PASSWORD` | `doimatkhau` | Mật khẩu trang `/admin` — **bắt buộc đổi** |
| `DATA_DIR` | `./data` | Nơi lưu db.json và thư mục uploads |
| `MAX_FILE_MB` | `20` | Dung lượng tối đa mỗi file |
| `SESSION_SECRET` | tự sinh | Khóa ký cookie đăng nhập |

Định dạng file chấp nhận: pdf, doc(x), xls(x), ppt(x), jpg, png, zip, rar — tối đa 10 file/lần nộp.
