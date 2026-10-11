#!/usr/bin/env bash
# Despliegue sin downtime: pull → install → migraciones → build → reload PM2.
# Uso: ./deploy.sh [--no-pull]
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

if [[ "${1:-}" != "--no-pull" ]]; then
  log "Actualizando código (git pull)"
  git pull --ff-only
fi

log "Instalando dependencias"
pnpm install --frozen-lockfile

log "Aplicando migraciones de base de datos"
set -a; . ./.env; set +a
pnpm --filter @inventario/api exec prisma migrate deploy

log "Compilando API y frontend"
pnpm --filter @inventario/api build
pnpm --filter @inventario/web build

log "Reiniciando API (reload sin downtime)"
if pm2 describe inventariowilly-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save >/dev/null

log "Comprobando salud"
sleep 2
curl -fsS http://127.0.0.1:3300/api/health && echo
log "Despliegue completado"
