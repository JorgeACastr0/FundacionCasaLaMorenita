'use strict';

const path    = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'lamorenita.sqlite');

let _db;

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');  // mejor rendimiento en escrituras
  _db.pragma('foreign_keys = ON');
  inicializar(_db);
  return _db;
}

function inicializar(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mensajes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre    TEXT    NOT NULL,
      email     TEXT    NOT NULL,
      telefono  TEXT,
      asunto    TEXT    NOT NULL,
      mensaje   TEXT    NOT NULL,
      leido     INTEGER NOT NULL DEFAULT 0,
      creado_en TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS galeria (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_arch TEXT    NOT NULL,
      titulo      TEXT    NOT NULL,
      categoria   TEXT    NOT NULL DEFAULT 'general',
      descripcion TEXT,
      activo      INTEGER NOT NULL DEFAULT 1,
      creado_en   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS actividades (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo      TEXT    NOT NULL,
      descripcion TEXT    NOT NULL,
      categoria   TEXT    NOT NULL DEFAULT 'general',
      dia         INTEGER NOT NULL,
      mes         TEXT    NOT NULL,
      activo      INTEGER NOT NULL DEFAULT 1,
      creado_en   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario     TEXT    NOT NULL UNIQUE,
      hash_pass   TEXT    NOT NULL,
      creado_en   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS testimonios (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre      TEXT    NOT NULL,
      cargo       TEXT    NOT NULL DEFAULT 'Familiar de residente',
      texto       TEXT    NOT NULL,
      activo      INTEGER NOT NULL DEFAULT 1,
      orden       INTEGER NOT NULL DEFAULT 0,
      creado_en   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

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

  // Configuración por defecto
  const insConf = db.prepare(
    `INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)`
  );
  insConf.run('facebook_url',  'https://www.facebook.com/profile.php?id=100087255922980');
  insConf.run('instagram_url', 'https://www.instagram.com/hogar_casa_la_morenita/');
  insConf.run('tiktok_url',    'https://www.tiktok.com/');
  insConf.run('whatsapp_num',  '573146403147');
}

module.exports = { getDb };
