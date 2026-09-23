# 🚀 CloudPanel ReactJS - Multi-Tier Caching & Process Management Architecture

Ứng dụng web Full-stack ReactJS tối ưu hiệu năng cao, tích hợp quản lý tiến trình chuyên nghiệp trên **CloudPanel**, cơ chế đệm dữ liệu đa tầng (**Multi-tier Caching**) với Redis và Memory LRU, cùng giải pháp tự động khởi động lại (**Auto-Start**) khi VPS Reboot.

---

## 📌 1. Tổng quan Kiến trúc

- **Tên miền & Vhost CloudPanel**: `phuoc-nodejs.sixforce.io.vn`
- **Reverse Proxy**: Nginx tự động proxy HTTPS 443 về cổng nội bộ `127.0.0.1:3000`.
- **Process Manager**: PM2 Cluster Mode (2 Workers tương ứng 2 CPU Cores), tự động load balancing và zero-downtime rolling reload.
- **Tầng Caching Nâng cao**:
  - **L1 (RAM)**: In-Memory LRU Cache độ trễ siêu thấp (< 0.2ms) lưu trữ hot data.
  - **L2 (Redis)**: Kết nối Redis Server local `127.0.0.1:6379` lưu trữ và chia sẻ cache giữa các worker, không mất cache khi worker restart.
  - **L3 (HTTP)**: Tối ưu `ETag`, `Cache-Control` (`stale-while-revalidate`), nén Gzip giảm kích thước payload.
  - **Static Asset Cache**: Cache vĩnh viễn 1 năm (`max-age=31536000, immutable`) cho các bundle có hash (JS/CSS/Fonts).

---

## 🛠️ 2. Lệnh Quản trị Nhanh (Cheat Sheet)

### Build ứng dụng:
```bash
npm run build
```

### Quản trị tiến trình qua PM2:
```bash
# Xem trạng thái các worker PM2
npm run pm2:status

# Tải lại zero-downtime (khi có code mới hoặc cấu hình mới)
npm run pm2:reload

# Khởi động lại toàn bộ
npm run pm2:restart

# Xem log thời gian thực
pm2 logs phuoc-nodejs

# Giám sát trực quan realtime CPU/RAM
pm2 monit
```

---

## 🔄 3. Kịch bản Tự động Khởi động (Auto-Start on VPS Reboot)

Hệ thống đã được trang bị sẵn script tự động hóa:
```bash
bash setup-autostart.sh
```

### Cách thức hoạt động:
1. **PM2 Dump**: Lưu snapshot trạng thái các tiến trình đang chạy (`pm2 save`).
2. **Crontab `@reboot`**: Tự động phục hồi (`pm2 resurrect`) ngay khi hệ thống Linux khởi động, đảm bảo website luôn online kể cả khi reboot VPS bất ngờ.
3. **Systemd User Unit**: Đăng ký dịch vụ `phuoc-nodejs.service` vào systemd user session để tự động giám sát và phục hồi.

---

## 🧪 4. Kiểm tra Caching & APIs

| Endpoint | Phương thức | Mô tả |
| :--- | :--- | :--- |
| `/api/cache/benchmark?type=analytics` | `GET` | Mô phỏng truy vấn dữ liệu nặng. Lần 1: MISS (~200ms), Lần 2+: HIT L1/L2 (< 1ms). |
| `/api/cache/stats` | `GET` | Thống kê số lượng Request, L1 hits, L2 hits, Misses, Hit Rate, RAM Redis. |
| `/api/cache/keys` | `GET` | Lấy danh sách các key đang lưu trong cache. |
| `/api/cache/purge` | `POST` | Xóa key (`{ "key": "tên_key" }`) hoặc xóa sạch (`{ "key": "all" }`). |
| `/api/system/health` | `GET` | Kiểm tra RAM, CPU, Uptime, Node.js version và tiến trình PM2. |
