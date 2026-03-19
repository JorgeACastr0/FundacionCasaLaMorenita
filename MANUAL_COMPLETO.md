# Manual Completo — Fundación Hogar La Morenita
### Arquitectura · Decisiones · Despliegue · Errores · Restauración

> Documento único con todo lo necesario para entender, mantener y restaurar el proyecto desde cero.

---

## Índice

1. [Arquitectura del sistema](#1-arquitectura-del-sistema)
2. [Stack tecnológico y decisiones](#2-stack-tecnológico-y-decisiones)
3. [Estructura de archivos](#3-estructura-de-archivos)
4. [Rutas de la API](#4-rutas-de-la-api)
5. [Base de datos](#5-base-de-datos)
6. [Variables de entorno](#6-variables-de-entorno)
7. [Funcionalidades implementadas](#7-funcionalidades-implementadas)
8. [Despliegue en producción](#8-despliegue-en-producción)
9. [CI/CD con GitHub Actions](#9-cicd-con-github-actions)
10. [Errores conocidos y soluciones](#10-errores-conocidos-y-soluciones)
11. [Guía de restauración completa](#11-guía-de-restauración-completa)
12. [Mantenimiento diario](#12-mantenimiento-diario)

---

## 1. Arquitectura del sistema

### Diagrama de flujo

```
Usuario (navegador)
        │ HTTPS
        ▼
  Cloudflare CDN ──── Sirve assets en caché (HTML, CSS, JS, imágenes estáticas)
        │ HTTP:80     Sin tocar el servidor
        ▼
  CT Alpine Linux (131.255.18.44)
        │
        ▼
  Nginx :80
        ├── /              → /var/www/casalamorenita/index.html
        ├── /admin/        → /var/www/casalamorenita/admin/index.html
        ├── /uploads/      → /var/www/casalamorenita/public/uploads/ (symlink)
        ├── /cache/        → /var/www/casalamorenita/public/cache/ (symlink)
        └── /api/*         → Node.js :3000 (proxy)
                                  │
                                  ▼
                            Fastify + better-sqlite3
                            /var/www/casalamorenita/api/
```

### Filosofía: Static-First + Micro API

Nginx sirve el 95% del tráfico (archivos estáticos) directamente desde disco sin tocar Node.js.
Node.js solo interviene en operaciones reales: subir fotos, enviar formulario, login admin.
Cloudflare cachea todos los assets estáticos — el CT recibe muy poco tráfico directo.

### Infraestructura de red

```
Internet → Cloudflare (SSL termina aquí, modo Flexible)
                │ HTTP
                ▼
         CT LXC en Proxmox
         IP: 131.255.18.44
         OS: Alpine Linux
         RAM: ~512 MB (cgroup limit)
         CPU: 1 vCore
         Disco: 10 GB
```

> **Modo Flexible de Cloudflare**: el CT recibe HTTP en puerto 80. Cloudflare presenta HTTPS al usuario. No se necesita certificado en el servidor.

---

## 2. Stack tecnológico y decisiones

### Por qué Alpine Linux

| | Alpine | Ubuntu 22.04 |
|---|---|---|
| RAM base | ~50 MB | ~200 MB |
| Disco base | ~130 MB | ~2 GB |

Alpine usa `musl libc` (no `glibc`). Consecuencia: los `node_modules` compilados en Windows/Ubuntu no funcionan en Alpine. Siempre instalar con `npm install` directamente en el servidor Alpine.

Alpine usa **OpenRC** (no systemd). Comandos de servicios:
```bash
rc-service nginx start/stop/restart/status
rc-update add nginx default      # inicio automático
```

### Por qué Nginx (no dejar todo en Node.js)

Nginx está construido para servir archivos. Con ~5 MB de RAM maneja miles de conexiones simultáneas. Node.js se reserva solo para lógica de negocio.

**Decisión importante sobre symlinks**: en Alpine, la directiva `alias` de Nginx tiene problemas con bloques `location` anidados. La solución confiable es crear symlinks en la raíz del proyecto:
```bash
ln -s /var/www/casalamorenita/public/uploads /var/www/casalamorenita/uploads
ln -s /var/www/casalamorenita/public/cache   /var/www/casalamorenita/cache
```
Así Nginx sirve `/uploads/` usando la directiva `root` estándar sin necesitar `alias`.

### Por qué PM2 (no solo `node server.js`)

PM2 reinicia el proceso automáticamente si falla, arranca con el servidor (OpenRC), y provee logs persistentes.
En este CT (1 vCore): usar modo `fork` (1 instancia). El modo `cluster` es para múltiples núcleos.

### Por qué SQLite (no MySQL/PostgreSQL)

| | SQLite | MySQL |
|---|---|---|
| RAM base | 0 MB (vive en Node.js) | ~300 MB |
| Respaldo | copiar un archivo | `mysqldump` |
| Configuración | ninguna | servidor separado |

MySQL consumiría el 60% de la RAM disponible solo al iniciar. SQLite es una librería — no tiene proceso propio.

`better-sqlite3` (síncrono) es más rápido que `sqlite3` (asíncrono) para este caso — las consultas tardan <1ms y el overhead async no tiene sentido.

Modo WAL activado: permite lecturas y escrituras simultáneas sin bloqueos.

### Por qué Fastify (no Express)

- 2x más rápido en benchmarks
- Validación de schemas integrada (JSON Schema) — rechaza datos malformados antes del código
- Plugins oficiales para JWT, CORS, multipart

### Por qué Alpine.js (no React/Vue)

| Framework | Bundle | Build step |
|---|---|---|
| React | ~130 KB | Sí |
| Vue 3 | ~90 KB | Sí |
| Alpine.js | 15 KB | No |

El sitio es mayormente estático con interactividad puntual. Alpine.js con atributos `x-data`, `x-show`, `@click` directamente en el HTML es suficiente y no requiere compilación.

### Por qué Sharp para imágenes

Una foto de celular pesa 8-15 MB. Sharp la convierte a WebP optimizado:
- `thumb` 400×300 → ~40 KB (para el grid)
- `medium` 800×600 → ~200 KB (para el lightbox)

Ahorro: 97% del tamaño original. Sharp usa `libvips` (C) — requiere `vips-dev` en Alpine durante la instalación.

---

## 3. Estructura de archivos

```
/var/www/casalamorenita/           ← raíz del proyecto en el CT
│
├── index.html                     ← sitio público (Alpine.js, CSS puro)
├── css/styles.css
├── js/app.js                      ← lógica frontend: carga dinámica de galería,
│                                     actividades, testimonios, config social
├── images/                        ← imágenes estáticas del diseño
├── *.jpg / *.jpeg                 ← fotos raíz (logo, etc.)
│
├── admin/
│   ├── index.html                 ← panel de administración
│   ├── css/admin.css
│   └── js/admin.js                ← lógica completa del admin (Alpine.js)
│
├── public/
│   ├── uploads/gallery/           ← fotos subidas (WebP, generadas por Sharp)
│   │   └── foto_TIMESTAMP-thumb.webp
│   │   └── foto_TIMESTAMP-medium.webp
│   └── cache/
│       └── social_feed.json       ← caché del feed de redes sociales
│
├── uploads → public/uploads/      ← SYMLINK (necesario para Nginx en Alpine)
├── cache   → public/cache/        ← SYMLINK (necesario para Nginx en Alpine)
│
├── api/
│   ├── server.js                  ← entrada, plugins Fastify, rutas, cron
│   ├── .env                       ← secretos (NO en git)
│   ├── package.json
│   ├── db/
│   │   ├── database.js            ← inicialización SQLite, schema, WAL
│   │   └── lamorenita.sqlite      ← base de datos (NO en git)
│   ├── routes/
│   │   ├── admin.js               ← login, mensajes, stats, email reply
│   │   ├── galeria.js             ← CRUD galería + Sharp
│   │   ├── actividades.js         ← CRUD actividades
│   │   ├── testimonios.js         ← CRUD testimonios
│   │   ├── configuracion.js       ← config SMTP, redes sociales, config pública
│   │   └── contacto.js            ← formulario de contacto
│   └── jobs/
│       └── social-sync.js         ← sincronización feed Facebook/Instagram
│
├── .github/workflows/deploy.yml   ← CI/CD GitHub Actions
├── deploy_direct.sh               ← despliegue en CT limpio (1 comando)
├── backup.sh                      ← respaldo automático DB + uploads
├── restore.sh                     ← restauración desde backup
└── save_and_exit.sh               ← backup + instrucciones antes de destruir CT
```

---

## 4. Rutas de la API

**Base URL:** `https://www.casalamorenita.com/api`

### Rutas públicas (sin autenticación)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Health check del servidor |
| GET | `/api/galeria` | Listar fotos activas |
| GET | `/api/actividades` | Listar actividades activas |
| GET | `/api/testimonios` | Listar testimonios activos |
| GET | `/api/config-publica` | URLs redes sociales y WhatsApp |
| POST | `/api/contacto` | Enviar mensaje de contacto |
| GET | `/api/admin/primer-uso` | Verificar si hay admins creados |
| POST | `/api/admin/crear-usuario` | Crear primer admin (solo si no existe ninguno) |

### Rutas admin (requieren `Authorization: Bearer TOKEN`)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/admin/login` | Login → devuelve JWT |
| GET | `/api/admin/mensajes` | Ver mensajes de contacto |
| PATCH | `/api/admin/mensajes/:id/leido` | Marcar mensaje como leído |
| POST | `/api/admin/mensajes/:id/responder` | Responder por email (SMTP) |
| GET | `/api/admin/stats` | Estadísticas del dashboard |
| POST | `/api/admin/galeria/subir` | Subir foto (multipart) |
| DELETE | `/api/admin/galeria/:id` | Eliminar foto (BD + archivos WebP) |
| POST | `/api/admin/actividades` | Crear actividad |
| PUT | `/api/admin/actividades/:id` | Editar actividad |
| DELETE | `/api/admin/actividades/:id` | Eliminar actividad |
| POST | `/api/admin/testimonios` | Crear testimonio |
| PUT | `/api/admin/testimonios/:id` | Editar testimonio |
| DELETE | `/api/admin/testimonios/:id` | Eliminar testimonio (soft delete) |
| GET | `/api/admin/configuracion` | Ver configuración |
| POST | `/api/admin/configuracion` | Guardar configuración |
| POST | `/api/admin/cambiar-password` | Cambiar contraseña admin |

---

## 5. Base de datos

**Archivo:** `/var/www/casalamorenita/api/db/lamorenita.sqlite`

### Tablas

```sql
-- Mensajes del formulario de contacto
mensajes (id, nombre, email, telefono, asunto, mensaje, leido, creado_en)

-- Galería de fotos
galeria (id, nombre_arch, titulo, categoria, descripcion, activo, creado_en)

-- Actividades / eventos
actividades (id, titulo, descripcion, categoria, dia, mes, activo, creado_en)

-- Configuración SMTP y redes sociales
configuracion (clave TEXT PRIMARY KEY, valor)
  claves: facebook_url, instagram_url, tiktok_url, whatsapp_num,
          email_host, email_puerto, email_usuario, email_pass, email_remitente,
          fb_page_token, fb_page_id

-- Administradores
admins (id, usuario, hash_pass, creado_en)

-- Testimonios de familias
testimonios (id, nombre, cargo, texto, activo, orden, creado_en)
```

---

## 6. Variables de entorno

**Archivo:** `/var/www/casalamorenita/api/.env`

```env
# Servidor
PORT=3000
HOST=127.0.0.1         # solo localhost — Nginx hace el proxy
NODE_ENV=production

# Seguridad — generar con:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=clave-larga-aleatoria-min-32-chars

# CORS — dominio del sitio
ALLOWED_ORIGIN=https://www.casalamorenita.com

# Facebook (opcional — si no se configura, el feed social no se sincroniza)
FB_PAGE_TOKEN=
FB_PAGE_ID=
```

> ⚠️ Este archivo NUNCA va en git. Está en `.gitignore`. Se genera durante el deploy.

---

## 7. Funcionalidades implementadas

### Sitio público (index.html + js/app.js)

- Carga dinámica de galería desde la API (reemplaza placeholders hardcodeados)
- Carga dinámica de actividades desde la API
- Carga dinámica de testimonios con reinicialización de Swiper
- Carga de config pública (redes sociales, WhatsApp) via `data-social` attributes
- Lightbox de galería con event delegation (compatible con contenido dinámico)
- Formulario de contacto con validación frontend
- Swiper para testimonios y galería de fotos
- Animaciones AOS (Animate On Scroll)

### Panel de administración (admin/)

- Login con JWT (24h de duración)
- Dashboard con estadísticas en tiempo real
- Gestión de galería: subida de fotos con preview, eliminación
- Gestión de actividades: CRUD completo
- Gestión de testimonios: CRUD completo con orden
- Bandeja de mensajes: ver, marcar como leído, responder por email
- Configuración: redes sociales, SMTP para emails
- Cambio de contraseña

### Características técnicas

- Fotos convertidas a WebP en 2 tamaños (thumb 400px, medium 800px)
- Email de respuesta vía SMTP configurable desde el admin (nodemailer)
- Cron job cada 6 horas para sincronizar feed de Facebook
- JWT_SECRET aleatorio generado en cada deploy
- Backup automático configurable vía cron

---

## 8. Despliegue en producción

### Requisitos previos

- CT Alpine Linux (LXC en Proxmox) — **SIN Docker** (ver errores conocidos)
- Dominio apuntando a la IP del CT en Cloudflare (modo Flexible)
- Acceso SSH como root al CT

### Deploy desde cero (un comando)

```bash
# En el CT — como root
wget -qO deploy_direct.sh https://raw.githubusercontent.com/JorgeACastr0/FundacionCasaLaMorenita/main/deploy_direct.sh \
  && chmod +x deploy_direct.sh \
  && ./deploy_direct.sh
```

El script hace automáticamente:
1. Instala Node.js, Nginx, PM2, vips-dev y dependencias del sistema
2. Clona el repositorio en `/var/www/casalamorenita`
3. Crea directorios de datos y symlinks de Nginx
4. Instala dependencias npm (compilando módulos nativos en Alpine)
5. Genera `.env` con JWT_SECRET aleatorio
6. Configura Nginx y elimina config por defecto
7. Inicia la API con PM2 y configura inicio automático
8. Verifica que la API responde correctamente

### Crear el primer usuario admin

Después del deploy:
```bash
curl -X POST http://127.0.0.1:3000/api/admin/crear-usuario \
  -H 'Content-Type: application/json' \
  -d '{"usuario":"admin","password":"TuContraseñaSegura123"}'
```

Solo funciona si no existe ningún admin en la base de datos.

### Actualizar el dominio en .env

```bash
nano /var/www/casalamorenita/api/.env
# Cambiar: ALLOWED_ORIGIN=https://www.casalamorenita.com
pm2 restart casalamorenita-api
```

### Configuración de Cloudflare

1. Registro A `@` → IP del CT (proxy naranja ☁️ activado)
2. Registro A `www` → IP del CT (proxy naranja ☁️ activado)
3. SSL/TLS → modo **Flexible**
4. Si hay cambios de archivos estáticos: **Caching → Purge Cache → Purge Everything**

---

## 9. CI/CD con GitHub Actions

Cada `git push` a `main` despliega automáticamente al CT.

### Archivo: `.github/workflows/deploy.yml`

```yaml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            git -C /var/www/casalamorenita pull --rebase
            cd /var/www/casalamorenita/api && npm install --omit=dev --silent
            pm2 restart casalamorenita-api
            nginx -t && nginx -s reload
```

### Secretos requeridos en GitHub

**Settings → Secrets and variables → Actions:**

| Nombre | Valor |
|---|---|
| `DEPLOY_HOST` | `131.255.18.44` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | Contenido completo de `~/.ssh/deploy_morenita` (clave privada) |

### Configurar clave SSH

```powershell
# En tu PC (PowerShell)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f "$env:USERPROFILE\.ssh\deploy_morenita"
Get-Content "$env:USERPROFILE\.ssh\deploy_morenita.pub" | Set-Clipboard
```

```bash
# En el CT
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "PEGAR_CLAVE_PUBLICA" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

---

## 10. Errores conocidos y soluciones

### Docker no funciona en LXC sin nesting

**Error:**
```
failed to mount "proc" to rootfs at "/proc": permission denied
```

**Causa:** Los contenedores LXC sin nesting habilitado no pueden ejecutar Docker porque Docker necesita montar `/proc` dentro de sus contenedores, lo cual requiere privilegios de kernel bloqueados en LXC no-privilegiados.

**Solución A (acceso al host Proxmox):**
```bash
pct set CTID -features nesting=1
```

**Solución B (sin acceso al host):**
No usar Docker. Usar el script `deploy_direct.sh` que instala todo directamente en Alpine sin contenedores. Funciona igual de bien para este tamaño de proyecto.

---

### Nginx 404 en /uploads/ a pesar de que los archivos existen

**Error:**
```
open() "/var/www/casalamorenita/uploads/gallery/foto_XXX.webp" failed (2: No such file or directory)
```

**Causa:** La directiva `alias` de Nginx en Alpine tiene comportamiento inconsistente con bloques `location` anidados. Nginx usa la ruta `root + uri` en vez de la ruta del alias.

**Solución:** Crear symlinks en lugar de usar `alias`:
```bash
ln -s /var/www/casalamorenita/public/uploads /var/www/casalamorenita/uploads
ln -s /var/www/casalamorenita/public/cache   /var/www/casalamorenita/cache
```
Esto está incluido en `deploy_direct.sh` versión actual.

---

### Nginx sirviendo config incorrecta (dos configs en conflicto)

**Error en logs:**
```
conflicting server name "_" on 0.0.0.0:80, ignored
```

**Causa:** Quedó la config de una instalación anterior (`lamorenita.conf`) junto a la nueva (`casalamorenita.conf`), ambas con `server_name _`.

**Solución:**
```bash
ls /etc/nginx/http.d/          # verificar qué configs hay
rm /etc/nginx/http.d/lamorenita.conf   # eliminar la vieja
nginx -t && nginx -s reload
```

---

### PATCH "marcar como leído" devuelve 400

**Causa:** El helper `req()` del admin enviaba `Content-Type: application/json` en todos los requests, incluyendo los que no tienen body. Fastify intentaba parsear el body vacío como JSON y fallaba.

**Solución en `admin/js/admin.js`:**
```js
const headers = {};
if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
if (body !== null) headers['Content-Type'] = 'application/json';  // solo si hay body
```

---

### Error al subir fotos — 400 Bad Request

**Causa:** `req.file()` en `@fastify/multipart` consume el stream hasta el primer archivo. Los campos de texto que venían después (`titulo`, `categoria`) no estaban disponibles en `req.body`.

**Solución en `api/routes/galeria.js`:**
```js
for await (const part of req.parts()) {
  if (part.type === 'file') {
    fileMime = part.mimetype;
    fileBuffer = await part.toBuffer();
  } else {
    campos[part.fieldname] = part.value;
  }
}
```

---

### GitHub Actions "missing server host"

**Causa:** El secreto `DEPLOY_HOST` fue guardado con un espacio al inicio o al final del valor.

**Solución:** Eliminar el secreto y recrearlo pegando solo la IP sin espacios ni saltos de línea.

---

### Cloudflare cachea respuestas 404

**Causa:** Cloudflare guardó en su CDN los 404 que ocurrieron antes de que el problema de Nginx/symlinks estuviera resuelto.

**Solución:**
Cloudflare Dashboard → **Caching → Configuration → Purge Cache → Purge Everything**

---

### Imagen con URL doble slash (//uploads/...)

**Causa:** En el template admin había `:src="'/'+foto.url_thumb"` pero `foto.url_thumb` ya inicia con `/`, resultando en `//uploads/...` que el navegador interpreta como URL de protocolo relativo.

**Solución:** `:src="foto.url_thumb"` sin concatenación.

---

### CT ve la RAM total del host Proxmox

**Causa:** LXC comparte el kernel del host. `/proc/meminfo` no está aislado por defecto — `free -m` muestra la RAM del Proxmox, no la del CT.

**Solución (requiere acceso al host Proxmox):**
```bash
# En el host Proxmox
apt install lxcfs -y
systemctl enable lxcfs --now

# En /etc/pve/lxc/CTID.conf agregar:
lxc.mount.entry = /var/lib/lxcfs/proc/meminfo proc/meminfo none bind,optional,create=file
lxc.mount.entry = /var/lib/lxcfs/proc/cpuinfo proc/cpuinfo none bind,optional,create=file
```

---

## 11. Guía de restauración completa

### Escenario: CT destruido, restaurar desde backup

**Paso 1 — Crear nuevo CT y hacer deploy**
```bash
# En el CT nuevo — como root
wget -qO deploy_direct.sh https://raw.githubusercontent.com/JorgeACastr0/FundacionCasaLaMorenita/main/deploy_direct.sh \
  && chmod +x deploy_direct.sh && ./deploy_direct.sh
```

**Paso 2 — Subir el backup al CT nuevo**
```bash
# Desde tu PC
scp ~/Desktop/backup_FECHA.tar.gz root@IP_NUEVO_CT:/var/www/casalamorenita/
```

**Paso 3 — Restaurar los datos**
```bash
# En el CT nuevo
cd /var/www/casalamorenita
./restore.sh backup_FECHA.tar.gz
```

El script restaura:
- `api/db/lamorenita.sqlite` (todos los mensajes, fotos, config, usuarios)
- `public/uploads/gallery/*.webp` (todas las fotos subidas)

**Paso 4 — Actualizar el .env**
```bash
nano /var/www/casalamorenita/api/.env
# ALLOWED_ORIGIN=https://www.casalamorenita.com
pm2 restart casalamorenita-api
```

**Paso 5 — Actualizar IP en Cloudflare (si cambió)**

En el panel Cloudflare, actualizar los registros A `@` y `www` con la nueva IP del CT.

**Paso 6 — Verificación final**
```bash
curl http://127.0.0.1/api/health
# {"ok":true,"ts":"..."}

pm2 status
# casalamorenita-api │ online
```

---

### Hacer un backup manual en cualquier momento

```bash
cd /var/www/casalamorenita
./backup.sh
# Crea: backups/backup_YYYY-MM-DD_HH-MM.tar.gz
```

### Configurar backup automático diario (3 AM)

```bash
crontab -e
# Agregar:
0 3 * * * /var/www/casalamorenita/backup.sh >> /var/log/backup_morenita.log 2>&1
```

---

## 12. Mantenimiento diario

```bash
# Estado de la API
pm2 status

# Logs en tiempo real
pm2 logs casalamorenita-api

# Logs de nginx
tail -f /var/log/nginx/error.log

# Uso de recursos
free -m          # RAM
df -h            # disco
pm2 monit        # CPU + memoria de Node.js en tiempo real

# Ver fotos subidas
du -sh /var/www/casalamorenita/public/uploads/

# Ver tamaño de la BD
du -sh /var/www/casalamorenita/api/db/

# Reiniciar API (después de cambios en .env)
pm2 restart casalamorenita-api

# Recargar Nginx (después de cambios en su config)
nginx -t && nginx -s reload

# Actualizar manualmente sin esperar CI/CD
cd /var/www/casalamorenita
git pull
pm2 restart casalamorenita-api
nginx -s reload
```

### Capacidad estimada

| Recurso | Uso actual | Límite práctico |
|---|---|---|
| RAM | ~170 MB | ~450 MB (512 MB - SO) |
| CPU idle | ~83% | Picos a 100% solo al procesar fotos |
| Disco | 1.9 GB / 9.7 GB | ~8 GB para fotos (crecimiento lento) |
| Usuarios simultáneos | <5 (fundación pequeña) | 100-300 cómodamente |

El cuello de botella real a futuro será el disco (acumulación de fotos), no la RAM ni el CPU.
Con Cloudflare CDN, el 95% del tráfico nunca llega al CT.
