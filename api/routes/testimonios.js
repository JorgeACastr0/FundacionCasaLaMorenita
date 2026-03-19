'use strict';

const { getDb }       = require('../db/database');
const { limpiarHtml } = require('../utils/sanitizar');

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
    const nombre = limpiarHtml(req.body.nombre);
    const cargo  = limpiarHtml(req.body.cargo || 'Familiar de residente');
    const texto  = limpiarHtml(req.body.texto);
    const orden  = Number(req.body.orden) || 0;
    const db = getDb();
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO testimonios (nombre, cargo, texto, orden) VALUES (?, ?, ?, ?)`
    ).run(nombre, cargo, texto, orden);
    return reply.code(201).send({ ok: true, id: lastInsertRowid });
  });

  /* ── PUT /admin/testimonios/:id — admin ── */
  fastify.put('/admin/testimonios/:id', {
    onRequest: [fastify.autenticar],
    schema: {
      body: {
        type: 'object',
        required: ['nombre', 'texto'],
        properties: {
          nombre: { type: 'string', minLength: 2, maxLength: 100 },
          cargo:  { type: 'string', maxLength: 100, default: 'Familiar de residente' },
          texto:  { type: 'string', minLength: 10, maxLength: 600 },
          orden:  { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const nombre = limpiarHtml(req.body.nombre);
    const cargo  = limpiarHtml(req.body.cargo || 'Familiar de residente');
    const texto  = limpiarHtml(req.body.texto);
    const orden  = Number(req.body.orden) || 0;
    const db  = getDb();
    const row = db.prepare(`SELECT id FROM testimonios WHERE id = ? AND activo = 1`).get(id);
    if (!row) return reply.code(404).send({ error: 'No encontrado.' });

    db.prepare(
      `UPDATE testimonios SET nombre=?, cargo=?, texto=?, orden=? WHERE id=?`
    ).run(nombre, cargo, texto, orden, id);
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
