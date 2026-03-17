# Arquitectura y Decisiones Técnicas
## Fundación Hogar La Morenita

Este documento explica **por qué** se tomó cada decisión técnica del proyecto, considerando siempre la restricción principal: un CT con **512 MB de RAM, 1 vCore y 10 GB de disco**.

---

## La filosofía central: "Static-First + Micro API"

La pregunta más importante al diseñar este sistema fue:

> *¿Qué tiene que procesar el servidor en cada visita al sitio?*

La respuesta ideal es: **lo menos posible**.

Cuando alguien abre `lamorenita.com`, el 95% de lo que necesita son archivos que nunca cambian: el HTML, el CSS, las imágenes, el JavaScript. Estos archivos no necesitan ninguna lógica de servidor — solo leerlos del disco y enviarlos. Para eso, Nginx es imbatible y usa apenas ~5 MB de RAM.

Node.js solo entra en acción cuando hay una operación real que requiere lógica: subir una foto, enviar un mensaje de contacto, hacer login en el admin. Eso representa menos del 5% del tráfico total.

```
Visitante abre el sitio
        │
        ▼
    Nginx (5 MB RAM)
        │
        ├── HTML, CSS, JS, imágenes ──► responde directo (0 Node.js)
        │
        └── /api/* ──────────────────► Node.js (82 MB RAM)
```

Esto significa que aunque lleguen 100 personas al mismo tiempo a ver el sitio, Node.js no se entera. Solo se activa cuando alguien llena el formulario o el admin sube una foto.

---

## Sistema Operativo: Alpine Linux

### ¿Por qué Alpine y no Ubuntu?

| | Alpine | Ubuntu 22.04 |
|---|---|---|
| RAM base del SO | ~50 MB | ~200 MB |
| Tamaño de imagen | ~5 MB | ~200 MB |
| Disco base | ~130 MB | ~2 GB |

Con 512 MB de RAM totales, Ubuntu consume el 40% solo para existir. Alpine consume el 10%, dejando mucho más margen para la aplicación.

### La trampa de Alpine: musl libc

Alpine usa `musl libc` en lugar de `glibc` (que usa Ubuntu). Esto tiene una consecuencia importante: **los binarios compilados en Windows o Ubuntu no funcionan en Alpine**. Por eso al copiar `node_modules` desde Windows con SCP falló `better-sqlite3` — estaba compilado para Windows y Alpine no lo podía ejecutar. La solución fue reinstalar con `npm install` directamente en el CT, para que se compilara en Alpine.

### OpenRC en lugar de systemd

Alpine usa OpenRC como gestor de servicios. Los comandos son distintos a Ubuntu:
- Ubuntu: `systemctl start nginx`
- Alpine: `rc-service nginx start`

El comportamiento es el mismo — solo cambia la sintaxis.

---

## Servidor web: Nginx

### ¿Por qué Nginx y no dejar que Node.js sirva todo?

Node.js puede servir archivos estáticos, pero no es su fuerte. Nginx está construido específicamente para eso y es extraordinariamente eficiente:

- Sirve miles de archivos simultáneamente con un consumo de RAM casi constante (~5 MB)
- Maneja la compresión gzip automáticamente
- Aplica cabeceras de caché sin código adicional
- Protege a Node.js de recibir tráfico innecesario

### ¿Qué hace exactamente Nginx en este proyecto?

```nginx
# Archivos estáticos → los sirve Nginx directamente
location ~* \.(css|js|webp|jpg|png)$ {
    expires 30d;   # El navegador los guarda 30 días, no los pide de nuevo
}

# Solo /api/* llega a Node.js
location /api/ {
    proxy_pass http://127.0.0.1:3000;
}
```

El `try_files $uri $uri/ /index.html` es importante: si alguien llega a `/admin/panel`, Nginx busca ese archivo, no lo encuentra, y sirve `index.html`. Esto permite que Alpine.js maneje la navegación del admin sin necesitar rutas del servidor.

### ¿Por qué Nginx escucha solo en la IP del CT y no en localhost?

La API de Node.js se configura con `HOST=127.0.0.1`, lo que significa que **solo acepta conexiones desde el mismo servidor**. Nadie desde internet puede acceder directamente al puerto 3000 — toda petición tiene que pasar por Nginx. Esto es una capa de seguridad importante.

---

## Gestión de procesos: PM2

### ¿Por qué PM2?

Node.js es un proceso como cualquier otro. Si falla (un error no manejado, un pico de memoria), simplemente muere y el sitio queda sin API hasta que alguien lo reinicie manualmente.

PM2 resuelve eso:
- **Reinicio automático**: si el proceso muere, PM2 lo levanta de nuevo en segundos
- **Inicio con el servidor**: configurado con OpenRC, si el CT se reinicia, PM2 arranca solo y con él la API
- **Logs persistentes**: guarda los logs de la aplicación para diagnóstico
- **Monitoreo**: `pm2 monit` muestra CPU y RAM en tiempo real

### ¿Por qué `fork` mode y no `cluster`?

PM2 en modo `cluster` puede lanzar múltiples instancias de Node.js para aprovechar múltiples núcleos. Pero el CT tiene **1 vCore** — no hay segundo núcleo que aprovechar. El modo `fork` (una sola instancia) es el correcto para este hardware.

---

## Base de datos: SQLite con better-sqlite3

### ¿Por qué no MySQL o PostgreSQL?

MySQL y PostgreSQL son servidores de base de datos: procesos separados que corren en segundo plano consumiendo recursos constantemente.

| | SQLite | MySQL |
|---|---|---|
| RAM base | 0 MB | ~300 MB |
| Proceso propio | No (es una librería) | Sí |
| Configuración | Ninguna | Compleja |
| Respaldos | Copiar un archivo | `mysqldump` |

MySQL consumiría el 60% de la RAM disponible solo al iniciar, haciendo imposible correr el resto del stack.

SQLite es una librería que vive dentro del proceso de Node.js. No tiene servidor propio, no consume RAM cuando no se usa, y toda la base de datos es un solo archivo (`lamorenita.sqlite`) que se puede respaldar con un simple `cp`.

### ¿Por qué better-sqlite3 y no el paquete `sqlite3`?

Existen dos paquetes populares para SQLite en Node.js:

- `sqlite3`: API asíncrona con callbacks
- `better-sqlite3`: API síncrona

Para una aplicación de esta escala, la API síncrona de `better-sqlite3` es más simple y en realidad más rápida — elimina el overhead de callbacks y Promises para operaciones que son instantáneas a nivel de disco. Una consulta a SQLite típicamente tarda menos de 1ms; no hay ninguna ventaja en hacerla asíncrona.

### El modo WAL

```js
db.pragma('journal_mode = WAL');
```

WAL (Write-Ahead Logging) es un modo de escritura de SQLite que permite que las lecturas y escrituras ocurran simultáneamente sin bloquearse entre sí. Sin WAL, una escritura bloquea todas las lecturas. Importante cuando el admin sube una foto mientras un visitante carga la galería.

---

## API: Fastify en lugar de Express

### ¿Por qué Fastify?

Express es el framework de Node.js más popular, pero Fastify tiene ventajas concretas:

- **2x más rápido** en benchmarks reales (menos overhead por petición)
- **Validación de esquemas** integrada con JSON Schema — si el formulario de contacto llega sin email, Fastify lo rechaza automáticamente antes de llegar al código
- **Logging** integrado con `pino` (muy eficiente, formato JSON)
- **Plugins oficiales** para JWT, CORS, multipart (subida de archivos) — no hay que buscar librerías de terceros

### Validación de esquemas

```js
schema: {
  body: {
    type: 'object',
    required: ['nombre', 'email', 'mensaje'],
    properties: {
      email: { type: 'string', format: 'email' },
      mensaje: { type: 'string', maxLength: 2000 },
    }
  }
}
```

Esto no es solo comodidad — es seguridad. Fastify valida y rechaza datos malformados antes de que lleguen a la base de datos, previniendo inyecciones y payloads maliciosos.

---

## Procesamiento de imágenes: Sharp

### ¿Por qué no guardar las fotos tal como se suben?

Una foto tomada con un celular moderno puede pesar 8-15 MB. Si el admin sube 50 fotos, la galería pesaría 400-750 MB — más de la mitad del disco del CT, y los visitantes esperarían segundos para cargar cada imagen.

Sharp resuelve esto al momento de subir:
1. Redimensiona la imagen a dos tamaños útiles (thumbnail 400px y medium 800px)
2. Convierte a **WebP**, que es 30-50% más liviano que JPEG con igual calidad
3. Elimina el archivo original

Una foto de 8 MB se convierte en un thumbnail de ~40 KB y un medium de ~200 KB.

### ¿Por qué dos tamaños?

- **Thumbnail (400×300)**: para el grid de la galería, donde se ven muchas fotos pequeñas a la vez
- **Medium (800×600)**: para el lightbox/modal, cuando el visitante hace clic en una foto

Cargar la imagen de 800px en el grid sería desperdiciar 4x el ancho de banda necesario.

### libvips — la dependencia del sistema

Sharp no procesa imágenes por sí solo — usa `libvips`, una librería de C extremadamente eficiente. Por eso en Alpine hay que instalar `vips-dev` con `apk`. Sin esa librería del sistema, Sharp no puede compilar y `npm install` falla.

---

## Autenticación: JWT

### ¿Cómo funciona el login del admin?

```
Admin ingresa usuario + contraseña
        │
        ▼
Servidor verifica contraseña con bcrypt
        │
        ▼
Si es correcta → genera un Token JWT firmado
        │
        ▼
El navegador guarda el token en localStorage
        │
        ▼
Cada petición al admin incluye: Authorization: Bearer TOKEN
        │
        ▼
Servidor verifica la firma del token → si es válida, permite la operación
```

### ¿Por qué JWT y no sesiones?

Las sesiones tradicionales requieren que el servidor guarde en memoria qué usuarios están activos. Con JWT, el servidor no guarda nada — toda la información está en el token, firmado con el `JWT_SECRET`. Esto es más eficiente en memoria y funciona perfectamente para un solo administrador.

### ¿Por qué bcrypt para la contraseña?

Bcrypt es un algoritmo de hashing diseñado específicamente para contraseñas. A diferencia de MD5 o SHA256, bcrypt es **intencionalmente lento** (configurable), lo que hace que un ataque de fuerza bruta sea computacionalmente muy costoso. Con `bcrypt.hash(password, 12)`, el factor de costo es 12 — cada verificación toma ~300ms, lo que es imperceptible para un usuario legítimo pero hace los ataques masivos inviables.

---

## Frontend: CSS puro + Alpine.js

### ¿Por qué no React, Vue o Next.js?

Los frameworks modernos de frontend son poderosos pero tienen un costo:

| Framework | Tamaño bundle mínimo | Build step | Complejidad |
|---|---|---|---|
| React + ReactDOM | ~130 KB | Sí (webpack/vite) | Alta |
| Vue 3 | ~90 KB | Sí | Media |
| Alpine.js | **15 KB** | No | Baja |

Para un sitio que es mayormente estático con algunos elementos interactivos (menú móvil, lightbox, formulario), React o Vue son una sobreingenería que añade peso de descarga, tiempo de compilación y complejidad de mantenimiento sin ningún beneficio real.

### ¿Qué hace Alpine.js exactamente en este proyecto?

Alpine.js maneja los elementos que cambian según la interacción del usuario:
- El menú hamburguesa en móvil (abrir/cerrar)
- El lightbox de la galería (mostrar/ocultar, navegar entre fotos)
- El estado del formulario de contacto (enviando/éxito/error)
- Todo el panel de administración (login, vistas, formularios)

Cualquier cosa que no cambia con la interacción del usuario es HTML y CSS estático puro.

### ¿Por qué CSS puro y no Tailwind?

Tailwind requiere un paso de compilación para generar el CSS final. Esto significa:
- Tener Node.js instalado en la máquina de desarrollo para compilar
- Ejecutar el compilador cada vez que se hacen cambios
- Un archivo de configuración adicional

Con CSS puro usando variables (`--primario`, `--acento`, etc.), se obtiene la misma capacidad de theming sin ningún paso de build. Cualquier persona puede abrir `styles.css` y entender o modificar el diseño sin conocer Tailwind.

### ¿Por qué AOS.js para las animaciones?

AOS (Animate On Scroll) detecta cuando un elemento entra en el viewport del navegador y le aplica una animación CSS. Pesa 13 KB y reemplaza decenas de líneas de código JavaScript personalizado con un simple atributo HTML: `data-aos="fade-up"`.

La alternativa sería usar `IntersectionObserver` con animaciones CSS manuales — más trabajo para el mismo resultado.

---

## Feed de redes sociales: caché estático

### ¿Por qué no consultar la API de Facebook en cada visita?

Si cada visitante del sitio disparara una petición a la API de Facebook, habría tres problemas:
1. **Límites de rate**: Facebook limita cuántas peticiones se pueden hacer por hora
2. **Latencia**: la API de Facebook puede tardar 200-800ms en responder, haciendo el sitio lento
3. **Dependencia**: si Facebook tiene un problema, el sitio también lo tiene

La solución es un **cron job** que consulta la API de Facebook cada 6 horas y guarda el resultado en `/public/cache/social_feed.json`. Los visitantes leen ese archivo JSON estático — Nginx lo sirve en menos de 1ms sin tocar Node.js ni Facebook.

```
Cada 6 horas:
Node.js → Facebook API → social_feed.json

Cada visita al sitio:
Navegador → Nginx → social_feed.json  (sin Node.js, sin Facebook)
```

---

## Seguridad en capas

### Capa 1: Nginx solo expone lo necesario

El puerto 3000 de Node.js no es accesible desde internet — solo desde `127.0.0.1` (el propio servidor). Todo el tráfico externo pasa por Nginx en los puertos 80 y 443.

### Capa 2: Validación en la API

Fastify valida todos los datos entrantes contra esquemas JSON antes de procesarlos. Un payload malformado es rechazado automáticamente con un error 400.

### Capa 3: Autenticación JWT en rutas admin

Todas las rutas `/api/admin/*` tienen el decorador `onRequest: [fastify.autenticar]`. Sin un token JWT válido y vigente, la respuesta es siempre 401.

### Capa 4: Contraseñas con bcrypt

Las contraseñas nunca se guardan en texto plano — solo el hash bcrypt. Ni el administrador del servidor puede recuperar la contraseña original leyendo la base de datos.

### Capa 5: Uploads con restricciones

Al subir fotos, el servidor verifica:
- Tipo MIME (solo imágenes)
- Tamaño máximo (8 MB)
- La carpeta de uploads tiene una regla Nginx que impide ejecutar scripts

---

## Resumen de consumo de recursos

| Componente | RAM aprox. | Por qué |
|---|---|---|
| Alpine Linux (SO) | ~50 MB | SO minimalista |
| Nginx | ~5 MB | Solo gestiona conexiones y archivos |
| Node.js + Fastify | ~82 MB | Runtime + dependencias cargadas |
| SQLite | ~0 MB extra | Vive dentro de Node.js |
| **Total** | **~137 MB** | De 512 MB disponibles |
| **Margen libre** | **~375 MB** | Buffer ante picos de tráfico |

El margen de ~375 MB es el colchón ante picos de tráfico. En el peor caso (muchas subidas de fotos simultáneas), Sharp puede usar hasta 100 MB adicionales temporalmente — aún dentro del límite.
