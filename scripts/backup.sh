#!/usr/bin/env bash
# Backup diario de PostgreSQL (pg_dump comprimido) + uploads, con rotación.
# Cron sugerido: 30 2 * * * /home/ubuntu/apps/inventariowilly/scripts/backup.sh >> /home/ubuntu/apps/inventariowilly/logs/backup.log 2>&1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
set -a; . "$ROOT/.env"; set +a
STAMP="$(date +%Y%m%d-%H%M%S)"
URL="${DATABASE_URL%%\?*}"   # pg_dump no acepta ?schema=
pg_dump --no-owner --no-privileges --format=custom --compress=6 --dbname="$URL" --file="$BACKUP_DIR/db-$STAMP.dump"
tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$ROOT" uploads 2>/dev/null || true
find "$BACKUP_DIR" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "[$(date -Is)] backup ok: db-$STAMP.dump ($(du -h "$BACKUP_DIR/db-$STAMP.dump" | cut -f1))"
