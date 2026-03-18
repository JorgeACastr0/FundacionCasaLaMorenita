#!/bin/sh
# ══════════════════════════════════════════════════════════════════
#  deploy_direct.sh — Despliegue directo en Alpine Linux (sin Docker)
#  Para CTs LXC sin nesting habilitado
#
#  Uso:
#    wget -qO deploy_direct.sh https://raw.githubusercontent.com/JorgeACastr0/FundacionCasaLaMorenita/main/deploy_direct.sh
#    chmod +x deploy_direct.sh && ./deploy_direct.sh
# ══════════════════════════════════════════════════════════════════

set -e

REPO_URL="https://github.com/JorgeACastr0/FundacionCasaLaMorenita.git"
APP_DIR="/var/www/casalamorenita"
DOMAIN="${1:-}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo "${GREEN}✔ $*${NC}"; }
warn() { echo "${YELLOW}⚠ $*${NC}"; }
err()  { echo "${RED}✖ $*${NC}"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Fundación Hogar La Morenita — Deploy    ║"
echo "║  Modo: directo (sin Docker)              ║"
echo "╚══════════════════════════════════════════╝"
echo ""

[ "$(id -u)" -eq 0 ] || err "Ejecutar como root"

# ── 1. Paquetes del sistema ────────────────────────────────────
echo "→ Instalando paquetes..."
apk update -q
apk add --no-cache \
  git curl nodejs npm nginx \
  python3 make g++ vips-dev

# PM2 global
npm install -g pm2 --silent
ok "Paquetes instalados (Node $(node -v), nginx $(nginx -v 2>&1 | cut -d/ -f2))"

# ── 2. Clonar o actualizar repositorio ────────────────────────
echo "→ Preparando repositorio en $APP_DIR..."
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --rebase
  ok "Repo actualizado"
else
  mkdir -p "$(dirname $APP_DIR)"
  git clone "$REPO_URL" "$APP_DIR"
  ok "Repo clonado"
fi

cd "$APP_DIR"

# ── 3. Directorios de datos y symlinks para nginx ─────────────
mkdir -p api/db public/uploads/gallery public/cache backups
# Nginx sirve /uploads/ y /cache/ desde la raíz del proyecto
[ -L "$APP_DIR/uploads" ] || ln -s "$APP_DIR/public/uploads" "$APP_DIR/uploads"
[ -L "$APP_DIR/cache" ]   || ln -s "$APP_DIR/public/cache"   "$APP_DIR/cache"
ok "Directorios de datos creados"

# ── 4. Instalar dependencias Node ─────────────────────────────
echo "→ Instalando dependencias Node.js (puede tardar 3-5 min)..."
cd "$APP_DIR/api"
npm install --omit=dev --silent
ok "Dependencias instaladas"
cd "$APP_DIR"

# ── 5. Crear .env si no existe ────────────────────────────────
if [ ! -f "$APP_DIR/api/.env" ]; then
  echo "→ Generando .env..."
  JWT=$(cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64)
  ORIGIN="http://localhost"
  [ -n "$DOMAIN" ] && ORIGIN="https://$DOMAIN"

  cat > "$APP_DIR/api/.env" <<EOF
PORT=3000
HOST=127.0.0.1
NODE_ENV=production
JWT_SECRET=${JWT}
ALLOWED_ORIGIN=${ORIGIN}
FB_PAGE_TOKEN=
FB_PAGE_ID=
EOF
  ok ".env creado"
  warn "Edita $APP_DIR/api/.env para poner tu dominio en ALLOWED_ORIGIN"
else
  ok ".env ya existe"
fi

# ── 6. Configurar Nginx ────────────────────────────────────────
echo "→ Configurando Nginx..."
rm -f /etc/nginx/http.d/default.conf

cat > /etc/nginx/http.d/casalamorenita.conf <<'NGINXCONF'
server {
    listen 80;
    server_name _;

    root  /var/www/casalamorenita;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/javascript application/javascript application/json image/svg+xml;

    location ~* \.(css|js|woff2?|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location ~* \.(webp|jpg|jpeg|png|gif|svg|ico)$ {
        expires 30d;
        add_header Cache-Control "public";
        access_log off;
    }

    location /uploads/ {
        alias /var/www/casalamorenita/public/uploads/;
        expires 30d;
        add_header Cache-Control "public";
        location ~* \.(php|py|sh|pl)$ { deny all; }
    }

    location /cache/ {
        alias /var/www/casalamorenita/public/cache/;
        expires 10m;
        add_header Cache-Control "public";
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10M;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    add_header X-Frame-Options        "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection       "1; mode=block";
    add_header Referrer-Policy        "strict-origin-when-cross-origin";
}
NGINXCONF

nginx -t
rc-service nginx start 2>/dev/null || rc-service nginx reload
rc-update add nginx default 2>/dev/null || true
ok "Nginx configurado"

# ── 7. Iniciar API con PM2 ────────────────────────────────────
echo "→ Iniciando API con PM2..."
cd "$APP_DIR/api"

pm2 delete casalamorenita-api 2>/dev/null || true
pm2 start server.js --name "casalamorenita-api"
pm2 save

# Startup automático en Alpine
pm2 startup openrc -u root --hp /root 2>/dev/null | grep "^sudo" | sh 2>/dev/null || true
rc-update add pm2-root default 2>/dev/null || true
rc-service pm2-root start 2>/dev/null || true

ok "API en ejecución"

# ── 8. Health check ───────────────────────────────────────────
echo "→ Verificando API..."
sleep 2
HEALTH=$(curl -sf http://127.0.0.1:3000/api/health 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q '"ok":true'; then
  ok "API respondiendo correctamente"
else
  warn "La API no responde aún. Verifica con: pm2 logs casalamorenita-api"
fi

# ── 9. Permisos ───────────────────────────────────────────────
chown -R nginx:nginx "$APP_DIR/public" 2>/dev/null || true
chmod -R 755 "$APP_DIR/public"

# ── 10. Resumen ───────────────────────────────────────────────
IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' | head -1)
echo ""
ok "Despliegue completado."
echo ""
echo "  Sitio público:  http://${IP}"
echo "  Panel admin:    http://${IP}/admin/"
echo ""
echo "  Crear primer usuario admin:"
echo "  curl -X POST http://127.0.0.1:3000/api/admin/crear-usuario \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"usuario\":\"admin\",\"password\":\"TuContraseña123\"}'"
echo ""
echo "  Logs:     pm2 logs casalamorenita-api"
echo "  Estado:   pm2 status"
echo "  Actualizar: cd $APP_DIR && git pull && pm2 restart casalamorenita-api"
echo ""
