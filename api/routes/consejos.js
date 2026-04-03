'use strict';

const { getDb }       = require('../db/database');
const { limpiarHtml } = require('../utils/sanitizar');

async function consejosRoutes(fastify) {

  /* ── GET /consejos — público ── */
  fastify.get('/consejos', async (_req, reply) => {
    const db   = getDb();
    const rows = db.prepare(
      `SELECT id, titulo, resumen, categoria, creado_en
       FROM consejos WHERE activo = 1 ORDER BY id DESC`
    ).all();
    return reply.send({ ok: true, items: rows });
  });

  /* ── GET /consejos/:id — público ── */
  fastify.get('/consejos/:id', async (req, reply) => {
    const db  = getDb();
    const row = db.prepare(
      `SELECT id, titulo, resumen, contenido, categoria, creado_en
       FROM consejos WHERE id = ? AND activo = 1`
    ).get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'No encontrado.' });
    return reply.send({ ok: true, consejo: row });
  });

  /* ── POST /admin/consejos — admin ── */
  fastify.post('/admin/consejos', {
    onRequest: [fastify.autenticar],
    schema: {
      body: {
        type: 'object',
        required: ['titulo', 'resumen', 'contenido'],
        properties: {
          titulo:    { type: 'string', minLength: 3, maxLength: 150 },
          resumen:   { type: 'string', minLength: 10, maxLength: 300 },
          contenido: { type: 'string', minLength: 20, maxLength: 5000 },
          categoria: { type: 'string', maxLength: 80, default: 'Cuidado General' },
        },
      },
    },
  }, async (req, reply) => {
    const titulo    = limpiarHtml(req.body.titulo);
    const resumen   = limpiarHtml(req.body.resumen);
    const contenido = limpiarHtml(req.body.contenido);
    const categoria = limpiarHtml(req.body.categoria || 'Cuidado General');
    const db = getDb();
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO consejos (titulo, resumen, contenido, categoria) VALUES (?, ?, ?, ?)`
    ).run(titulo, resumen, contenido, categoria);
    return reply.code(201).send({ ok: true, id: lastInsertRowid });
  });

  /* ── PUT /admin/consejos/:id — admin ── */
  fastify.put('/admin/consejos/:id', {
    onRequest: [fastify.autenticar],
    schema: {
      body: {
        type: 'object',
        required: ['titulo', 'resumen', 'contenido'],
        properties: {
          titulo:    { type: 'string', minLength: 3, maxLength: 150 },
          resumen:   { type: 'string', minLength: 10, maxLength: 300 },
          contenido: { type: 'string', minLength: 20, maxLength: 5000 },
          categoria: { type: 'string', maxLength: 80, default: 'Cuidado General' },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const db  = getDb();
    const row = db.prepare(`SELECT id FROM consejos WHERE id = ? AND activo = 1`).get(id);
    if (!row) return reply.code(404).send({ error: 'No encontrado.' });

    const titulo    = limpiarHtml(req.body.titulo);
    const resumen   = limpiarHtml(req.body.resumen);
    const contenido = limpiarHtml(req.body.contenido);
    const categoria = limpiarHtml(req.body.categoria || 'Cuidado General');

    db.prepare(
      `UPDATE consejos SET titulo=?, resumen=?, contenido=?, categoria=? WHERE id=?`
    ).run(titulo, resumen, contenido, categoria, id);
    return reply.send({ ok: true });
  });

  /* ── DELETE /admin/consejos/:id — admin ── */
  fastify.delete('/admin/consejos/:id', {
    onRequest: [fastify.autenticar],
  }, async (req, reply) => {
    const { id } = req.params;
    getDb().prepare(`UPDATE consejos SET activo = 0 WHERE id = ?`).run(id);
    return reply.send({ ok: true });
  });

  /* ── GET /admin/consejos — admin (lista completa) ── */
  fastify.get('/admin/consejos', {
    onRequest: [fastify.autenticar],
  }, async (_req, reply) => {
    const db   = getDb();
    const rows = db.prepare(
      `SELECT id, titulo, resumen, categoria, creado_en
       FROM consejos WHERE activo = 1 ORDER BY id DESC`
    ).all();
    return reply.send({ ok: true, items: rows });
  });
}

module.exports = consejosRoutes;
