#!/usr/bin/env bash

# ==============================================================================
# Script Tự Động Triển Khai (CI/CD) & Tự Động Rollback khi Gặp Lỗi
# Được kích hoạt tự động qua GitHub Webhook hoặc chạy thủ công
# ==============================================================================

set -eo pipefail

export PATH="/home/phuocadmin/nodejs/bin:$PATH"
APP_DIR="/home/io-phuoc-nodejs-sixforce/htdocs"
BACKUP_DIR="$APP_DIR/.deploy_backup"
LOG_FILE="$APP_DIR/logs/deploy.log"

mkdir -p "$BACKUP_DIR"
mkdir -p "$APP_DIR/logs"

cd "$APP_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🚀 === BẮT ĐẦU QUY TRÌNH DEPLOY TỰ ĐỘNG ==="

# 1. Tạo bản sao lưu dự phòng (Snapshot Backup)
log "📦 [1/5] Sao lưu bản build hiện tại để sẵn sàng rollback nếu gặp sự cố..."
if [ -d "$APP_DIR/dist" ]; then
  rm -rf "$BACKUP_DIR/dist_prev"
  cp -r "$APP_DIR/dist" "$BACKUP_DIR/dist_prev"
fi

CURRENT_GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "initial")
echo "$CURRENT_GIT_COMMIT" > "$BACKUP_DIR/commit_prev.txt"

# Hàm Rollback tự động
rollback() {
  log "❌ [CẢNH BÁO] Phát hiện lỗi trong quá trình build/test! Bắt đầu Rollback về phiên bản ổn định..."
  
  if [ -d "$BACKUP_DIR/dist_prev" ]; then
    log "⏪ Đang khôi phục lại thư mục dist/ phiên bản trước..."
    rm -rf "$APP_DIR/dist"
    cp -r "$BACKUP_DIR/dist_prev" "$APP_DIR/dist"
  fi

  if [ -f "$BACKUP_DIR/commit_prev.txt" ]; then
    PREV_COMMIT=$(cat "$BACKUP_DIR/commit_prev.txt")
    if [ "$PREV_COMMIT" != "initial" ]; then
      log "⏪ Revert Git về commit: $PREV_COMMIT"
      git reset --hard "$PREV_COMMIT" || true
    fi
  fi

  log "🔄 Reload PM2 để tiếp tục phục vụ bản cũ an toàn..."
  pm2 reload phuoc-nodejs || pm2 restart phuoc-nodejs

  log "✔ ROLLBACK HOÀN TẤT! Ứng dụng vẫn an toàn, không bị gián đoạn (Zero Downtime)."
  exit 1
}

# Đăng ký bẫy lỗi (Trap Error -> Trigger Rollback)
trap rollback ERR

# 2. Kéo mã nguồn mới nhất từ GitHub
log "📥 [2/5] Cập nhật mã nguồn từ GitHub..."
if [ -d "$APP_DIR/.git" ]; then
  git fetch origin || true
  git merge origin/main --ff-only || git pull origin main || true
else
  log "⚠ Thư mục chưa liên kết remote git repo. Bỏ qua bước git pull."
fi

# 3. Cập nhật dependencies
log "📦 [3/5] Cài đặt dependencies mới..."
npm install --no-audit

# 4. Biên dịch và Build ứng dụng React
log "🔨 [4/5] Build React Production Bundle qua Vite..."
npm run build

# 5. Kiểm tra tính toàn vẹn (Health check validation)
log "🧪 [5/5] Kiểm tra file dist/index.html sau build..."
if [ ! -f "$APP_DIR/dist/index.html" ]; then
  log "❌ Lỗi: dist/index.html không tồn tại!"
  false
fi

# 6. Reload PM2 Zero-downtime
log "✨ Reload ứng dụng PM2 với phiên bản mới..."
pm2 reload phuoc-nodejs || pm2 start ecosystem.config.cjs

log "🎉 DEPLOY THÀNH CÔNG RỰC RỠ! Phiên bản mới đã online."
