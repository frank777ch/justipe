#!/usr/bin/env bash
# Instala (o actualiza) la tarea de cron del respaldo diario en el crontab del usuario.
# Es idempotente: el workflow de deploy lo ejecuta en cada despliegue.
#
# Horario: 08:15 UTC = 03:15 hora de Lima (el cron clásico de Debian/Ubuntu no
# entiende CRON_TZ, así que se expresa en UTC). Cambia BACKUP_CRON para otro horario.

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

BACKUP_CRON="${BACKUP_CRON:-15 8 * * *}"
MARKER="# justipe-backup"
LOG_FILE="$DEPLOY_DIR/backups/backup.log"
mkdir -p "$DEPLOY_DIR/backups"

line="$BACKUP_CRON $DEPLOY_DIR/scripts/backup.sh >> $LOG_FILE 2>&1 $MARKER"

current="$(crontab -l 2>/dev/null || true)"
if grep -qF -- "$line" <<< "$current"; then
  log "Cron de respaldo ya instalado"
  exit 0
fi

# Reemplaza cualquier línea anterior con el marcador y agrega la nueva
{ grep -vF -- "$MARKER" <<< "$current" || true; echo "$line"; } | sed '/^$/d' | crontab -
log "Cron de respaldo instalado: $BACKUP_CRON (UTC)"
