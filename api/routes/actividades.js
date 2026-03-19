'use strict';

const { getDb }        = require('../db/database');
const { limpiarHtml }  = require('../utils/sanitizar');

async function actividadesRoutes(fastify) {

  /* GET /api/actividades — público */
  fastify.get('/actividades', async (_req, reply) => {
    const db   = getDb();
    const rows = db.prepare(
      `SELECT * FROM actividades WHERE activo = 1 ORDER BY id DESC`
    ).all();
    return reply.send({ ok: true, items: rows });
  });

  /* POST /api/admin/actividades — admin */
  fastify.post('/admin/actividades', {
    onRequest: [fastify.autenticar],
    schema: {
      body: {
        type: 'object',
        required: ['titulo', 'descripcion'],
        properties: {
          titulo:      { type: 'string', minLength: 2, maxLength: 120 },
          descripcion: { type: 'string', minLength: 5, maxLength: 500 },
          categoria:   { type: 'string', maxLength: 60, default: 'General' },
          dia:         { type: 'integer', default: 1 },
          mes:         { type: 'string', maxLength: 10, default: 'Ene' },
        },
      },
    },
  }, async (req, reply) => {
    const titulo      = limpiarHtml(req.body.titulo);
    const descripcion = limpiarHtml(req.body.descripcion);
    const categoria   = limpiarHtml(req.body.categoria || 'General');
    const dia         = Number(req.body.dia) || 1;
    const mes         = limpiarHtml(req.body.mes || 'Ene');
    const db = getDb();
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO actividades (titulo, descripcion, categoria, dia, mes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(titulo, descripcion, categoria, dia, mes);
    return reply.code(201).send({ ok: true, id: lastInsertRowid });
  });

  /* PUT /api/admin/actividades/:id — admin */
  fastify.put('/admin/actividades/:id', {
    onRequest: [fastify.autenticar],
    schema: {
      body: {
        type: 'object',
        required: ['titulo', 'descripcion'],
        properties: {
          titulo:      { type: 'string', minLength: 2, maxLength: 120 },
          descripcion: { type: 'string', minLength: 5, maxLength: 500 },
          categoria:   { type: 'string', maxLength: 60, default: 'General' },
          dia:         { type: 'integer', minimum: 1, maximum: 31, default: 1 },
          mes:         { type: 'string', maxLength: 10, default: 'Ene' },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const titulo      = limpiarHtml(req.body.titulo);
    const descripcion = limpiarHtml(req.body.descripcion);
    const categoria   = limpiarHtml(req.body.categoria || 'General');
    const dia         = Number(req.body.dia) || 1;
    const mes         = limpiarHtml(req.body.mes || 'Ene');
    const db  = getDb();
    const row = db.prepare(`SELECT id FROM actividades WHERE id = ? AND activo = 1`).get(id);
    if (!row) return reply.code(404).send({ error: 'No encontrado.' });

    db.prepare(
      `UPDATE actividades SET titulo=?, descripcion=?, categoria=?, dia=?, mes=? WHERE id=?`
    ).run(titulo, descripcion, categoria, dia, mes, id);

    return reply.send({ ok: true });
  });

  /* DELETE /api/admin/actividades/:id — admin */
  fastify.delete('/admin/actividades/:id', {
    onRequest: [fastify.autenticar],
  }, async (req, reply) => {
    const { id } = req.params;
    getDb().prepare(`UPDATE actividades SET activo = 0 WHERE id = ?`).run(id);
    return reply.send({ ok: true });
  });
}

module.exports = actividadesRoutes;
