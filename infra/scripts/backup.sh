#!/usr/bin/env bash
# Respaldo de PostgreSQL: pg_dump comprimido con gzip, con retención de 30 días.
# Lo ejecuta el cron del sistema (ver install-cron.sh). Uso manual: scripts/backup.sh
#
# El respaldo se escribe primero como .partial y solo se renombra si gzip lo valida,
# así nunca queda un archivo a medias con el nombre final.

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Evita dos respaldos simultáneos
exec 9> "$BACKUP_DIR/.lock"
flock -n 9 || die "Ya hay un respaldo en curso"

timestamp="$(TZ=America/Lima date '+%Y-%m-%d_%H%M%S')"
target="$BACKUP_DIR/justipe-$timestamp.sql.gz"
partial="$target.partial"
trap 'rm -f "$partial"' EXIT

log "Iniciando respaldo -> $(basename "$target")"
# --clean --if-exists: el archivo se puede restaurar sobre una base existente.
# Comillas simples a propósito: las variables se expanden dentro del contenedor.
# shellcheck disable=SC2016
compose exec -T db sh -c 'pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-owner --clean --if-exists' \
  | gzip -9 > "$partial"

gzip -t "$partial" || die "El archivo comprimido está dañado"
# Un dump válido siempre incluye la tabla de movimientos
gzip -dc "$partial" | grep -q 'CREATE TABLE public.movements' || die "El respaldo no contiene el esquema esperado"

mv "$partial" "$target"
chmod 600 "$target"
trap - EXIT
log "Respaldo listo: $(du -h "$target" | cut -f1)"

# Retención: borra respaldos con más de RETENTION_DAYS días
deleted="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'justipe-*.sql.gz' -mmin +"$((RETENTION_DAYS * 24 * 60))" -print -delete | wc -l)"
find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.partial' -mmin +60 -delete
log "Retención ${RETENTION_DAYS} días: ${deleted} respaldo(s) antiguo(s) eliminado(s); quedan $(find "$BACKUP_DIR" -maxdepth 1 -name 'justipe-*.sql.gz' | wc -l)"
