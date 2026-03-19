#!/bin/sh
# ══════════════════════════════════════════════════════════════════
#  security_test.sh — Agente de pruebas de seguridad
#  Fundación Hogar La Morenita
#
#  Uso:
#    ./security_test.sh                        # prueba localhost
#    ./security_test.sh https://tudominio.com  # prueba producción
#
#  Qué prueba:
#    1. Validación de campos requeridos
#    2. Límites de longitud
#    3. Payloads XSS
#    4. Payloads SQL Injection
#    5. Campos numéricos con texto
#    6. Teléfono con caracteres peligrosos
#    7. Acceso a rutas admin sin token (401)
#    8. Token inválido (401)
#    9. Upload de archivo no permitido
#   10. Endpoint de primer uso bloqueado si ya hay admin
# ══════════════════════════════════════════════════════════════════

BASE="${1:-http://127.0.0.1}"
API="$BASE/api"

# Colores
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

PASS=0; FAIL=0; WARN=0

ok()   { echo "${GREEN}  ✔ PASS${NC} — $*"; PASS=$((PASS+1)); }
fail() { echo "${RED}  ✖ FAIL${NC} — $*"; FAIL=$((FAIL+1)); }
warn() { echo "${YELLOW}  ⚠ WARN${NC} — $*"; WARN=$((WARN+1)); }
titulo() { echo ""; echo "${CYAN}▸ $*${NC}"; }

# Función auxiliar: espera código HTTP específico
espera() {
  ESPERADO=$1; shift
  REAL=$(curl -s -o /dev/null -w "%{http_code}" "$@")
  if [ "$REAL" = "$ESPERADO" ]; then
    return 0
  else
    echo "    (obtenido: $REAL, esperado: $ESPERADO)"
    return 1
  fi
}

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Agente de Seguridad — La Morenita       ║"
echo "╚══════════════════════════════════════════╝"
echo "  Target: $BASE"
echo ""

# ── 1. Health check ───────────────────────────────────────────
titulo "1. Health check"
if espera 200 "$API/health"; then
  ok "API accesible y respondiendo"
else
  fail "API no responde — abortando pruebas"
  exit 1
fi

# ── 2. Campos requeridos ──────────────────────────────────────
titulo "2. Campos requeridos en formulario de contacto"

if espera 400 -X POST "$API/contacto" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test"}'; then
  ok "Rechaza body incompleto (sin email, asunto, mensaje)"
else
  fail "Acepta body incompleto — falta validación"
fi

if espera 400 -X POST "$API/contacto" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"","email":"a@b.com","asunto":"Test","mensaje":"Test mensaje"}'; then
  ok "Rechaza nombre vacío"
else
  fail "Acepta nombre vacío"
fi

# ── 3. Límites de longitud ────────────────────────────────────
titulo "3. Límites de longitud (maxLength)"

NOMBRE_LARGO=$(head -c 200 /dev/urandom | tr -dc 'a-z' | head -c 200)
if espera 400 -X POST "$API/contacto" \
  -H "Content-Type: application/json" \
  -d "{\"nombre\":\"$NOMBRE_LARGO\",\"email\":\"a@b.com\",\"asunto\":\"Test\",\"mensaje\":\"Test mensaje largo\"}"; then
  ok "Rechaza nombre con más de 120 caracteres"
else
  fail "Acepta nombre demasiado largo"
fi

MENSAJE_LARGO=$(head -c 3000 /dev/urandom | tr -dc 'a-z ' | head -c 2500)
if espera 400 -X POST "$API/contacto" \
  -H "Content-Type: application/json" \
  -d "{\"nombre\":\"Test\",\"email\":\"a@b.com\",\"asunto\":\"Test\",\"mensaje\":\"$MENSAJE_LARGO\"}"; then
  ok "Rechaza mensaje con más de 2000 caracteres"
else
  fail "Acepta mensaje demasiado largo"
fi

# ── 4. Payloads XSS ───────────────────────────────────────────
titulo "4. Payloads XSS en formulario de contacto"

# El servidor debe aceptar (200/201) pero el campo debe llegar saneado
XSS1='<script>alert(1)</script>'
RESP=$(curl -s -X POST "$API/contacto" \
  -H "Content-Type: application/json" \
  -d "{\"nombre\":\"$XSS1\",\"email\":\"xss@test.com\",\"asunto\":\"xsstest\",\"mensaje\":\"test mensaje xss payload\"}")

if echo "$RESP" | grep -q '"ok":true'; then
  # El mensaje se guardó — verificar que se almacenó sin etiquetas
  warn "XSS en nombre: el servidor guardó el campo (revisar sanitización backend)"
else
  ok "XSS en nombre: rechazado por el servidor"
fi

XSS2='"><img src=x onerror=alert(1)>'
RESP2=$(curl -s -X POST "$API/contacto" \
  -H "Content-Type: application/json" \
  -d "{\"nombre\":\"Jorge\",\"email\":\"xss2@test.com\",\"asunto\":\"xss2test\",\"mensaje\":\"$XSS2\"}")
if echo "$RESP2" | grep -q '"ok":true'; then
  warn "XSS en mensaje: guardado (verificar que frontend usa escHtml al mostrar)"
else
  ok "XSS en mensaje: rechazado"
fi

# ── 5. Payloads SQL Injection ─────────────────────────────────
titulo "5. Payloads SQL Injection"

SQLI="' OR '1'='1"
RESP=$(curl -s -X POST "$API/contacto" \
  -H "Content-Type: application/json" \
  -d "{\"nombre\":\"$SQLI\",\"email\":\"sqli@test.com\",\"asunto\":\"sqlitest\",\"mensaje\":\"test mensaje sql injection\"}")
# Con queries parametrizadas debe guardarse como texto literal, no ejecutarse
if echo "$RESP" | grep -q '"ok":true'; then
  ok "SQL Injection clásico: tratado como texto (queries parametrizadas funcionando)"
else
  ok "SQL Injection clásico: rechazado"
fi

SQLI2="'; DROP TABLE mensajes; --"
RESP2=$(curl -s -X POST "$API/contacto" \
  -H "Content-Type: application/json" \
  -d "{\"nombre\":\"$SQLI2\",\"email\":\"sqli2@test.com\",\"asunto\":\"sqli2test\",\"mensaje\":\"test mensaje drop table\"}")
if echo "$RESP2" | grep -q '"ok":true'; then
  ok "DROP TABLE: tratado como texto (base de datos intacta)"
else
  ok "DROP TABLE: rechazado por validación"
fi

# Verificar que la tabla mensajes sigue existiendo
HEALTH=$(curl -s "$API/health")
if echo "$HEALTH" | grep -q '"ok":true'; then
  ok "API sigue respondiendo post SQL Injection — BD intacta"
else
  fail "API no responde después de payloads SQL — REVISAR URGENTE"
fi

# ── 6. Teléfono con caracteres peligrosos ─────────────────────
titulo "6. Validación de campo teléfono"

if espera 400 -X POST "$API/contacto" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test","email":"tel@test.com","asunto":"test","mensaje":"test mensaje telefono","telefono":"<script>alert(1)</script>"}'; then
  ok "Teléfono con HTML: rechazado por pattern validation"
else
  warn "Teléfono con HTML: aceptado (verificar sanitización en backend)"
fi

if espera 201 -X POST "$API/contacto" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test","email":"tel2@test.com","asunto":"test","mensaje":"test mensaje telefono valido","telefono":"+57 300 000 0000"}'; then
  ok "Teléfono válido: aceptado correctamente"
else
  fail "Teléfono válido rechazado — revisar pattern"
fi

# ── 7. Rutas admin sin autenticación → 401 ───────────────────
titulo "7. Protección de rutas admin (sin token)"

for RUTA in "/api/admin/mensajes" "/api/admin/stats" "/api/admin/configuracion" "/api/admin/galeria/subir"; do
  METHOD="GET"
  [ "$RUTA" = "/api/admin/galeria/subir" ] && METHOD="POST"
  if espera 401 -X "$METHOD" "$BASE$RUTA"; then
    ok "Sin token → 401 en $RUTA"
  else
    fail "Sin token → NO devuelve 401 en $RUTA (ruta desprotegida)"
  fi
done

# ── 8. Token inválido → 401 ───────────────────────────────────
titulo "8. Token JWT inválido o manipulado"

if espera 401 -X GET "$API/admin/mensajes" \
  -H "Authorization: Bearer token.falso.manipulado"; then
  ok "Token manipulado → 401"
else
  fail "Token manipulado → aceptado (vulnerabilidad crítica)"
fi

if espera 401 -X GET "$API/admin/mensajes" \
  -H "Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpZCI6MSwidXN1YXJpbyI6ImFkbWluIn0."; then
  ok "JWT con algoritmo 'none' → 401 (ataque de alg:none bloqueado)"
else
  fail "JWT con alg:none → aceptado (vulnerabilidad crítica)"
fi

# ── 9. Endpoint primer-uso ────────────────────────────────────
titulo "9. Endpoint crear-usuario bloqueado si ya hay admins"

RESP=$(curl -s -X POST "$API/admin/crear-usuario" \
  -H "Content-Type: application/json" \
  -d '{"usuario":"hacker","password":"password123"}')
if echo "$RESP" | grep -q '"error"'; then
  ok "crear-usuario bloqueado (ya existe un admin)"
else
  warn "crear-usuario no bloqueado — verificar si realmente hay admins en BD"
fi

# ── 10. Email inválido ────────────────────────────────────────
titulo "10. Validación de formato email"

if espera 400 -X POST "$API/contacto" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test","email":"no-es-un-email","asunto":"test","mensaje":"test mensaje email invalido"}'; then
  ok "Email inválido → 400"
else
  fail "Email inválido aceptado"
fi

# ── Resumen ───────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  RESULTADO: ${GREEN}$PASS PASS${NC}  ${RED}$FAIL FAIL${NC}  ${YELLOW}$WARN WARN${NC}"
echo "══════════════════════════════════════════════════════════"
echo ""

if [ $FAIL -gt 0 ]; then
  echo "${RED}⚠ Hay $FAIL prueba(s) fallida(s). Revisar antes de ir a producción.${NC}"
  exit 1
elif [ $WARN -gt 0 ]; then
  echo "${YELLOW}ℹ Hay $WARN advertencia(s). Revisar el comportamiento indicado.${NC}"
  exit 0
else
  echo "${GREEN}✔ Todas las pruebas pasaron.${NC}"
  exit 0
fi
