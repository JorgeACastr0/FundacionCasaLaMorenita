'use strict';

const { getDb } = require('../db/database');

async function contactoRoutes(fastify) {
  fastify.post('/contacto', {
    schema: {
      body: {
        type: 'object',
        required: ['nombre', 'email', 'asunto', 'mensaje'],
        properties: {
          nombre:   { type: 'string', minLength: 2,  maxLength: 120 },
          email:    { type: 'string', format: 'email' },
          telefono: { type: 'string', maxLength: 30, default: '' },
          asunto:   { type: 'string', minLength: 2,  maxLength: 80 },
          mensaje:  { type: 'string', minLength: 10, maxLength: 2000 },
        },
      },
    },
  }, async (req, reply) => {
    const { nombre, email, telefono, asunto, mensaje } = req.body;
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
