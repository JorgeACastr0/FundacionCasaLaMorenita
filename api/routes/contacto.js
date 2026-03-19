'use strict';

const { getDb }                        = require('../db/database');
const { limpiarHtml, soloTelefono }    = require('../utils/sanitizar');

async function contactoRoutes(fastify) {
  fastify.post('/contacto', {
    schema: {
      body: {
        type: 'object',
        required: ['nombre', 'email', 'asunto', 'mensaje'],
        properties: {
          nombre:   { type: 'string', minLength: 2,  maxLength: 120 },
          email:    { type: 'string', format: 'email' },
          telefono: { type: 'string', maxLength: 30, default: '',
                      pattern: '^[0-9+\\-\\s()]*$' },
          asunto:   { type: 'string', minLength: 2,  maxLength: 80 },
          mensaje:  { type: 'string', minLength: 10, maxLength: 2000 },
        },
      },
    },
  }, async (req, reply) => {
    const nombre   = limpiarHtml(req.body.nombre);
    const email    = req.body.email.trim().toLowerCase();
    const telefono = soloTelefono(req.body.telefono);
    const asunto   = limpiarHtml(req.body.asunto);
    const mensaje  = limpiarHtml(req.body.mensaje);
    const db = getDb();

    db.prepare(`
      INSERT INTO mensajes (nombre, email, telefono, asunto, mensaje)
      VALUES (?, ?, ?, ?, ?)
    `).run(nombre, email, telefono || '', asunto, mensaje);

    fastify.log.info(`Nuevo mensaje de ${nombre} <${email}>`);
    return reply.code(201).send({ ok: true, mensaje: 'Mensaje recibido.' });
  });
}

module.exports = contactoRoutes;
