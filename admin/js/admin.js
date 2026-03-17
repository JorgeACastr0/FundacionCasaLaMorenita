/* ══════════════════════════════════════════════════════════════
   Panel Admin — Hogar La Morenita
══════════════════════════════════════════════════════════════ */

const API = '/api';

function adminApp() {
  return {
    /* ── Estado global ── */
    autenticado:       false,
    adminUsuario:      '',
    token:             null,
    cargando:          false,
    sidebarMovil:      false,
    vista:             'dashboard',
    toastExito:        '',
    toastError:        '',

    /* ── Login ── */
    loginForm:         { usuario: '', password: '' },
    loginError:        '',
    mostrarCrearAdmin: false,
    nuevoAdmin:        { usuario: '', password: '' },

    /* ── Datos ── */
    stats:             {},
    ultimosMensajes:   [],
    galeriaItems:      [],
    galeriaFiltrada:   [],
    filtroCategoria:   '',
    actividades:       [],
    mensajes:          [],
    configForm:        {},
    passForm:          { actual: '', nueva: '' },

    /* ── Subida de foto ── */
    fotoForm:          { titulo: '', categoria: 'general', descripcion: '', archivo: null },
    previewFoto:       null,
    subiendoFoto:      false,
    progresoSubida:    0,

    /* ── Actividades ── */
    actividadForm:     { titulo: '', descripcion: '', categoria: 'Recreación', dia: '', mes: 'Mar' },
    actividadEditando: null,

    /* ── Testimonios ── */
    testimonios:          [],
    testimonioForm:       { nombre: '', cargo: 'Familiar de residente', texto: '', orden: 0 },
    testimonioEditando:   null,

    /* ── Modal confirmación ── */
    modal: { abierto: false, titulo: '', mensaje: '', confirmar: () => {} },

    /* ── Modal email ── */
    emailModal: { abierto: false, msg: null, asunto: '', cuerpo: '', deEmail: '', enviando: false },


    /* ══════════════════════════════════════
       INICIALIZACIÓN
    ══════════════════════════════════════ */
    async iniciar() {
      const token = localStorage.getItem('lm_token');
      if (token) {
        this.token = token;
        const ok = await this.verificarToken();
        if (ok) {
          this.autenticado = true;
          await this.cargarDashboard();
        } else {
          this.cerrarSesion();
        }
      } else {
        await this.verificarPrimerUso();
      }
    },

    async verificarPrimerUso() {
      try {
        const r = await fetch(`${API}/admin/primer-uso`);
        const d = await r.json();
        this.mostrarCrearAdmin = d.primerUso;
      } catch { /* sin conexión, mostrar login normal */ }
    },

    async verificarToken() {
      try {
        const r = await this.req('GET', '/admin/stats');
        if (r.ok) {
          this.stats       = r.stats;
          this.adminUsuario = localStorage.getItem('lm_usuario') || 'Admin';
          return true;
        }
      } catch {}
      return false;
    },


    /* ══════════════════════════════════════
       AUTH
    ══════════════════════════════════════ */
    async login() {
      this.loginError = '';
      this.cargando   = true;
      try {
        const r = await this.req('POST', '/admin/login', this.loginForm);
        if (r.ok) {
          this.token = r.token;
          localStorage.setItem('lm_token',   r.token);
          localStorage.setItem('lm_usuario', this.loginForm.usuario);
          this.adminUsuario = this.loginForm.usuario;
          this.autenticado  = true;
          await this.cargarDashboard();
        } else {
          this.loginError = r.error || 'Credenciales incorrectas.';
        }
      } catch {
        this.loginError = 'No se pudo conectar con el servidor.';
      } finally {
        this.cargando = false;
      }
    },

    async crearAdmin() {
      this.cargando = true;
      try {
        const r = await this.req('POST', '/admin/crear-usuario', this.nuevoAdmin);
        if (r.ok) {
          this.mostrarCrearAdmin = false;
          this.loginForm.usuario  = this.nuevoAdmin.usuario;
          this.mostrarToast('✅ Cuenta creada. Ya puedes ingresar.', 'exito');
        } else {
          this.loginError = r.error;
        }
      } catch {
        this.loginError = 'Error al crear la cuenta.';
      } finally {
        this.cargando = false;
      }
    },

    logout() {
      this.modal = {
        abierto:   true,
        titulo:    'Cerrar sesión',
        mensaje:   '¿Estás seguro de que quieres cerrar sesión?',
        confirmar: () => this.cerrarSesion(),
      };
    },

    cerrarSesion() {
      localStorage.removeItem('lm_token');
      localStorage.removeItem('lm_usuario');
      this.token       = null;
      this.autenticado = false;
    },


    /* ══════════════════════════════════════
       NAVEGACIÓN
    ══════════════════════════════════════ */
    async cambiarVista(nueva) {
      this.vista        = nueva;
      this.sidebarMovil = false;
      switch (nueva) {
        case 'dashboard':    await this.cargarDashboard();    break;
        case 'galeria':      await this.cargarGaleria();      break;
        case 'actividades':  await this.cargarActividades();  break;
        case 'mensajes':     await this.cargarMensajes();     break;
        case 'configuracion': await this.cargarConfig();      break;
        case 'testimonios':  await this.cargarTestimonios();  break;
      }
    },

    async cargarDashboard() {
      try {
        const [sR, mR] = await Promise.all([
          this.req('GET', '/admin/stats'),
          this.req('GET', '/admin/mensajes'),
        ]);
        if (sR.ok) this.stats = sR.stats;
        if (mR.ok) this.ultimosMensajes = mR.mensajes;
      } catch { this.mostrarToast('Error cargando datos.', 'error'); }
    },


    /* ══════════════════════════════════════
       GALERÍA
    ══════════════════════════════════════ */
    async cargarGaleria() {
      try {
        const r = await this.req('GET', '/galeria');
        if (r.ok) {
          this.galeriaItems    = r.items;
          this.galeriaFiltrada = r.items;
        }
      } catch { this.mostrarToast('Error cargando galería.', 'error'); }
    },

    filtrarGaleria() {
      if (!this.filtroCategoria) {
        this.galeriaFiltrada = this.galeriaItems;
      } else {
        this.galeriaFiltrada = this.galeriaItems.filter(
          f => f.categoria === this.filtroCategoria
        );
      }
    },

    seleccionarFoto(event) {
      const file = event.target.files[0];
      if (!file) return;
      this.fotoForm.archivo = file;
      this.previewFoto = URL.createObjectURL(file);
    },

    dropFoto(event) {
      const file = event.dataTransfer?.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      this.fotoForm.archivo = file;
      this.previewFoto = URL.createObjectURL(file);
    },

    async subirFoto() {
      if (!this.fotoForm.archivo) return;
      this.subiendoFoto   = true;
      this.progresoSubida = 10;

      const form = new FormData();
      form.append('file',        this.fotoForm.archivo);
      form.append('titulo',      this.fotoForm.titulo);
      form.append('categoria',   this.fotoForm.categoria);
      form.append('descripcion', this.fotoForm.descripcion);

      try {
        // Simular progreso
        const intervalo = setInterval(() => {
          if (this.progresoSubida < 85) this.progresoSubida += 15;
        }, 300);

        const r = await fetch(`${API}/admin/galeria/subir`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${this.token}` },
          body:    form,
        });
        clearInterval(intervalo);
        this.progresoSubida = 100;

        const data = await r.json();
        if (r.ok) {
          this.mostrarToast('✅ Foto subida correctamente.', 'exito');
          this.resetFotoForm();
          await this.cargarGaleria();
          await this.cargarStats();
        } else {
          this.mostrarToast(data.error || 'Error al subir la foto.', 'error');
        }
      } catch {
        this.mostrarToast('Error de conexión al subir la foto.', 'error');
      } finally {
        this.subiendoFoto   = false;
        this.progresoSubida = 0;
      }
    },

    resetFotoForm() {
      this.fotoForm   = { titulo: '', categoria: 'general', descripcion: '', archivo: null };
      this.previewFoto = null;
    },

    confirmarEliminarFoto(foto) {
      this.modal = {
        abierto:   true,
        titulo:    'Eliminar foto',
        mensaje:   `¿Eliminar "${foto.titulo}" de la galería?`,
        confirmar: () => this.eliminarFoto(foto.id),
      };
    },

    async eliminarFoto(id) {
      try {
        const r = await this.req('DELETE', `/admin/galeria/${id}`);
        if (r.ok) {
          this.mostrarToast('Foto eliminada.', 'exito');
          await this.cargarGaleria();
          await this.cargarStats();
        }
      } catch { this.mostrarToast('Error al eliminar.', 'error'); }
    },


    /* ══════════════════════════════════════
       ACTIVIDADES
    ══════════════════════════════════════ */
    async cargarActividades() {
      try {
        const r = await this.req('GET', '/actividades');
        if (r.ok) this.actividades = r.items;
      } catch { this.mostrarToast('Error cargando actividades.', 'error'); }
    },

    editarActividad(act) {
      this.actividadEditando = act.id;
      this.actividadForm = {
        titulo:      act.titulo,
        descripcion: act.descripcion,
        categoria:   act.categoria,
        dia:         act.dia,
        mes:         act.mes,
      };
    },

    cancelarEdicion() {
      this.actividadEditando = null;
      this.actividadForm = { titulo: '', descripcion: '', categoria: 'Recreación', dia: '', mes: 'Mar' };
    },

    async guardarActividad() {
      this.cargando = true;
      try {
        const metodo  = this.actividadEditando ? 'PUT' : 'POST';
        const ruta    = this.actividadEditando
          ? `/admin/actividades/${this.actividadEditando}`
          : '/admin/actividades';

        const r = await this.req(metodo, ruta, this.actividadForm);
        if (r.ok) {
          this.mostrarToast(
            this.actividadEditando ? 'Actividad actualizada.' : 'Actividad agregada.',
            'exito'
          );
          this.cancelarEdicion();
          await this.cargarActividades();
          await this.cargarStats();
        } else {
          this.mostrarToast(r.error || 'Error al guardar.', 'error');
        }
      } catch { this.mostrarToast('Error de conexión.', 'error'); }
      finally  { this.cargando = false; }
    },

    confirmarEliminarActividad(act) {
      this.modal = {
        abierto:   true,
        titulo:    'Eliminar actividad',
        mensaje:   `¿Eliminar la actividad "${act.titulo}"?`,
        confirmar: () => this.eliminarActividad(act.id),
      };
    },

    async eliminarActividad(id) {
      try {
        const r = await this.req('DELETE', `/admin/actividades/${id}`);
        if (r.ok) {
          this.mostrarToast('Actividad eliminada.', 'exito');
          await this.cargarActividades();
          await this.cargarStats();
        }
      } catch { this.mostrarToast('Error al eliminar.', 'error'); }
    },


    /* ══════════════════════════════════════
       MENSAJES
    ══════════════════════════════════════ */
    async cargarMensajes() {
      try {
        const r = await this.req('GET', '/admin/mensajes');
        if (r.ok) this.mensajes = r.mensajes;
      } catch { this.mostrarToast('Error cargando mensajes.', 'error'); }
    },

    async marcarLeido(msg) {
      try {
        const r = await this.req('PATCH', `/admin/mensajes/${msg.id}/leido`);
        if (r.ok) {
          msg.leido = 1;
          if (this.stats.mensajes_nuevos > 0) this.stats.mensajes_nuevos--;
        }
      } catch { this.mostrarToast('Error al actualizar.', 'error'); }
    },

    async abrirModalEmail(msg) {
      // Cargar config si aún no se cargó (para obtener el email remitente)
      if (!this.configForm.email_usuario) {
        const r = await this.req('GET', '/admin/configuracion');
        if (r.ok) this.configForm = r.config;
      }
      this.emailModal = {
        abierto:   true,
        msg,
        asunto:    `Re: ${msg.asunto}`,
        cuerpo:    '',
        deEmail:   this.configForm.email_usuario || '',
        enviando:  false,
      };
    },

    async enviarEmail() {
      if (!this.emailModal.msg || this.emailModal.enviando) return;
      if (!this.emailModal.cuerpo.trim()) {
        this.mostrarToast('Escribe el cuerpo del mensaje.', 'error');
        return;
      }
      this.emailModal.enviando = true;
      try {
        const r = await this.req('POST', `/admin/mensajes/${this.emailModal.msg.id}/responder`, {
          para:   this.emailModal.msg.email,
          asunto: this.emailModal.asunto,
          cuerpo: this.emailModal.cuerpo,
        });
        if (r.ok) {
          this.mostrarToast('✅ Email enviado correctamente.', 'exito');
          this.emailModal.abierto = false;
          // Marcar como leído en estado local
          const m = this.mensajes.find(x => x.id === this.emailModal.msg.id);
          if (m && !m.leido) { m.leido = 1; if (this.stats.mensajes_nuevos > 0) this.stats.mensajes_nuevos--; }
        } else {
          this.mostrarToast(r.error || 'Error al enviar el email.', 'error');
        }
      } catch { this.mostrarToast('Error de conexión.', 'error'); }
      finally  { this.emailModal.enviando = false; }
    },


    /* ══════════════════════════════════════
       CONFIGURACIÓN
    ══════════════════════════════════════ */
    async cargarConfig() {
      try {
        const r = await this.req('GET', '/admin/configuracion');
        if (r.ok) this.configForm = r.config;
      } catch { this.mostrarToast('Error cargando configuración.', 'error'); }
    },

    async guardarConfig() {
      this.cargando = true;
      try {
        const r = await this.req('POST', '/admin/configuracion', this.configForm);
        if (r.ok) this.mostrarToast('✅ Configuración guardada.', 'exito');
        else      this.mostrarToast(r.error || 'Error al guardar.', 'error');
      } catch { this.mostrarToast('Error de conexión.', 'error'); }
      finally  { this.cargando = false; }
    },

    async cambiarPassword() {
      if (!this.passForm.actual || !this.passForm.nueva) return;
      this.cargando = true;
      try {
        const r = await this.req('POST', '/admin/cambiar-password', {
          actual: this.passForm.actual,
          nueva:  this.passForm.nueva,
        });
        if (r.ok) {
          this.mostrarToast('✅ Contraseña cambiada.', 'exito');
          this.passForm = { actual: '', nueva: '' };
        } else {
          this.mostrarToast(r.error || 'Error al cambiar contraseña.', 'error');
        }
      } catch { this.mostrarToast('Error de conexión.', 'error'); }
      finally  { this.cargando = false; }
    },

    async cargarStats() {
      try {
        const r = await this.req('GET', '/admin/stats');
        if (r.ok) this.stats = r.stats;
      } catch {}
    },


    /* ══════════════════════════════════════
       TESTIMONIOS
    ══════════════════════════════════════ */
    async cargarTestimonios() {
      try {
        const r = await this.req('GET', '/testimonios');
        if (r.ok) this.testimonios = r.items;
      } catch { this.mostrarToast('Error cargando testimonios.', 'error'); }
    },

    editarTestimonio(t) {
      this.testimonioEditando = t.id;
      this.testimonioForm = {
        nombre: t.nombre,
        cargo:  t.cargo,
        texto:  t.texto,
        orden:  t.orden ?? 0,
      };
    },

    cancelarEdicionTestimonio() {
      this.testimonioEditando = null;
      this.testimonioForm = { nombre: '', cargo: 'Familiar de residente', texto: '', orden: 0 };
    },

    async guardarTestimonio() {
      this.cargando = true;
      try {
        const metodo = this.testimonioEditando ? 'PUT' : 'POST';
        const ruta   = this.testimonioEditando
          ? `/admin/testimonios/${this.testimonioEditando}`
          : '/admin/testimonios';

        const r = await this.req(metodo, ruta, this.testimonioForm);
        if (r.ok) {
          this.mostrarToast(
            this.testimonioEditando ? 'Testimonio actualizado.' : 'Testimonio agregado.',
            'exito'
          );
          this.cancelarEdicionTestimonio();
          await this.cargarTestimonios();
          await this.cargarStats();
        } else {
          this.mostrarToast(r.error || 'Error al guardar.', 'error');
        }
      } catch { this.mostrarToast('Error de conexión.', 'error'); }
      finally  { this.cargando = false; }
    },

    confirmarEliminarTestimonio(t) {
      this.modal = {
        abierto:   true,
        titulo:    'Eliminar testimonio',
        mensaje:   `¿Eliminar el testimonio de "${t.nombre}"?`,
        confirmar: () => this.eliminarTestimonio(t.id),
      };
    },

    async eliminarTestimonio(id) {
      try {
        const r = await this.req('DELETE', `/admin/testimonios/${id}`);
        if (r.ok) {
          this.mostrarToast('Testimonio eliminado.', 'exito');
          await this.cargarTestimonios();
          await this.cargarStats();
        }
      } catch { this.mostrarToast('Error al eliminar.', 'error'); }
    },


    /* ══════════════════════════════════════
       HELPERS
    ══════════════════════════════════════ */
    async req(metodo, ruta, body = null) {
      const headers = {};
      if (this.token)  headers['Authorization']  = `Bearer ${this.token}`;
      if (body !== null) headers['Content-Type'] = 'application/json';

      const opts = { method: metodo, headers };
      if (body !== null) opts.body = JSON.stringify(body);

      const r    = await fetch(`${API}${ruta}`, opts);
      const data = await r.json().catch(() => ({}));
      return { ...data, _status: r.status };
    },

    mostrarToast(msg, tipo = 'exito') {
      if (tipo === 'exito') {
        this.toastExito = msg;
        setTimeout(() => { this.toastExito = ''; }, 3500);
      } else {
        this.toastError = msg;
        setTimeout(() => { this.toastError = ''; }, 4500);
      }
    },

    formatFecha(iso) {
      if (!iso) return '';
      try {
        return new Intl.DateTimeFormat('es-CO', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }).format(new Date(iso));
      } catch { return iso; }
    },
  };
}
