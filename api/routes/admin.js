'use strict';

const bcrypt       = require('bcryptjs');
const nodemailer   = require('nodemailer');
const fs           = require('fs');
const { getDb }    = require('../db/database');

async function adminRoutes(fastify) {

  /* ── POST /admin/login ── */
  fastify.post('/admin/login', {
    schema: {
      body: {
        type: 'object',
        required: ['usuario', 'password'],
        properties: {
          usuario:  { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { usuario, password } = req.body;
    const db  = getDb();
    const row = db.prepare(`SELECT * FROM admins WHERE usuario = ?`).get(usuario);

    if (!row || !(await bcrypt.compare(password, row.hash_pass))) {
      return reply.code(401).send({ error: 'Credenciales incorrectas.' });
    }

    const token = fastify.jwt.sign({ id: row.id, usuario: row.usuario }, { expiresIn: '24h' });
    return reply.send({ ok: true, token });
  });


  /* ── GET /admin/mensajes — Ver mensajes del formulario ── */
  fastify.get('/admin/mensajes', {
    onRequest: [fastify.autenticar],
  }, async (_req, reply) => {
    const db   = getDb();
    const rows = db.prepare(
      `SELECT * FROM mensajes ORDER BY creado_en DESC LIMIT 100`
    ).all();
    return reply.send({ ok: true, mensajes: rows });
  });


  /* ── PATCH /admin/mensajes/:id/leido — Marcar como leído ── */
  fastify.patch('/admin/mensajes/:id/leido', {
    onRequest: [fastify.autenticar],
  }, async (req, reply) => {
    const { id } = req.params;
    getDb().prepare(`UPDATE mensajes SET leido = 1 WHERE id = ?`).run(id);
    return reply.send({ ok: true });
  });


  /* ── GET /admin/stats — Estadísticas básicas ── */
  fastify.get('/admin/stats', {
    onRequest: [fastify.autenticar],
  }, async (_req, reply) => {
    const db = getDb();

    // Estadísticas de contenido
    const stats = {
      mensajes_total:    db.prepare(`SELECT COUNT(*) as n FROM mensajes`).get().n,
      mensajes_nuevos:   db.prepare(`SELECT COUNT(*) as n FROM mensajes WHERE leido = 0`).get().n,
      fotos_galeria:     db.prepare(`SELECT COUNT(*) as n FROM galeria WHERE activo = 1`).get().n,
      actividades_total: db.prepare(`SELECT COUNT(*) as n FROM actividades WHERE activo = 1`).get().n,
      testimonios_total: db.prepare(`SELECT COUNT(*) as n FROM testimonios WHERE activo = 1`).get().n,
    };

    // Uso de disco del filesystem donde vive el proyecto
    try {
      const disco = fs.statfsSync(process.env.APP_DIR || '/var/www/casalamorenita');
      const totalBytes = disco.blocks  * disco.bsize;
      const libreBytes = disco.bfree   * disco.bsize;
      const usadoBytes = totalBytes - libreBytes;
      const config     = Object.fromEntries(
        db.prepare(`SELECT clave, valor FROM configuracion`).all().map(r => [r.clave, r.valor])
      );
      const planGB = parseFloat(config.plan_storage_gb) || 10;

      stats.disco = {
        usado_bytes:  usadoBytes,
        total_bytes:  totalBytes,
        usado_gb:     +(usadoBytes / 1e9).toFixed(2),
        total_gb:     +(totalBytes / 1e9).toFixed(2),
        plan_gb:      planGB,
        porcentaje:   +((usadoBytes / (planGB * 1e9)) * 100).toFixed(1),
      };
    } catch {
      stats.disco = null;
    }

    return reply.send({ ok: true, stats });
  });


  /* ── POST /admin/mensajes/:id/responder — Enviar email de respuesta ── */
  fastify.post('/admin/mensajes/:id/responder', {
    onRequest: [fastify.autenticar],
    schema: {
      body: {
        type: 'object',
        required: ['para', 'asunto', 'cuerpo'],
        properties: {
          para:   { type: 'string', format: 'email' },
          asunto: { type: 'string', minLength: 1, maxLength: 200 },
          cuerpo: { type: 'string', minLength: 1, maxLength: 5000 },
        },
      },
    },
  }, async (req, reply) => {
    const db     = getDb();
    const config = Object.fromEntries(
      db.prepare(`SELECT clave, valor FROM configuracion`).all().map(r => [r.clave, r.valor])
    );

    const { email_host, email_puerto, email_usuario, email_pass, email_remitente } = config;

    if (!email_host || !email_usuario || !email_pass) {
      return reply.code(422).send({
        error: 'Configura el servidor SMTP en la sección Configuración antes de enviar emails.',
      });
    }

    const transporter = nodemailer.createTransport({
      host:   email_host,
      port:   parseInt(email_puerto) || 587,
      secure: parseInt(email_puerto) === 465,
      auth:   { user: email_usuario, pass: email_pass },
    });

    const { para, asunto, cuerpo } = req.body;

    await transporter.sendMail({
      from:    `"${email_remitente || 'Hogar La Morenita'}" <${email_usuario}>`,
      to:      para,
      subject: asunto,
      text:    cuerpo,
      html:    cuerpo.replace(/\n/g, '<br>'),
    });

    // Marcar como leído al responder
    db.prepare(`UPDATE mensajes SET leido = 1 WHERE id = ?`).run(req.params.id);

    return reply.send({ ok: true });
  });


  /* ── POST /admin/crear-usuario  (solo en primer uso) ── */
  fastify.post('/admin/crear-usuario', async (req, reply) => {
    const db    = getDb();
    const total = db.prepare(`SELECT COUNT(*) as n FROM admins`).get().n;

    // Solo se puede crear el primer usuario sin autenticación
    if (total > 0) {
      return reply.code(403).send({ error: 'Solo se permite durante la configuración inicial.' });
    }

    const { usuario, password } = req.body || {};
    if (!usuario || !password || password.length < 8) {
      return reply.code(400).send({ error: 'usuario y password (mín. 8 caracteres) son requeridos.' });
    }

    const hash = await bcrypt.hash(password, 12);
    db.prepare(`INSERT INTO admins (usuario, hash_pass) VALUES (?, ?)`).run(usuario.trim(), hash);
    return reply.code(201).send({ ok: true, mensaje: 'Administrador creado.' });
  });
}

module.exports = adminRoutes;
