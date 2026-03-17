/* ══════════════════════════════════════════════════════════════
   FUNDACIÓN HOGAR LA MORENITA — JavaScript Principal
   ══════════════════════════════════════════════════════════════ */

/* ── Alpine.js: datos globales del sitio ─────────────────────── */
function sitio() {
  return {
    scrolled:   false,
    menuMovil:  false,
    lightbox: {
      abierto: false,
      src:     '',
      alt:     '',
      indice:  0,
    },

    // Lista de imágenes de la galería para navegación con flechas
    _galeriaItems: [],

    init() {
      this._indexarGaleria();

      // Event delegation para items dinámicos de galería (sin Alpine @click)
      const grid = document.getElementById('galeria-grid');
      grid?.addEventListener('click', (e) => {
        const item = e.target.closest('[data-lightbox-src]');
        if (!item) return;
        const allItems = grid.querySelectorAll('[data-lightbox-src]');
        const idx = Array.from(allItems).indexOf(item);
        this._galeriaItems = Array.from(allItems).map(el => ({
          src: el.dataset.lightboxSrc,
          alt: el.dataset.lightboxAlt || '',
        }));
        this.lightbox = {
          abierto: true,
          src:     item.dataset.lightboxSrc,
          alt:     item.dataset.lightboxAlt || '',
          indice:  idx >= 0 ? idx : 0,
        };
        document.body.style.overflow = 'hidden';
      });

      // Cargar contenido dinámico (sin bloquear el render)
      this._cargarGaleria();
      this._cargarActividades();
      this._cargarTestimonios();
      this._cargarConfig();
    },

    handleScroll() {
      this.scrolled = window.scrollY > 60;
    },

    /* Indexa todos los items del grid para el lightbox (items estáticos) */
    _indexarGaleria() {
      const items = document.querySelectorAll('.galeria__item:not([data-lightbox-src])');
      this._galeriaItems = Array.from(items).map(el => ({
        src: el.querySelector('img')?.src || '',
        alt: el.querySelector('.galeria__overlay-titulo')?.textContent || '',
      }));
    },


    /* ══════════════════════════════════════
       CARGA DINÁMICA DESDE API
    ══════════════════════════════════════ */

    /* Galería — reemplaza los items hardcoded si la API tiene fotos */
    async _cargarGaleria() {
      try {
        const res = await fetch('/api/galeria');
        if (!res.ok) return;
        const { items } = await res.json();
        if (!items?.length) return;

        const grid = document.getElementById('galeria-grid');
        if (!grid) return;

        grid.innerHTML = items.map(foto => `
          <div class="galeria__item"
               data-lightbox-src="${foto.url_medium}"
               data-lightbox-alt="${escHtml(foto.titulo)}">
            <img src="${foto.url_thumb}" alt="${escHtml(foto.titulo)}" loading="lazy">
            <div class="galeria__overlay">
              <span class="galeria__overlay-icono">🔍</span>
              <span class="galeria__overlay-titulo">${escHtml(foto.titulo)}</span>
            </div>
          </div>
        `).join('');
      } catch { /* red caída: mantiene fotos hardcoded */ }
    },

    /* Actividades — reemplaza las tarjetas hardcoded si la API tiene datos */
    async _cargarActividades() {
      try {
        const res = await fetch('/api/actividades');
        if (!res.ok) return;
        const { items } = await res.json();
        if (!items?.length) return;

        const container = document.getElementById('actividades-lista');
        if (!container) return;

        container.innerHTML = items.map(act => `
          <div class="actividad__card">
            <div class="actividad__fecha">
              <span class="actividad__dia">${String(act.dia).padStart(2, '0')}</span>
              <span class="actividad__mes">${escHtml(act.mes)}</span>
            </div>
            <div class="actividad__info">
              <h4>${escHtml(act.titulo)}</h4>
              <p>${escHtml(act.descripcion)}</p>
            </div>
            <div class="actividad__categoria">${escHtml(act.categoria)}</div>
          </div>
        `).join('');
      } catch { /* red caída: mantiene actividades hardcoded */ }
    },

    /* Testimonios — reemplaza los slides del Swiper si la API tiene datos */
    async _cargarTestimonios() {
      try {
        const res = await fetch('/api/testimonios');
        if (!res.ok) return;
        const { items } = await res.json();
        if (!items?.length) return;

        const wrapper = document.querySelector('.testimonios-swiper .swiper-wrapper');
        if (!wrapper) return;

        wrapper.innerHTML = items.map(t => {
          const iniciales = t.nombre
            .split(' ')
            .filter(Boolean)
            .map(w => w[0].toUpperCase())
            .slice(0, 2)
            .join('');
          return `
            <div class="swiper-slide">
              <div class="testimonio__card">
                <div class="testimonio__comillas">"</div>
                <p class="testimonio__texto">${escHtml(t.texto)}</p>
                <div class="testimonio__autor">
                  <div class="testimonio__avatar">${iniciales}</div>
                  <div>
                    <strong>${escHtml(t.nombre)}</strong>
                    <span>${escHtml(t.cargo)}</span>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('');

        // Reiniciar Swiper con el nuevo contenido
        if (_swiperTestimonios) {
          _swiperTestimonios.destroy(true, true);
        }
        _swiperTestimonios = _crearSwiperTestimonios();
      } catch { /* red caída: mantiene testimonios hardcoded */ }
    },

    /* Config pública — actualiza todos los links de redes sociales y WhatsApp */
    async _cargarConfig() {
      try {
        const res = await fetch('/api/config-publica');
        if (!res.ok) return;
        const { config } = await res.json();

        const { facebook_url, instagram_url, tiktok_url, whatsapp_num } = config;

        if (facebook_url) {
          document.querySelectorAll('[data-social="facebook"]')
            .forEach(el => { el.href = facebook_url; });
        }
        if (instagram_url) {
          document.querySelectorAll('[data-social="instagram"]')
            .forEach(el => { el.href = instagram_url; });
        }
        if (tiktok_url) {
          document.querySelectorAll('[data-social="tiktok"]')
            .forEach(el => { el.href = tiktok_url; });
        }
        if (whatsapp_num) {
          const msg = encodeURIComponent('Hola, quisiera información sobre Casa Hogar La Morenita.');
          const waUrl = `https://api.whatsapp.com/send?phone=${whatsapp_num}&text=${msg}`;
          document.querySelectorAll('[data-social="whatsapp"]')
            .forEach(el => { el.href = waUrl; });
        }
      } catch { /* red caída: mantiene links hardcoded */ }
    },


    /* ══════════════════════════════════════
       LIGHTBOX
    ══════════════════════════════════════ */
    abrirLightbox(src, alt) {
      const idx = this._galeriaItems.findIndex(i => i.src.includes(src.split('/').pop()));
      this.lightbox = {
        abierto: true,
        src,
        alt,
        indice: idx >= 0 ? idx : 0,
      };
      document.body.style.overflow = 'hidden';
    },

    cerrarLightbox() {
      this.lightbox.abierto = false;
      document.body.style.overflow = '';
    },

    navegarLightbox(direccion) {
      const total = this._galeriaItems.length;
      if (!total) return;
      const nuevo = (this.lightbox.indice + direccion + total) % total;
      const item  = this._galeriaItems[nuevo];
      this.lightbox.src    = item.src;
      this.lightbox.alt    = item.alt;
      this.lightbox.indice = nuevo;
    },


    /* ══════════════════════════════════════
       FORMULARIO DE CONTACTO
    ══════════════════════════════════════ */
    async enviarFormulario(event) {
      const form    = event.target;
      const btnText = form.querySelector('.btn-texto');
      const btnLoad = form.querySelector('.btn-cargando');
      const exito   = document.getElementById('form-exito');
      const error   = document.getElementById('form-error');

      btnText.style.display = 'none';
      btnLoad.style.display = 'inline';
      form.querySelector('#btn-enviar').disabled = true;

      const data = {
        nombre:   form.nombre.value.trim(),
        email:    form.email.value.trim(),
        telefono: form.telefono.value.trim(),
        asunto:   form.asunto.value,
        mensaje:  form.mensaje.value.trim(),
      };

      try {
        const res = await fetch('/api/contacto', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(data),
        });

        if (res.ok) {
          form.reset();
          exito.style.display = 'block';
          error.style.display = 'none';
        } else {
          throw new Error('Error del servidor');
        }
      } catch {
        exito.style.display = 'none';
        error.style.display = 'block';
      } finally {
        btnText.style.display = 'inline';
        btnLoad.style.display = 'none';
        form.querySelector('#btn-enviar').disabled = false;
      }
    },
  };
}


/* ── Inicialización ──────────────────────────────────────────── */
let _swiperTestimonios = null;

document.addEventListener('DOMContentLoaded', () => {
  initAOS();
  _swiperTestimonios = _crearSwiperTestimonios();
  initContadores();
  cargarFeedSocial();
  marcarNavActivo();
});


/* ── AOS (Animate On Scroll) ─────────────────────────────────── */
function initAOS() {
  if (typeof AOS === 'undefined') return;
  AOS.init({
    duration: 700,
    once:     true,
    offset:   80,
    easing:   'ease-out-cubic',
  });
}


/* ── Swiper testimonios ──────────────────────────────────────── */
function _crearSwiperTestimonios() {
  if (typeof Swiper === 'undefined') return null;
  return new Swiper('.testimonios-swiper', {
    slidesPerView:  1,
    spaceBetween:   24,
    loop:           true,
    autoplay: {
      delay:                4500,
      disableOnInteraction: false,
    },
    pagination: {
      el:        '.testimonios-swiper .swiper-pagination',
      clickable: true,
    },
    breakpoints: {
      640: { slidesPerView: 2 },
    },
  });
}


/* ── Contadores animados ─────────────────────────────────────── */
function initContadores() {
  const elementos = document.querySelectorAll('[data-contador]');
  if (!elementos.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el     = entry.target;
      const meta   = parseInt(el.dataset.contador, 10);
      const dur    = 1800;
      const inicio = performance.now();

      function animar(ahora) {
        const prog = Math.min((ahora - inicio) / dur, 1);
        const ease = 1 - Math.pow(1 - prog, 3);
        el.textContent = Math.round(ease * meta);
        if (prog < 1) requestAnimationFrame(animar);
      }

      requestAnimationFrame(animar);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });

  elementos.forEach(el => observer.observe(el));
}


/* ── Feed de redes sociales ──────────────────────────────────── */
async function cargarFeedSocial() {
  const contenedor  = document.getElementById('social-feed');
  const placeholder = document.getElementById('social-placeholder');
  if (!contenedor) return;

  try {
    const res   = await fetch('/cache/social_feed.json');
    if (!res.ok) throw new Error('Sin feed');
    const datos = await res.json();
    const posts = datos.posts || [];

    if (!posts.length) throw new Error('Feed vacío');

    if (placeholder) placeholder.remove();

    posts.slice(0, 6).forEach(post => {
      const el = document.createElement('div');
      el.className = 'redes__post';
      el.innerHTML = `
        ${post.imagen ? `<div class="redes__post-imagen"><img src="${post.imagen}" alt="Post" loading="lazy"></div>` : ''}
        <div class="redes__post-cuerpo">
          <p class="redes__post-texto">${escHtml(post.texto)}</p>
          <p class="redes__post-fecha">${formatearFecha(post.fecha)}</p>
        </div>
      `;
      contenedor.appendChild(el);
    });

  } catch {
    if (placeholder) {
      placeholder.innerHTML = `
        <p>Síguenos en nuestras redes sociales para ver los últimos momentos especiales.</p>
      `;
    }
  }
}


/* ── Resaltar enlace activo en navbar ────────────────────────── */
function marcarNavActivo() {
  const secciones = document.querySelectorAll('section[id]');
  const enlaces   = document.querySelectorAll('.navbar__links a[href^="#"]');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        enlaces.forEach(a => a.classList.remove('activo'));
        const link = document.querySelector(`.navbar__links a[href="#${entry.target.id}"]`);
        if (link) link.classList.add('activo');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  secciones.forEach(s => observer.observe(s));
}


/* ── Utilidades ──────────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatearFecha(iso) {
  try {
    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
