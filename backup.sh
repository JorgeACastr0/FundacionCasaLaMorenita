#!/bin/sh
# ══════════════════════════════════════════════════════════════════
#  backup.sh — Respaldo de datos de La Morenita
#
#  Respalda: base de datos SQLite + fotos subidas
#  Guarda en: ./backups/YYYY-MM-DD_HH-MM.tar.gz
#
#  Uso manual:      ./backup.sh
#  Cron diario:     0 3 * * * /ruta/a/casalamorenita/backup.sh
# ══════════════════════════════════════════════════════════════════

set -e

# Directorio del proyecto (relativo al script)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

FECHA=$(date +%Y-%m-%d_%H-%M)
DEST="backups/backup_${FECHA}.tar.gz"

mkdir -p backups

echo "→ Creando respaldo: $DEST"

# Pausar escrituras SQLite haciendo un checkpoint WAL
if pm2 list 2>/dev/null | grep -q "casalamorenita-api"; then
  node -e "require('$(pwd)/api/db/database').getDb().pragma('wal_checkpoint(TRUNCATE)')" \
    2>/dev/null || true
fi

# Crear el tar con los datos críticos
tar -czf "$DEST" \
  --exclude='api/db/*.sqlite-wal' \
  --exclude='api/db/*.sqlite-shm' \
  api/db/ \
  public/uploads/

echo "✔ Respaldo guardado en $DEST"
echo "  Tamaño: $(du -sh "$DEST" | cut -f1)"

# ── Limpieza: conservar solo los últimos 14 respaldos ─────────
TOTAL=$(ls backups/backup_*.tar.gz 2>/dev/null | wc -l)
if [ "$TOTAL" -gt 14 ]; then
  ELIMINAR=$(( TOTAL - 14 ))
  echo "→ Eliminando $ELIMINAR respaldo(s) antiguo(s)..."
  ls -t backups/backup_*.tar.gz | tail -n "$ELIMINAR" | xargs rm -f
  echo "✔ Limpieza completada"
fi
