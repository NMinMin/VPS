#!/usr/bin/env bash

# ==============================================================================
# Script Giải Mã và Khôi Phục Cơ Sở Dữ Liệu từ File Sao Lưu Mã Hóa AES-256
# Cách dùng: bash scripts/restore-backup.sh /path/to/backup_file.sql.gz.enc
# ==============================================================================

set -eo pipefail

if [ -z "$1" ]; then
  echo "Cách dùng: bash scripts/restore-backup.sh <duong_dan_file_backup.enc>"
  echo "Ví dụ: bash scripts/restore-backup.sh /home/io-phuoc-nodejs-sixforce/backups/Phuoc-NodeJS_20260923_120000.sql.gz.enc"
  exit 1
fi

ENC_FILE="$1"
APP_DIR="/home/io-phuoc-nodejs-sixforce/htdocs"

if [ -f "$APP_DIR/.env" ]; then
  export $(grep -v '^#' "$APP_DIR/.env" | xargs)
fi

BACKUP_SECRET="${BACKUP_SECRET:-PhuocSecuredBackup2026@AES256}"
DB_USER="${DB_USER:-phuoc-nodejs}"
DB_PASS="${DB_PASSWORD:-Phuoc02082005}"
DB_NAME="${DB_NAME:-Phuoc-NodeJS}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"

TEMP_GZ="/tmp/temp_restore_$$.sql.gz"
TEMP_SQL="/tmp/temp_restore_$$.sql"

echo "🔐 [1/3] Đang giải mã file bằng OpenSSL AES-256..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in "$ENC_FILE" \
  -out "$TEMP_GZ" \
  -pass "pass:$BACKUP_SECRET"

echo "🗜 [2/3] Giải nén dữ liệu SQL..."
gzip -d -c "$TEMP_GZ" > "$TEMP_SQL"
rm -f "$TEMP_GZ"

echo "📥 [3/3] Nạp dữ liệu vào MariaDB ${DB_NAME}..."
mariadb -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$TEMP_SQL"
rm -f "$TEMP_SQL"

echo "🎉 KHÔI PHỤC DỮ LIỆU THÀNH CÔNG!"
