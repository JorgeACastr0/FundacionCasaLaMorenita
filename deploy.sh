#!/bin/sh
# ══════════════════════════════════════════════════════════════════
#  deploy.sh — Despliegue en CT Alpine Linux limpio
#
#  Uso:
#    wget -qO deploy.sh https://raw.githubusercontent.com/TU_USUARIO/TU_REPO/main/deploy.sh
#    chmod +x deploy.sh
#    ./deploy.sh https://github.com/TU_USUARIO/TU_REPO.git casalamorenita
#
#  Argumentos (opcionales):
#    $1 = URL del repositorio Git  (o editar REPO_URL abajo)
#    $2 = Directorio de destino    (default: casalamorenita)
# ══════════════════════════════════════════════════════════════════

set -e

REPO_URL="${1:-https://github.com/JorgeACastr0/FundacionCasaLaMorenita.git}"
APP_DIR="${2:-casalamorenita}"
DOMAIN="${3:-}"

# ── Colores ────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo "${GREEN}✔ $*${NC}"; }
warn() { echo "${YELLOW}⚠ $*${NC}"; }
err()  { echo "${RED}✖ $*${NC}"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Fundación Hogar La Morenita — Deploy    ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Verificar que corremos como root ───────────────────────
[ "$(id -u)" -eq 0 ] || err "Ejecutar como root: sudo sh deploy.sh"

# ── 2. Instalar Docker en Alpine ──────────────────────────────
echo "→ Actualizando paquetes e instalando Docker..."
apk update -q
apk add --no-cache docker docker-cli-compose git curl
ok "Docker instalado"

# ── 3. Iniciar y habilitar el demonio Docker ──────────────────
rc-service docker start 2>/dev/null || true
rc-update add docker default 2>/dev/null || true

# Esperar a que Docker esté listo
echo "→ Esperando a que Docker esté listo..."
for i in $(seq 1 15); do
  docker info >/dev/null 2>&1 && break
  sleep 1
done
docker info >/dev/null 2>&1 || err "Docker no arrancó. Revisa el servicio manualmente."
ok "Docker en ejecución"

# ── 4. Clonar o actualizar el repositorio ─────────────────────
if [ -z "$REPO_URL" ]; then
  warn "No se indicó URL de repositorio. Clonar manualmente en ~/$APP_DIR y ejecutar de nuevo."
  warn "  Ejemplo: ./deploy.sh https://github.com/TU_USUARIO/TU_REPO.git"
  exit 0
fi

if [ -d "$APP_DIR/.git" ]; then
  echo "→ Actualizando repositorio existente..."
  git -C "$APP_DIR" pull --rebase
  ok "Repo actualizado"
else
  echo "→ Clonando repositorio..."
  git clone "$REPO_URL" "$APP_DIR"
  ok "Repo clonado en $APP_DIR"
fi

cd "$APP_DIR"

# ── 5. Crear directorios de datos persistentes ────────────────
echo "→ Creando directorios de datos..."
mkdir -p api/db public/uploads/gallery public/cache backups
ok "Directorios creados"

# ── 6. Crear archivo .env si no existe ────────────────────────
if [ ! -f ".env" ]; then
  echo "→ Generando .env con secreto JWT aleatorio..."
  JWT=$(cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64)
  ORIGIN="http://localhost"
  if [ -n "$DOMAIN" ]; then
    ORIGIN="https://$DOMAIN"
  fi

  cat > .env <<EOF
# ── Servidor ──────────────────────────────
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# ── Seguridad ─────────────────────────────
JWT_SECRET=${JWT}

# ── Dominio del sitio (para CORS) ─────────
ALLOWED_ORIGIN=${ORIGIN}

# ── Redes sociales (opcional) ─────────────
FB_PAGE_TOKEN=
FB_PAGE_ID=
EOF
  ok ".env creado"
  echo ""
  warn "Edita .env para poner tu dominio en ALLOWED_ORIGIN:"
  warn "  nano .env"
  echo ""
else
  ok ".env ya existe, no se modifica"
fi

# ── 7. Construir imágenes y arrancar contenedores ─────────────
echo "→ Construyendo imágenes Docker (puede tardar 2-4 min la primera vez)..."
docker compose build --no-cache
ok "Imágenes construidas"

echo "→ Arrancando contenedores..."
docker compose up -d
ok "Contenedores en ejecución"

# ── 8. Estado final ───────────────────────────────────────────
echo ""
docker compose ps
echo ""
ok "Despliegue completado."
echo ""
echo "  Sitio público:  http://$(hostname -I | awk '{print $1}')"
echo "  Panel admin:    http://$(hostname -I | awk '{print $1}')/admin/"
echo ""
echo "  Primer acceso al admin: crea tu usuario en"
echo "  http://$(hostname -I | awk '{print $1}')/admin/"
echo ""
echo "  Logs en tiempo real:  docker compose logs -f"
echo "  Detener:              docker compose down"
echo "  Actualizar sitio:     git pull && docker compose build nginx && docker compose up -d nginx"
