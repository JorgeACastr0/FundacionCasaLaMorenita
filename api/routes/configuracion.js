'use strict';

const bcrypt    = require('bcryptjs');
const { getDb } = require('../db/database');

// Claves permitidas en configuración
const CLAVES_PERMITIDAS = new Set([
  'facebook_url', 'instagram_url', 'tiktok_url',
  'whatsapp_num', 'fb_page_token', 'fb_page_id',
  'email_host', 'email_puerto', 'email_usuario', 'email_pass', 'email_remitente',
  'plan_storage_gb',
]);

async function configuracionRoutes(fastify) {

  /* GET /api/admin/configuracion */
  fastify.get('/admin/configuracion', {
    onRequest: [fastify.autenticar],
  }, async (_req, reply) => {
    const db   = getDb();
    const rows = db.prepare(`SELECT clave, valor FROM configuracion`).all();
    const config = Object.fromEntries(rows.map(r => [r.clave, r.valor]));
    return reply.send({ ok: true, config });
  });

  /* POST /api/admin/configuracion */
  fastify.post('/admin/configuracion', {
    onRequest: [fastify.autenticar],
  }, async (req, reply) => {
    const db  = getDb();
    const upsert = db.prepare(
      `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
    );

    const actualizar = db.transaction((datos) => {
      for (const [clave, valor] of Object.entries(datos)) {
        if (CLAVES_PERMITIDAS.has(clave)) {
          upsert.run(clave, String(valor || '').trim());
        }
      }
    });

    actualizar(req.body || {});
    return reply.send({ ok: true });
  });

  /* GET /api/config-publica — sin auth, solo datos para el frontend público */
  fastify.get('/config-publica', async (_req, reply) => {
    const db     = getDb();
    const claves = ['facebook_url', 'instagram_url', 'tiktok_url', 'whatsapp_num'];
    const rows   = db.prepare(
      `SELECT clave, valor FROM configuracion WHERE clave IN (${claves.map(() => '?').join(',')})`
    ).all(...claves);
    const config = Object.fromEntries(rows.map(r => [r.clave, r.valor]));
    return reply.send({ ok: true, config });
  });

  /* GET /api/admin/primer-uso — para saber si hay admins creados */
  fastify.get('/admin/primer-uso', async (_req, reply) => {
    const db    = getDb();
    const total = db.prepare(`SELECT COUNT(*) as n FROM admins`).get().n;
    return reply.send({ primerUso: total === 0 });
  });

  /* POST /api/admin/cambiar-password */
  fastify.post('/admin/cambiar-password', {
    onRequest: [fastify.autenticar],
    schema: {
      body: {
        type: 'object',
        required: ['actual', 'nueva'],
        properties: {
          actual: { type: 'string' },
          nueva:  { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (req, reply) => {
    const { actual, nueva } = req.body;
    const { id }  = req.user;
    const db      = getDb();
    const row     = db.prepare(`SELECT hash_pass FROM admins WHERE id = ?`).get(id);

    if (!row || !(await bcrypt.compare(actual, row.hash_pass))) {
      return reply.code(401).send({ error: 'La contraseña actual no es correcta.' });
    }

    const hash = await bcrypt.hash(nueva, 12);
    db.prepare(`UPDATE admins SET hash_pass = ? WHERE id = ?`).run(hash, id);
    return reply.send({ ok: true });
  });
}

module.exports = configuracionRoutes;
