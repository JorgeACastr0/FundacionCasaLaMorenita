'use strict';

const { getDb } = require('../db/database');

async function testimoniosRoutes(fastify) {

  /* ── GET /testimonios — público ── */
  fastify.get('/testimonios', async (_req, reply) => {
    const db   = getDb();
    const rows = db.prepare(
      `SELECT id, nombre, cargo, texto
       FROM testimonios WHERE activo = 1 ORDER BY orden ASC, id ASC`
    ).all();
    return reply.send({ ok: true, items: rows });
  });

  /* ── POST /admin/testimonios — admin ── */
  fastify.post('/admin/testimonios', {
    onRequest: [fastify.autenticar],
    schema: {
      body: {
        type: 'object',
        required: ['nombre', 'texto'],
        properties: {
          nombre: { type: 'string', minLength: 2, maxLength: 100 },
          cargo:  { type: 'string', maxLength: 100, default: 'Familiar de residente' },
          texto:  { type: 'string', minLength: 10, maxLength: 600 },
          orden:  { type: 'integer', default: 0 },
        },
      },
    },
  }, async (req, reply) => {
    const { nombre, cargo, texto, orden } = req.body;
    const db = getDb();
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO testimonios (nombre, cargo, texto, orden) VALUES (?, ?, ?, ?)`
    ).run(nombre.trim(), (cargo || 'Familiar de residente').trim(), texto.trim(), Number(orden) || 0);
    return reply.code(201).send({ ok: true, id: lastInsertRowid });
  });

  /* ── PUT /admin/testimonios/:id — admin ── */
  fastify.put('/admin/testimonios/:id', {
    onRequest: [fastify.autenticar],
  }, async (req, reply) => {
    const { id } = req.params;
    const { nombre, cargo, texto, orden } = req.body || {};
    const db  = getDb();
    const row = db.prepare(`SELECT id FROM testimonios WHERE id = ? AND activo = 1`).get(id);
    if (!row) return reply.code(404).send({ error: 'No encontrado.' });

    db.prepare(
      `UPDATE testimonios SET nombre=?, cargo=?, texto=?, orden=? WHERE id=?`
    ).run(
      nombre.trim(),
      (cargo || 'Familiar de residente').trim(),
      texto.trim(),
      Number(orden) || 0,
      id
    );
    return reply.send({ ok: true });
  });

  /* ── DELETE /admin/testimonios/:id — admin ── */
  fastify.delete('/admin/testimonios/:id', {
    onRequest: [fastify.autenticar],
  }, async (req, reply) => {
    const { id } = req.params;
    getDb().prepare(`UPDATE testimonios SET activo = 0 WHERE id = ?`).run(id);
    return reply.send({ ok: true });
  });
}

module.exports = testimoniosRoutes;
