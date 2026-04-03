'use strict';
/**
 * Script de migración — ejecutar una vez en el servidor:
 *   node api/migrate.js
 *
 * Es seguro correrlo múltiples veces (idempotente).
 */

const { getDb } = require('./db/database');

const db = getDb();

/* ── 1. Tabla consejos (por si acaso la API no reinició aún) ── */
db.exec(`
  CREATE TABLE IF NOT EXISTS consejos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo      TEXT    NOT NULL,
    resumen     TEXT    NOT NULL,
    contenido   TEXT    NOT NULL,
    categoria   TEXT    NOT NULL DEFAULT 'Cuidado General',
    activo      INTEGER NOT NULL DEFAULT 1,
    creado_en   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);
console.log('✔ Tabla consejos verificada.');

/* ── 2. Actualizar redes sociales en configuración ── */
const actualizaciones = [
  ['facebook_url',  'https://www.facebook.com/profile.php?id=100087255922980'],
  ['instagram_url', 'https://www.instagram.com/hogar_casa_la_morenita/'],
];

const upsert = db.prepare(
  `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
   ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
);

actualizaciones.forEach(([clave, valor]) => {
  upsert.run(clave, valor);
  console.log(`✔ ${clave} → ${valor}`);
});

console.log('\n✅ Migración completada.');
