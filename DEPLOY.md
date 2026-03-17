# Guía de Despliegue — Fundación Hogar La Morenita
### Servidor: Alpine Linux CT (512 MB RAM · 1 vCore · 10 GB disco)

---

## Método recomendado: Docker (un script, todo listo)

Esta guía usa Docker Compose. Destruyes el CT, creates uno nuevo, y en ~5 minutos el sitio está en producción.

---

## PARTE 0 — Activar SSH en el CT (consola web del proveedor)

> Alpine CT viene **sin SSH**. Este paso se hace una sola vez desde la consola VNC del proveedor.

```bash
apk add --no-cache openssh
ssh-keygen -A
rc-service sshd start
rc-update add sshd default
sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
rc-service sshd restart
passwd root          # ← establece la contraseña
```

Desde tu PC:
```bash
ssh root@IP_DEL_CT
```

---

## PARTE 1 — Subir el proyecto al servidor (desde tu PC)

### Opción A — Git (recomendado si tienes el proyecto en GitHub/GitLab)

```bash
# En el CT — instalar git
apk add --no-cache git

# Clonar el repositorio
git clone https://github.com/JorgeACastr0/FundacionCasaLaMorenita.git casalamorenita
```

### Opción B — Copiar con SCP (si no usas Git)

```bash
# Desde tu PC (Windows Git Bash o PowerShell)
scp -r "C:/Users/Jorge A Castro/Documents/CasaLaMorenita/." root@IP_DEL_CT:~/casalamorenita/
```

---

## PARTE 2 — Desplegar con Docker

### 2.1 Entrar al directorio del proyecto

```bash
cd ~/casalamorenita
```

### 2.2 Instalar Docker

```bash
apk add --no-cache docker docker-cli-compose
rc-service docker start
rc-update add docker default

# Esperar a que Docker esté listo
sleep 3
docker info
```

### 2.3 Crear los directorios de datos persistentes

```bash
mkdir -p api/db public/uploads/gallery public/cache backups
```

### 2.4 Crear el archivo .env

```bash
# Generar un JWT_SECRET seguro
JWT=$(cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64)

cat > .env <<EOF
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
JWT_SECRET=${JWT}
ALLOWED_ORIGIN=https://tudominio.com
FB_PAGE_TOKEN=
FB_PAGE_ID=
EOF
```

> **Importante:** Reemplaza `tudominio.com` con tu dominio real.

### 2.5 Construir e iniciar los contenedores

```bash
docker compose build
docker compose up -d
```

La primera vez tardará 3-5 minutos (compila las dependencias nativas).

### 2.6 Verificar que todo funciona

```bash
docker compose ps
# Debe mostrar ambos contenedores como "running" o "healthy"

docker compose logs -f
# Ctrl+C para salir de los logs
```

---

## PARTE 3 — Crear el primer usuario administrador

```bash
curl -X POST http://localhost/api/admin/crear-usuario \
  -H "Content-Type: application/json" \
  -d '{"usuario":"admin","password":"TuContraseñaSegura123"}'

# Respuesta esperada: {"ok":true,"mensaje":"Administrador creado."}
```

---

## PARTE 4 — Apuntar el dominio (Cloudflare)

1. En **Cloudflare DNS**, crea un registro `A` apuntando a la IP del CT
2. Activa el **proxy** (nube naranja ☁️)
3. En **SSL/TLS** → modo **Flexible** (CT recibe HTTP, Cloudflare sirve HTTPS)

> Con Cloudflare en modo Flexible no necesitas certificados en el servidor.

---

## Usando el script automatizado (deploy.sh)

Si el proyecto ya está en un repo Git, puedes hacer todo lo anterior en un comando:

```bash
# En el CT — desde la consola SSH
wget -qO deploy.sh https://raw.githubusercontent.com/JorgeACastr0/FundacionCasaLaMorenita/main/deploy.sh
chmod +x deploy.sh
./deploy.sh https://github.com/JorgeACastr0/FundacionCasaLaMorenita.git casalamorenita tudominio.com
```

El script instala Docker, clona el repo, genera el JWT, crea los directorios y levanta los contenedores.

---

## Comandos de mantenimiento

```bash
# Ver estado
docker compose ps

# Ver logs en tiempo real
docker compose logs -f

# Ver logs solo de la API
docker compose logs -f api

# Reiniciar un contenedor
docker compose restart api
docker compose restart nginx

# Detener todo
docker compose down

# Actualizar cuando hay cambios en el código
git pull
docker compose build nginx          # si solo cambiaron archivos estáticos
docker compose build api            # si cambiaron archivos de api/
docker compose up -d

# Ver uso de disco
df -h
du -sh public/uploads/ api/db/
```

---

## Respaldos

```bash
# Hacer un respaldo manual
./backup.sh

# Ver los respaldos existentes
ls -lh backups/

# Restaurar un respaldo
tar -xzf backups/backup_FECHA.tar.gz
```

Para respaldos automáticos diarios, agregar al crontab del CT:

```bash
crontab -e
# Agregar:
0 3 * * * /root/casalamorenita/backup.sh >> /var/log/backup.log 2>&1
```

---

## Estructura del proyecto

```
casalamorenita/
├── Dockerfile              ← API Node.js (multi-stage)
├── Dockerfile.nginx        ← Nginx (archivos estáticos)
├── docker-compose.yml      ← Orquestación de contenedores
├── nginx-docker.conf       ← Configuración Nginx para Docker
├── deploy.sh               ← Script de despliegue en 1 paso
├── backup.sh               ← Script de respaldo
├── .env                    ← ¡NUNCA subir a Git! (generado en deploy)
│
├── index.html              ← Sitio público
├── css/  js/  images/      ← Assets estáticos
├── admin/                  ← Panel de administración
│
├── api/
│   ├── server.js
│   ├── db/
│   │   └── lamorenita.sqlite   ← BD persistida via bind mount
│   └── routes/ jobs/
│
└── public/
    ├── uploads/gallery/    ← Fotos subidas, persistidas via bind mount
    └── cache/              ← Feed social, persistido via bind mount
```

---

## Solución de problemas

| Síntoma | Comando | Solución |
|---|---|---|
| Contenedor no inicia | `docker compose logs api` | Ver error en logs |
| Error 502 Bad Gateway | `docker compose ps` | API caída → `docker compose restart api` |
| Error al subir fotos | `ls -la public/uploads/` | `chmod -R 777 public/uploads/` |
| Sitio no carga | `docker compose ps nginx` | `docker compose restart nginx` |
| Sin espacio en disco | `df -h` y `du -sh public/uploads/` | Limpiar fotos antiguas o aumentar disco |
| JWT expirado (admin redirige) | — | Limpiar localStorage en F12 → Application |

---

## Firewall básico (opcional pero recomendado)

```bash
apk add --no-cache iptables
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -P INPUT DROP
/etc/init.d/iptables save
rc-update add iptables default
```

> Con Cloudflare, el puerto 443 no necesita abrirse en el CT porque Cloudflare habla HTTP con el CT.
