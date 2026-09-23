#!/usr/bin/env bash

# ==============================================================================
# Script Sao Lưu Cơ Sở Dữ Liệu Tự Động: Nén Gzip, Mã Hóa OpenSSL AES-256
# Lưu trữ cục bộ & Tự động dọn dẹp (Retention 7 ngày)
# ==============================================================================

set -eo pipefail

APP_DIR="/home/io-phuoc-nodejs-sixforce/htdocs"
BACKUP_DIR="$APP_DIR/backups"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$APP_DIR/logs/backup.log"

# Đọc thông tin từ file .env nếu có
if [ -f "$APP_DIR/.env" ]; then
  export $(grep -v '^#' "$APP_DIR/.env" | xargs)
fi

DB_USER="${DB_USER:-phuoc-nodejs}"
DB_PASS="${DB_PASSWORD:-Phuoc02082005}"
DB_NAME="${DB_NAME:-Phuoc-NodeJS}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
BACKUP_SECRET="${BACKUP_SECRET:-PhuocSecuredBackup2026@AES256}"

mkdir -p "$BACKUP_DIR"
mkdir -p "$APP_DIR/logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🔄 === BẮT ĐẦU QUY TRÌNH BACKUP DỮ LIỆU ĐỊNH KỲ ==="

RAW_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql"
GZ_FILE="${RAW_FILE}.gz"
ENC_FILE="${GZ_FILE}.enc"

# 1. Dump MariaDB
log "📦 [1/4] Đang xuất dữ liệu MariaDB database: ${DB_NAME}..."
mariadb-dump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" \
  --single-transaction --quick --routines --triggers "$DB_NAME" > "$RAW_FILE"

# 2. Nén Gzip tối đa (-9)
log "🗜 [2/4] Nén file SQL với chuẩn Gzip mức cao nhất (Level 9)..."
gzip -9 -f "$RAW_FILE"

# 3. Mã hóa OpenSSL AES-256-CBC (chuẩn mã hóa ngân hàng)
log "🔐 [3/4] Mã hóa file nén bằng OpenSSL AES-256-CBC (PBKDF2)..."
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
  -in "$GZ_FILE" \
  -out "$ENC_FILE" \
  -pass "pass:$BACKUP_SECRET"

# Xóa ngay file nén chưa mã hóa để bảo đảm an toàn dữ liệu
rm -f "$GZ_FILE"

FILE_SIZE=$(du -h "$ENC_FILE" | cut -f1)
log "✔ File sao lưu đã được mã hóa an toàn: $(basename "$ENC_FILE") (Dung lượng: $FILE_SIZE)"

# 4. Tự động dọn dẹp các bản backup cũ hơn 7 ngày
log "🧹 [4/4] Dọn dẹp các bản sao lưu cũ hơn 7 ngày..."
DELETED_COUNT=0
find "$BACKUP_DIR" -name "*.enc" -type f -mtime +7 -exec rm -f {} + -exec echo "Deleted old backup: {}" \; >> "$LOG_FILE" 2>&1 || true

CURRENT_BACKUPS_COUNT=$(ls -1 "$BACKUP_DIR"/*.enc 2>/dev/null | wc -l)
log "✔ Hoàn tất sao lưu! Hiện có ${CURRENT_BACKUPS_COUNT} bản sao lưu an toàn trong ${BACKUP_DIR}."
