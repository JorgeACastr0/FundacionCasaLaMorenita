'use strict';

require('dotenv').config();

const path    = require('path');
const fastify = require('fastify')({ logger: true });
const cron    = require('node-cron');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';  // solo local; Nginx hace el proxy

/* ── Plugins ─────────────────────────────────────────────────── */
fastify.register(require('@fastify/cors'), {
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost',
});

fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET || 'cambiar-este-secreto-en-produccion',
});

fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 8 * 1024 * 1024,  // 8 MB máximo por foto
    files:    1,
  },
});

// Servir archivos estáticos (solo en desarrollo; en prod Nginx lo hace)
if (process.env.NODE_ENV !== 'production') {
  // Uploads en /uploads/ → public/uploads/
  fastify.register(require('@fastify/static'), {
    root:          path.join(__dirname, '../public/uploads'),
    prefix:        '/uploads/',
    decorateReply: true,
  });
  // Caché social en /cache/ → public/cache/
  fastify.register(require('@fastify/static'), {
    root:          path.join(__dirname, '../public/cache'),
    prefix:        '/cache/',
    decorateReply: false,
  });
  // Todo lo demás (index.html, css/, js/, admin/, imágenes)
  fastify.register(require('@fastify/static'), {
    root:          path.join(__dirname, '..'),
    prefix:        '/',
    decorateReply: false,
  });
}

/* ── Decorator de autenticación ─────────────────────────────── */
fastify.decorate('autenticar', async function (req, reply) {
  try {
    await req.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'No autorizado.' });
  }
});

/* ── Rutas ───────────────────────────────────────────────────── */
fastify.register(require('./routes/contacto'),      { prefix: '/api' });
fastify.register(require('./routes/galeria'),       { prefix: '/api' });
fastify.register(require('./routes/actividades'),   { prefix: '/api' });
fastify.register(require('./routes/configuracion'), { prefix: '/api' });
fastify.register(require('./routes/testimonios'),   { prefix: '/api' });
fastify.register(require('./routes/admin'),         { prefix: '/api' });
fastify.register(require('./routes/consejos'),     { prefix: '/api' });

/* ── Health check ────────────────────────────────────────────── */
fastify.get('/api/health', async () => ({ ok: true, ts: new Date().toISOString() }));

/* ── Cron: sincronizar redes sociales ─────────────────────────
   Ejecuta cada 6 horas si las variables de entorno están configuradas.
   El resultado se guarda en public/cache/social_feed.json
   y Nginx lo sirve directamente sin tocar Node.js.
─────────────────────────────────────────────────────────────── */
if (process.env.FB_PAGE_TOKEN) {
  const { syncSocialFeed } = require('./jobs/social-sync');

  cron.schedule('0 */6 * * *', () => {
    fastify.log.info('Sincronizando feed de redes sociales...');
    syncSocialFeed().catch(err => fastify.log.error(err));
  });

  // Sincronizar al iniciar
  syncSocialFeed().catch(err => fastify.log.warn('Feed inicial no disponible:', err.message));
}

/* ── Arranque ────────────────────────────────────────────────── */
fastify.listen({ port: PORT, host: HOST }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`API corriendo en http://${HOST}:${PORT}`);
});
