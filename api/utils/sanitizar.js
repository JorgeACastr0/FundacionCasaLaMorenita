'use strict';

/**
 * Sanitización de entradas — defensa en profundidad
 *
 * La primera línea de defensa es Fastify (schema validation).
 * La segunda es SQLite con queries parametrizadas (previene SQL injection).
 * Esta utilidad es la tercera: elimina etiquetas HTML antes de guardar en BD,
 * por si en el futuro algún campo se renderiza sin escaping.
 */

// Elimina etiquetas HTML y recorta espacios
function limpiarHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim();
}

// Solo permite caracteres válidos en un número de teléfono
function soloTelefono(str) {
  if (!str) return '';
  return String(str).replace(/[^0-9+\-\s()]/g, '').slice(0, 30);
}

// Limpia un objeto aplicando limpiarHtml a todos sus valores string
function limpiarObjeto(obj) {
  const limpio = {};
  for (const [k, v] of Object.entries(obj)) {
    limpio[k] = typeof v === 'string' ? limpiarHtml(v) : v;
  }
  return limpio;
}

module.exports = { limpiarHtml, soloTelefono, limpiarObjeto };
