#!/usr/bin/env bash
# Funciones compartidas por los scripts de operación del VPS.
#
# Estructura del directorio de despliegue (DEPLOY_DIR, p. ej. /opt/justipe):
#   docker-compose.yml   copiado por el workflow de deploy
#   .env                 secretos, creado a mano la primera vez (nunca en el repo)
#   .deploy.env          imagen desplegada actualmente (lo escribe deploy.sh)
#   scripts/             estos scripts
#   backups/             respaldos comprimidos de PostgreSQL

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
DEPLOY_ENV_FILE="$DEPLOY_DIR/.deploy.env"

log() {
  printf '[%s] %s\n' "$(TZ=America/Lima date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

# docker compose con los archivos de entorno que existan
compose() {
  [[ -f "$COMPOSE_FILE" ]] || die "No existe $COMPOSE_FILE"
  [[ -f "$ENV_FILE" ]] || die "No existe $ENV_FILE (créalo a partir de .env.example)"
  local args=(--project-directory "$DEPLOY_DIR" -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
  [[ -f "$DEPLOY_ENV_FILE" ]] && args+=(--env-file "$DEPLOY_ENV_FILE")
  docker compose "${args[@]}" "$@"
}
