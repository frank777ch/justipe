#!/usr/bin/env bash
# Restaura un respaldo de PostgreSQL. REEMPLAZA los datos actuales.
#
# Uso: scripts/restore.sh backups/justipe-2026-09-28_031500.sql.gz [--yes]
#
# Detiene la API mientras restaura para que nadie escriba a medias y la vuelve a
# levantar al final. Antes de restaurar hace un respaldo de seguridad del estado actual.

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

FILE="${1:-}"
[[ -n "$FILE" && -f "$FILE" ]] || die "Uso: $0 <archivo.sql.gz> [--yes]"
gzip -t "$FILE" || die "El archivo está dañado"

if [[ "${2:-}" != "--yes" ]]; then
  read -r -p "Se reemplazarán TODOS los datos actuales con $(basename "$FILE"). Escribe 'restaurar' para continuar: " answer
  [[ "$answer" == "restaurar" ]] || die "Cancelado"
fi

log "Respaldo de seguridad del estado actual…"
"$(dirname "${BASH_SOURCE[0]}")/backup.sh"

log "Deteniendo la API…"
compose stop api

log "Restaurando $(basename "$FILE")…"
# Comillas simples a propósito: las variables se expanden dentro del contenedor.
# shellcheck disable=SC2016
gzip -dc "$FILE" | compose exec -T db sh -c 'psql --quiet --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -v ON_ERROR_STOP=1' > /dev/null

log "Levantando la API…"
compose up -d --no-build api
log "Restauración completada"
