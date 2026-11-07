#!/usr/bin/env bash
# Backup de la base de producción (Neon, branch main) al homelab.
# Lee la URL directa de .env.neon (DATABASE_URL_UNPOOLED), que no se sube al repo.
# Usa pg_dump de la imagen de docker postgres:18 (tiene que ser >= la versión de Neon).
#
# Uso:  scripts/backup-db.sh                 → ~/backups/finanzas/finanzas-AAAA-MM-DD_HHMM.dump
#       BACKUP_DIR=/otra/ruta KEEP_DAYS=60 scripts/backup-db.sh
# Restaurar: ver README ("Backups").
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/finanzas}"
KEEP_DAYS="${KEEP_DAYS:-30}"
PG_IMAGE="${PG_IMAGE:-postgres:18-alpine}"

URL="$(grep '^DATABASE_URL_UNPOOLED=' "$ROOT/.env.neon" | cut -d= -f2- | tr -d "\"'")"
[ -n "$URL" ] || { echo "Falta DATABASE_URL_UNPOOLED en $ROOT/.env.neon" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
FILE="$BACKUP_DIR/finanzas-$(date +%Y-%m-%d_%H%M).dump"
TMP="$FILE.partial"

# formato custom (-Fc): comprimido y se restaura con pg_restore; sin dueños ni permisos para poder restaurarlo en cualquier base
docker run --rm -i -e PGURL="$URL" "$PG_IMAGE" sh -c 'pg_dump "$PGURL" -Fc --no-owner --no-privileges' > "$TMP"

# un dump válido tiene su índice legible; si no, se descarta
docker run --rm -i "$PG_IMAGE" pg_restore --list < "$TMP" > /dev/null
mv "$TMP" "$FILE"
chmod 600 "$FILE"

find "$BACKUP_DIR" -name 'finanzas-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name '*.partial' -mmin +60 -delete
echo "$(date '+%F %T') backup OK: $FILE ($(du -h "$FILE" | cut -f1))"
