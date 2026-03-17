'use strict';

/**
 * Sincronización de redes sociales.
 * Requiere en .env:
 *   FB_PAGE_TOKEN   — token de la página de Facebook (Meta Graph API)
 *   FB_PAGE_ID      — ID numérico de la página de Facebook
 *
 * El JSON resultante se escribe en public/cache/social_feed.json
 * y Nginx lo sirve como archivo estático (0 carga en Node.js por visita).
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CACHE_PATH = path.join(__dirname, '../../public/cache/social_feed.json');

async function syncSocialFeed() {
  const token  = process.env.FB_PAGE_TOKEN;
  const pageId = process.env.FB_PAGE_ID;
  if (!token || !pageId) return;

  const posts = await obtenerPostsFacebook(token, pageId);

  const feed = {
    actualizado: new Date().toISOString(),
    posts,
  };

  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(feed, null, 2), 'utf8');
  console.log(`[social-sync] Feed actualizado con ${posts.length} publicaciones.`);
}

function obtenerPostsFacebook(token, pageId) {
  return new Promise((resolve, reject) => {
    const campos = 'id,message,full_picture,created_time';
    const url = `https://graph.facebook.com/v18.0/${pageId}/posts?fields=${campos}&limit=6&access_token=${token}`;

    https.get(url, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message));

          const posts = (json.data || []).map(p => ({
            id:     p.id,
            texto:  p.message || '',
            imagen: p.full_picture || null,
            fecha:  p.created_time,
            red:    'facebook',
          }));
          resolve(posts);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

module.exports = { syncSocialFeed };
