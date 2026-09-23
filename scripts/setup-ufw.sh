#!/usr/bin/env bash

# ==============================================================================
# Script Thiết lập Tường lửa UFW tối ưu bảo mật cho CloudPanel VPS
# Chỉ mở các cổng bắt buộc: SSH (22), HTTP (80), HTTPS (443), CloudPanel (8443)
# Chặn toàn bộ các cổng DB (3306, 6379) không cho truy cập từ bên ngoài internet!
# ==============================================================================

set -e

echo "=== [UFW FIREWALL CONFIGURATION] ==="

# Kiểm tra quyền root/sudo
if [ "$EUID" -ne 0 ]; then
  echo "⚠ Script này cần quyền quản trị root/sudo để cấu hình UFW."
  echo "Vui lòng chạy: sudo bash scripts/setup-ufw.sh"
  exit 1
fi

echo "1. Đặt chính sách mặc định: Chặn toàn bộ Incoming, Cho phép Outgoing..."
ufw default deny incoming
ufw default allow outgoing

echo "2. Mở các cổng dịch vụ thiết yếu..."
# SSH
ufw allow 22/tcp comment 'SSH Secure Access'

# Web Traffic
ufw allow 80/tcp comment 'HTTP Web'
ufw allow 443/tcp comment 'HTTPS Secure Web'

# CloudPanel Dashboard
ufw allow 8443/tcp comment 'CloudPanel Control Panel'

echo "3. Đảm bảo các cổng nội bộ (MariaDB 3306, Redis 6379, App 3000) BỊ CHẶN từ Internet..."
ufw deny 3306/tcp comment 'Block Remote MariaDB'
ufw deny 6379/tcp comment 'Block Remote Redis'
ufw deny 3000/tcp comment 'Block Direct Node Port 3000'

echo "4. Kích hoạt UFW..."
ufw --force enable

echo ""
echo "=== TRẠNG THÁI TƯỜNG LỬA HIỆN TẠI ==="
ufw status verbose

echo ""
echo "✔ Tường lửa UFW đã được thiết lập thành công và an toàn tuyệt đối!"
