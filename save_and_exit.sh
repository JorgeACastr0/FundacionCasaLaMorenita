#!/bin/sh
# ══════════════════════════════════════════════════════════════════
#  save_and_exit.sh — Guardar todo antes de destruir el CT
#
#  Uso: ./save_and_exit.sh
#
#  Qué hace:
#    1. Crea un respaldo completo (BD + fotos)
#    2. Muestra el comando para descargarlo a tu PC
#    3. Espera confirmación antes de continuar
# ══════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Guardar datos antes de destruir el CT   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Crear el respaldo ───────────────────────────────────────
echo "→ Creando respaldo..."
sh backup.sh

ULTIMO=$(ls -t backups/backup_*.tar.gz 2>/dev/null | head -1)

if [ -z "$ULTIMO" ]; then
  echo "${YELLOW}⚠ No se encontró ningún respaldo. Verifica que backup.sh funcionó.${NC}"
  exit 1
fi

TAMANIO=$(du -sh "$ULTIMO" | cut -f1)
IP=$(ip addr show eth0 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d/ -f1)
[ -z "$IP" ] && IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' | head -1)
[ -z "$IP" ] && IP="IP_DEL_CT"

echo ""
echo "${GREEN}✔ Respaldo creado: $ULTIMO ($TAMANIO)${NC}"
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  DESCARGA el respaldo a tu PC ANTES de destruir el CT"
echo "══════════════════════════════════════════════════════════"
echo ""
echo "${CYAN}  Desde tu PC (Windows Git Bash / PowerShell):${NC}"
echo ""
echo "  scp root@${IP}:${SCRIPT_DIR}/${ULTIMO} ~/Desktop/"
echo ""
echo "══════════════════════════════════════════════════════════"
echo ""

# ── 2. Esperar confirmación ────────────────────────────────────
printf "¿Ya descargaste el respaldo a tu PC? (escribe 'si' para continuar): "
read CONFIRM

if [ "$CONFIRM" != "si" ]; then
  echo ""
  echo "${YELLOW}Operación cancelada. El respaldo sigue en: $ULTIMO${NC}"
  echo "Cuando lo hayas descargado, ya puedes destruir el CT."
  exit 0
fi

echo ""
echo "${GREEN}✔ Perfecto. Ahora puedes destruir el CT con seguridad.${NC}"
echo ""
echo "  Archivo que necesitarás para restaurar:"
echo "  $(basename $ULTIMO)"
echo ""
echo "  Después de crear el CT nuevo y hacer el deploy, ejecuta:"
echo "  ./restore.sh ~/Desktop/$(basename $ULTIMO)"
echo ""
