#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup.sh — Local clinic server backup script
#
# Runs on the clinic's local machine (Linux/Mac) or inside Docker.
# Dumps MongoDB, compresses, and stores in /backups with 7-day retention.
#
# Usage:
#   chmod +x backup.sh
#   ./backup.sh
#
# Cron (every night at 2am):
#   0 2 * * * /path/to/backup.sh >> /var/log/medical365-backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_ROOT:-./clinic-data/backups}"
DUMP_PATH="$BACKUP_DIR/dump_$DATE"
ARCHIVE="$BACKUP_DIR/backup_$DATE.tar.gz"
MONGO_HOST="${MONGO_HOST:-localhost}"
MONGO_PORT="${MONGO_PORT:-27017}"
DB_NAME="${MONGO_DB:-hms}"
CLINIC_ID="${CLINIC_ID:-unknown}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"

echo "=== Medical365 Backup ==="
echo "Clinic:  $CLINIC_ID"
echo "Date:    $DATE"
echo "Target:  $BACKUP_DIR"

# 1. Create backup directory if needed
mkdir -p "$BACKUP_DIR"

# 2. Dump MongoDB
echo "[1/4] Dumping MongoDB ($DB_NAME)..."
mongodump \
    --host "$MONGO_HOST" \
    --port "$MONGO_PORT" \
    --db "$DB_NAME" \
    --out "$DUMP_PATH" \
    --quiet

echo "[2/4] Compressing..."
tar -czf "$ARCHIVE" -C "$BACKUP_DIR" "dump_$DATE"
rm -rf "$DUMP_PATH"

ARCHIVE_SIZE=$(du -sh "$ARCHIVE" | cut -f1)
echo "[3/4] Backup created: $ARCHIVE ($ARCHIVE_SIZE)"

# 3. Cleanup old backups
echo "[4/4] Removing backups older than $KEEP_DAYS days..."
find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime "+$KEEP_DAYS" -delete
REMAINING=$(ls "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | wc -l)
echo "Kept $REMAINING backup(s)."

echo "=== Backup complete: $ARCHIVE ==="
