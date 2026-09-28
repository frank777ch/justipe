#!/usr/bin/env bash
# Despliega una imagen de la API y verifica que quede sana.
# Si no arranca bien en el tiempo límite, vuelve automáticamente a la imagen anterior.
#
# Uso: scripts/deploy.sh ghcr.io/<usuario>/justipe-api:<commit>
# Lo ejecuta el workflow de GitHub Actions por SSH; también sirve a mano para un rollback:
#   scripts/deploy.sh ghcr.io/<usuario>/justipe-api:<commit-anterior>

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

IMAGE="${1:-}"
[[ -n "$IMAGE" ]] || die "Uso: $0 <imagen>"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-90}"
# Cuántas imágenes anteriores de la API se conservan para rollback
KEEP_IMAGES="${KEEP_IMAGES:-3}"

current_image() {
  [[ -f "$DEPLOY_ENV_FILE" ]] && sed -n 's/^API_IMAGE=//p' "$DEPLOY_ENV_FILE" || true
}

set_image() {
  printf 'API_IMAGE=%s\n' "$1" > "$DEPLOY_ENV_FILE"
}

# Espera a que el healthcheck del contenedor de la API reporte "healthy"
wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS)) container status
  while ((SECONDS < deadline)); do
    container="$(compose ps -q api)"
    status="$([[ -n "$container" ]] && docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || echo missing)"
    case "$status" in
      healthy) return 0 ;;
      unhealthy) return 1 ;;
    esac
    sleep 3
  done
  return 1
}

start() {
  set_image "$1"
  compose up -d --no-build --remove-orphans
}

PREVIOUS="$(current_image)"
log "Imagen actual: ${PREVIOUS:-(ninguna)}"
log "Imagen nueva:  $IMAGE"

# Las etiquetas por commit son inmutables: si ya está descargada no hace falta bajarla de nuevo
if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
  log "Descargando imagen…"
  docker pull "$IMAGE"
fi

start "$IMAGE"
log "Esperando a que la API esté sana (máx. ${HEALTH_TIMEOUT_SECONDS}s)…"
if ! wait_healthy; then
  log "La nueva versión no quedó sana. Últimas líneas del log:"
  compose logs --tail 40 api || true
  if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$IMAGE" ]]; then
    log "Volviendo a $PREVIOUS"
    start "$PREVIOUS"
    if wait_healthy; then
      log "Rollback completado"
    else
      log "ATENCIÓN: la versión anterior tampoco quedó sana"
    fi
  fi
  die "Despliegue fallido"
fi
log "API sana con $IMAGE"

# Limpieza: conserva las KEEP_IMAGES imágenes más recientes del repositorio de la API
repository="${IMAGE%:*}"
docker image ls "$repository" --format '{{.Repository}}:{{.Tag}}' \
  | grep -v -e ":<none>$" -e "^${IMAGE}$" \
  | tail -n +"$KEEP_IMAGES" \
  | xargs -r docker image rm > /dev/null 2>&1 || true
docker image prune -f > /dev/null 2>&1 || true
log "Despliegue completado"
