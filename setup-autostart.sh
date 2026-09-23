#!/usr/bin/env bash

# ==============================================================================
# Script Cấu hình Tự động Khởi động (Auto-Start) trên VPS CloudPanel
# ==============================================================================

set -e

# Đảm bảo PATH chứa Node.js và PM2
export PATH="/home/phuocadmin/nodejs/bin:$PATH"

APP_DIR="/home/io-phuoc-nodejs-sixforce/htdocs"
cd "$APP_DIR"

echo "=========================================================="
echo " [1/5] Kiểm tra Môi trường Node.js và PM2..."
echo "=========================================================="
node -v
pm2 -v

# Tạo thư mục logs
mkdir -p "$APP_DIR/logs"

echo ""
echo "=========================================================="
echo " [2/5] Khởi chạy / Tải lại ứng dụng qua PM2..."
echo "=========================================================="
pm2 delete phuoc-nodejs >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs

echo ""
echo "=========================================================="
echo " [3/5] Lưu danh sách tiến trình PM2 (pm2 save)..."
echo "=========================================================="
pm2 save

echo ""
echo "=========================================================="
echo " [4/5] Cấu hình Auto-Start khi VPS Reboot..."
echo "=========================================================="

# Thiết lập Crontab @reboot (Hoạt động độc lập, không yêu cầu mật khẩu root/sudo)
CRON_CMD="@reboot export PATH=/home/phuocadmin/nodejs/bin:\$PATH && cd $APP_DIR && pm2 resurrect >> $APP_DIR/logs/reboot.log 2>&1"

# Kiểm tra nếu chưa có trong crontab thì thêm vào
(crontab -l 2>/dev/null | grep -F "pm2 resurrect") >/dev/null 2>&1 || (
  (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
  echo "✔ Đã thêm tác vụ @reboot tự động phục hồi tiến trình vào Crontab!"
)

# Cấu hình Systemd User Service (Nếu có systemd user session)
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_USER_DIR"

cat <<EOF > "$SYSTEMD_USER_DIR/phuoc-nodejs.service"
[Unit]
Description=CloudPanel Node.js React App (phuoc-nodejs)
After=network.target

[Service]
Type=forking
Environment=PATH=/home/phuocadmin/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WorkingDirectory=$APP_DIR
ExecStart=/home/phuocadmin/nodejs/bin/pm2 resurrect
ExecReload=/home/phuocadmin/nodejs/bin/pm2 reload phuoc-nodejs
ExecStop=/home/phuocadmin/nodejs/bin/pm2 stop phuoc-nodejs
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload >/dev/null 2>&1 || true
systemctl --user enable phuoc-nodejs.service >/dev/null 2>&1 || true
echo "✔ Đã đăng ký dịch vụ systemd user: phuoc-nodejs.service"

echo ""
echo "=========================================================="
echo " [5/5] Hoàn tất & Kiểm tra Trạng thái PM2!"
echo "=========================================================="
pm2 status

echo ""
echo "🎉 CHÚC MỪNG! Ứng dụng đã sẵn sàng và được bảo vệ bởi Auto-Start!"
echo "Khi VPS reboot, cả Cron @reboot và PM2 Resurrect sẽ tự động đưa ứng dụng hoạt động trở lại."
