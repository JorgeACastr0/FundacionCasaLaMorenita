'use strict';

const path  = require('path');
const sharp = require('sharp');
const fs    = require('fs');
const { getDb } = require('../db/database');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads/gallery');
const SIZES = [
  { sufijo: 'thumb',  ancho: 400, alto: 300 },
  { sufijo: 'medium', ancho: 800, alto: 600 },
];

async function galeriaRoutes(fastify) {

  /* ── GET /galeria — Listar fotos activas ── */
  fastify.get('/galeria', async (_req, reply) => {
    const db   = getDb();
    const rows = db.prepare(
      `SELECT id, nombre_arch, titulo, categoria, descripcion, creado_en
       FROM galeria WHERE activo = 1 ORDER BY id DESC`
    ).all();

    const items = rows.map(r => ({
      ...r,
      url_thumb:  `/uploads/gallery/${r.nombre_arch}-thumb.webp`,
      url_medium: `/uploads/gallery/${r.nombre_arch}-medium.webp`,
    }));

    return reply.send({ ok: true, items });
  });


  /* ── POST /admin/galeria/subir — Subir foto (admin) ── */
  fastify.post('/admin/galeria/subir', {
    onRequest: [fastify.autenticar],
  }, async (req, reply) => {
    // Leer todas las partes del multipart en una sola pasada
    const campos = {};
    let fileBuffer = null;
    let fileMime   = null;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        fileMime   = part.mimetype;
        fileBuffer = await part.toBuffer();
      } else {
        campos[part.fieldname] = part.value;
      }
    }

    if (!fileBuffer) return reply.code(400).send({ error: 'No se recibió ningún archivo.' });

    const { titulo, categoria, descripcion } = campos;

    if (!titulo) return reply.code(400).send({ error: 'El título es obligatorio.' });

    const tipos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!tipos.includes(fileMime)) {
      return reply.code(415).send({ error: 'Tipo de archivo no permitido.' });
    }

    const buffer   = fileBuffer;
    const nombreId = `foto_${Date.now()}`;

    // Asegurar directorio
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    // Generar versiones WebP
    for (const { sufijo, ancho, alto } of SIZES) {
      await sharp(buffer)
        .resize(ancho, alto, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toFile(path.join(UPLOADS_DIR, `${nombreId}-${sufijo}.webp`));
    }

    const db = getDb();
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO galeria (nombre_arch, titulo, categoria, descripcion)
      VALUES (?, ?, ?, ?)
    `).run(nombreId, titulo.trim(), (categoria || 'general').trim(), (descripcion || '').trim());

    return reply.code(201).send({
      ok:         true,
      id:         lastInsertRowid,
      url_thumb:  `/uploads/gallery/${nombreId}-thumb.webp`,
      url_medium: `/uploads/gallery/${nombreId}-medium.webp`,
    });
  });


  /* ── DELETE /admin/galeria/:id — Eliminar foto ── */
  fastify.delete('/admin/galeria/:id', {
    onRequest: [fastify.autenticar],
  }, async (req, reply) => {
    const { id } = req.params;
    const db     = getDb();
    const row    = db.prepare(`SELECT nombre_arch FROM galeria WHERE id = ?`).get(id);
    if (!row) return reply.code(404).send({ error: 'No encontrado.' });

    // Eliminar archivos físicos del disco
    for (const { sufijo } of SIZES) {
      const filePath = path.join(UPLOADS_DIR, `${row.nombre_arch}-${sufijo}.webp`);
      try { fs.unlinkSync(filePath); } catch { /* ya no existe, ignorar */ }
    }

    // Eliminar registro de la base de datos
    db.prepare(`DELETE FROM galeria WHERE id = ?`).run(id);
    return reply.send({ ok: true });
  });
}

module.exports = galeriaRoutes;
