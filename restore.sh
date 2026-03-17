#!/bin/sh
# ══════════════════════════════════════════════════════════════════
#  restore.sh — Restaurar datos en un CT nuevo después del deploy
#
#  Prerrequisito: deploy.sh ya ejecutado (contenedores corriendo)
#
#  Uso:
#    ./restore.sh backup_2026-03-17_14-00.tar.gz
#
#  Qué restaura:
#    - Base de datos SQLite  (api/db/)
#    - Fotos subidas         (public/uploads/)
# ══════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

BACKUP_FILE="${1:-}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Restaurar datos — La Morenita           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Validaciones ───────────────────────────────────────────────
if [ -z "$BACKUP_FILE" ]; then
  echo "${RED}✖ Debes indicar el archivo de respaldo.${NC}"
  echo ""
  echo "  Uso: ./restore.sh ruta/al/backup_FECHA.tar.gz"
  echo ""
  echo "  Respaldos disponibles en ./backups/:"
  ls backups/backup_*.tar.gz 2>/dev/null || echo "  (ninguno)"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "${RED}✖ No se encontró el archivo: $BACKUP_FILE${NC}"
  exit 1
fi

echo "  Archivo: $BACKUP_FILE"
echo "  Tamaño: $(du -sh "$BACKUP_FILE" | cut -f1)"
echo ""

# ── Advertencia si ya hay datos ────────────────────────────────
if [ -f "api/db/lamorenita.sqlite" ]; then
  echo "${YELLOW}⚠ Ya existe una base de datos en api/db/lamorenita.sqlite${NC}"
  echo "${YELLOW}  Si continúas, será reemplazada por el respaldo.${NC}"
  echo ""
  printf "¿Continuar? (escribe 'si' para confirmar): "
  read CONFIRM
  [ "$CONFIRM" = "si" ] || { echo "Cancelado."; exit 0; }
  echo ""
fi

# ── 1. Detener la API para no corromper la BD ─────────────────
echo "→ Deteniendo API..."
pm2 stop casalamorenita-api 2>/dev/null || true

# ── 2. Crear directorios si no existen ────────────────────────
mkdir -p api/db public/uploads/gallery public/cache

# ── 3. Extraer el respaldo ─────────────────────────────────────
echo "→ Restaurando datos desde $BACKUP_FILE..."
tar -xzf "$BACKUP_FILE"
echo "${GREEN}✔ Datos extraídos${NC}"

# ── 4. Reiniciar la API ───────────────────────────────────────
echo "→ Reiniciando API..."
pm2 start casalamorenita-api 2>/dev/null || pm2 restart casalamorenita-api

# Esperar a que la API esté lista
echo "→ Esperando a que la API responda..."
for i in $(seq 1 20); do
  STATUS=$(curl -sf http://127.0.0.1:3000/api/health 2>/dev/null || true)
  echo "$STATUS" | grep -q '"ok":true' && break
  sleep 1
done

echo ""
echo "${GREEN}✔ Restauración completada.${NC}"
echo ""

# ── 5. Resumen ─────────────────────────────────────────────────
DB_SIZE=$(du -sh api/db/lamorenita.sqlite 2>/dev/null | cut -f1 || echo "N/A")
FOTOS=$(find public/uploads/gallery -name "*.webp" 2>/dev/null | wc -l)

echo "  Base de datos:  api/db/lamorenita.sqlite ($DB_SIZE)"
echo "  Fotos subidas:  $FOTOS archivos WebP"
echo ""

# Health check final
HEALTH=$(curl -sf http://127.0.0.1:3000/api/health 2>/dev/null || echo "no responde")
if echo "$HEALTH" | grep -q '"ok":true'; then
  echo "${GREEN}✔ API respondiendo correctamente.${NC}"
else
  echo "${YELLOW}⚠ La API no responde aún. Verifica con: docker compose logs api${NC}"
fi

echo ""
IP=$(ip addr show eth0 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d/ -f1)
[ -z "$IP" ] && IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' | head -1)
echo "  Panel admin:  http://${IP}/admin/"
echo ""
