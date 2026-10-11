#!/usr/bin/env bash
# Restaura un backup: ./scripts/restore.sh backups/db-YYYYMMDD-HHMMSS.dump
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${1:?Uso: restore.sh <archivo.dump>}"
set -a; . "$ROOT/.env"; set +a
URL="${DATABASE_URL%%\?*}"
read -r -p "Esto SOBRESCRIBE la base de datos actual. ¿Continuar? (escribe SI) " ok
[[ "$ok" == "SI" ]] || exit 1
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$URL" "$FILE"
echo "Restaurado $FILE"
