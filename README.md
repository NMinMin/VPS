# 🛡️ CloudPanel Enterprise Stack - Full-Stack DevOps & React Architecture

Ứng dụng web Full-stack ReactJS kết hợp hệ sinh thái **DevOps, Security, CI/CD, Multi-Tier Caching, MariaDB & Redis, Uptime Kuma Monitoring, và Encrypted Backup** vận hành hoàn hảo trên CloudPanel VPS.

---

## 📌 1. Danh sách 13 Hạng mục Kỹ thuật Đã Triển Khai Hoàn Tất

| STT | Yêu cầu kỹ thuật | Hiện trạng & Vị trí |
| :---: | :--- | :--- |
| **1** | **MariaDB + Redis DB thứ 2** | ✅ **Hoạt động**: MariaDB `127.0.0.1:3306` (DB `Phuoc-NodeJS`) + Redis `127.0.0.1:6379` liên kết qua `server/db.js` và `server/cache.js`. |
| **2** | **Bảo mật & Tối ưu DB** | ✅ **Hoạt động**: Bảng `access_logs` cấu hình `ROW_FORMAT=DYNAMIC`, tham số hóa truy vấn chống SQL Injection, lưu credentials trong `.env`. |
| **3** | **Đánh chỉ mục (Index) cơ bản** | ✅ **Hoạt động**: Đã seed 10,000 bản ghi mẫu và đánh index trên cột `email` (`idx_email`) và composite `(action, created_at)`. |
| **4** | **Giải trình EXPLAIN Đối chiếu** | ✅ **Hoạt động**: Công cụ EXPLAIN trực quan trong tab **DB & Giải Trình EXPLAIN**, so sánh Có Index (1 dòng quét) vs Không Index (10,012 dòng quét). |
| **5** | **SSL & Cipher Suites cao nhất** | ✅ **Đã chuẩn bị**: File cấu hình Vhost `scripts/nginx-ssl-hardening.conf` (TLSv1.2, TLSv1.3, HSTS Preload, ChaCha20/AES-GCM). |
| **6** | **Tường lửa UFW (80, 443, 22, 8443)** | ✅ **Sẵn sàng**: Script `scripts/setup-ufw.sh` chỉ mở cổng 22, 80, 443, 8443; chặn triệt để các cổng DB (3306, 6379, 3000) từ internet. |
| **7** | **Chặn Brute-force & Rate Limit** | ✅ **Hoạt động**: `server/rateLimiter.js` kết nối Redis lưu lượng truy cập IP, chặn flood request (100 req/phút) và chống Brute-force (25 req/phút). |
| **8** | **GitHub Webhook CI/CD** | ✅ **Hoạt động**: Endpoint `POST /api/webhook/github` xác thực chữ ký HMAC SHA-256 an toàn từ GitHub Secret. |
| **9** | **Auto-deploy & Auto-rollback** | ✅ **Hoạt động**: Script `scripts/deploy-with-rollback.sh` tự động snapshot bản build, pull code, build Vite, reload PM2; tự động khôi phục bản cũ nếu build lỗi. |
| **10** | **Uptime Kuma Giám sát VPS** | ✅ **Hoạt động**: Uptime Kuma đang chạy trực tiếp trên port `3001` quản lý bởi PM2. |
| **11** | **Cảnh báo tức thời (Alert Daemon)** | ✅ **Hoạt động**: Daemon `server/alert-monitor.js` chạy ngầm kiểm tra CPU, RAM, Site; tự động bắn cảnh báo qua Telegram khi CPU/RAM > 85% hoặc web sập. |
| **12** | **Backup CSDL nén tự động** | ✅ **Hoạt động**: Script `scripts/backup-db.sh` tự động dump MariaDB, nén Gzip level 9, lưu tại `backups/`. Đã lập lịch Cron lúc 02:00 AM hàng ngày. |
| **13** | **Mã hóa AES-256 & Dọn dẹp 7 ngày** | ✅ **Hoạt động**: Mã hóa OpenSSL AES-256-CBC với mật khẩu bí mật; tự động xóa các file backup cũ hơn 7 ngày (`find -mtime +7 -delete`). |

---

## 🚀 2. Hướng Dẫn Vận Hành Nhanh (Cheatsheet)

### 1. Truy cập Website Trực tiếp:
👉 **[https://phuoc-nodejs.sixforce.io.vn/](https://phuoc-nodejs.sixforce.io.vn/)**
- Chuyển đổi giữa các tab: **Multi-Tier Cache**, **DB & Giải Trình EXPLAIN**, **Tường Lửa UFW & SSL**, **GitHub Webhook CI/CD**, **Backup AES-256 & Alert Monitor**.

### 2. Truy cập Uptime Kuma:
Uptime Kuma đang lắng nghe tại `http://127.0.0.1:3001` (hoặc tạo một subdomain phụ `uptime.sixforce.io.vn` trên CloudPanel trỏ reverse proxy về port 3001 để truy cập qua web).

### 3. Kích hoạt Tường lửa UFW:
Chạy lệnh sau trên terminal SSH của VPS với quyền root:
```bash
sudo bash scripts/setup-ufw.sh
```

### 4. Sao lưu & Khôi phục Cơ sở dữ liệu:
```bash
# Chạy sao lưu mã hóa AES-256 ngay lập tức:
bash scripts/backup-db.sh

# Giải mã và khôi phục CSDL từ file backup mã hóa:
bash scripts/restore-backup.sh backups/Phuoc-NodeJS_YYYYMMDD_HHMMSS.sql.gz.enc
```

### 5. Cấu hình GitHub Webhook:
- Vào Repository GitHub của bạn: **Settings** &gt; **Webhooks** &gt; **Add webhook**.
- **Payload URL**: `https://phuoc-nodejs.sixforce.io.vn/api/webhook/github`
- **Content type**: `application/json`
- **Secret**: `phuoc_super_secure_webhook_secret_key_2026` (hoặc chuỗi bạn đổi trong file `.env`)
- **Which events**: Chọn `Just the push event`.

### 6. Cấu hình Nhận Cảnh Báo Telegram:
Mở file `.env` và điền:
```env
ALERT_TELEGRAM_BOT_TOKEN=your_bot_token_here
ALERT_TELEGRAM_CHAT_ID=your_chat_id_here
```
Hệ thống sẽ lập tức gửi tin nhắn cảnh báo mỗi khi CPU > 85%, RAM > 85% hoặc website gặp sự cố!
