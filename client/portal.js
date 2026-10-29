let usuario = null, csrfPortal = null, ultimaSync = null, bloqueadoPortal = true;
let colaGuardado = Promise.resolve(), tPush = null, tCarga = 0, falloGuardado = false;
let sesionPortal = null, actividadPendiente = false, destinoSesion = null;
let ultimaConsultaHorarios = 0;
const bloqueo = document.createElement('div');
bloqueo.id = 'portalBloqueo';
bloqueo.innerHTML = '<div><h2 id="portalMensaje">Conectando</h2><p id="portalDetalle"></p><button class="btn primario" id="portalReintentar">Reintentar</button><button class="btn" id="portalExportar">Exportar cambios</button></div>';
document.body.appendChild(bloqueo);
function bloquearPortal(mensaje, detalle = '') {
  bloqueadoPortal = true;
  document.body.classList.add('portal-esperando');
  document.querySelector('#portalMensaje').textContent = mensaje;
  document.querySelector('#portalDetalle').textContent = detalle;
  document.querySelector('#portalExportar').hidden = ![...memoriaCarreras.values()].some(x => x.pending);
}
function habilitarPortal() {
  bloqueadoPortal = false;
  document.body.classList.remove('portal-esperando');
}
function registroCarrera(slug) {
  if (!memoriaCarreras.has(slug)) memoriaCarreras.set(slug, {data: null, revision: 0, loaded: false, pending: false, sequence: 0});
  return memoriaCarreras.get(slug);
}
async function apiPortal(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {...options, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000), headers: {
      ...(options.body ? {'Content-Type': 'application/json'} : {}),
      ...(usuario ? {'X-Portal-Account': usuario.account} : {}),
      ...(options.method && options.method !== 'GET' ? {'X-CSRF-Token': csrfPortal} : {}), ...options.headers,
    }});
  } catch {
    bloquearPortal('Sin conexión', 'Los cambios pendientes siguen en esta pestaña. Recuperá la conexión antes de continuar.');
    throw new Error('No se pudo conectar con el servidor.');
  }
  const body = response.status === 204 ? null : await response.json();
  if (body?.code === 'account_changed' || (path === '/api/session' && response.ok && usuario && body.user.account !== usuario.account)) {
    memoriaCarreras.clear(); ST = estadoVacio(); usuario = null;
    bloquearPortal('La cuenta cambió', 'Volvé a abrir el portal con la cuenta actual.');
    location.assign('/');
    throw new Error('La cuenta cambió.');
  }
  if (response.status === 401) {
    destinoSesion = body.login;
    bloquearPortal(body.code === 'reauth_required' ? 'Verificá tu sesión' : 'La sesión terminó', 'Exportá los cambios pendientes antes de continuar.');
    if (![...memoriaCarreras.values()].some(x => x.pending)) location.assign(destinoSesion);
    throw new Error('Es necesario iniciar sesión.');
  }
  if (!response.ok) {
    const error = new Error(body.code === 'revision_conflict' ? 'Hay una versión más nueva en el servidor.' : 'No se pudo completar la operación.');
    error.code = body.code;
    throw error;
  }
  return body;
}
function actualizarPlan(slug, record) {
  const entry = registroCarrera(slug);
  const data = record.data && slug === CARRERA.slug ? sanearEstado(record.data) : record.data;
  if (record.data && !data) throw new Error('El estado guardado no es válido.');
  entry.data = data;
  entry.revision = record.revision;
  entry.loaded = true;
  entry.pending = false;
  if (slug === CARRERA.slug) {
    ST = data ? {...estadoVacio(), ...structuredClone(data)} : estadoVacio();
    aplicarComisionesDe(ST);
    aplicarTextosCarrera();
    render();
    avisarComisionesRetiradas();
  }
  ultimaSync = record.updatedAt ? new Date(record.updatedAt) : null;
  pintarBotonSync();
}
function avisarComisionesRetiradas() {
  const all = todasComs();
  const missing = Object.entries(ST.grilla).filter(([o, key]) => !all.some(c => c.orden === +o && claveCom(c) === key));
  if (missing.length) toast(`${missing.length} comisiones elegidas ya no aparecen en los horarios oficiales. Revisá tu horario.`);
}
async function cargarHorariosServidor(slug) {
  const data = await apiPortal('/api/schedules/' + slug);
  const previous = horariosServidor.get(slug);
  horariosServidor.set(slug, data);
  if (slug === CARRERA.slug && (!previous || previous.hash !== data.hash)) {
    aplicarComisionesDe(ST);
    aplicarTextosCarrera();
    render();
    if (previous && previous.hash !== data.hash) avisarComisionesRetiradas();
  } else if (slug === CARRERA.slug) infoHorarios();
  ultimaConsultaHorarios = Date.now();
}
async function resolverConflicto(slug) {
  return new Promise(resolve => {
    const modal = document.querySelector('#modal'), velo = document.querySelector('#velo');
    modal.innerHTML = `<h3>Hay cambios en otro dispositivo</h3><p>${escHTML(CARRERAS[slug].carrera.nombre)}</p>
      <p>Elegí qué versión conservar. Podés cancelar y exportar tus cambios antes de decidir.</p>
      <button class="btn primario" id="confServidor">Usar la del servidor</button>
      <button class="btn" id="confLocal">Reemplazar con mis cambios</button>
      <button class="btn" id="confCancelar">Cancelar</button>`;
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      velo.removeEventListener('click', background);
      cerrarModal(); resolve(value);
    };
    const background = event => { if (event.target === velo) finish('cancel'); };
    velo.addEventListener('click', background);
    document.querySelector('#confServidor').onclick = () => finish('server');
    document.querySelector('#confLocal').onclick = () => finish('local');
    document.querySelector('#confCancelar').onclick = () => finish('cancel');
    velo.classList.add('abierto');
  });
}
async function guardarCarrera(slug) {
  const entry = registroCarrera(slug);
  if (!entry.loaded || !entry.pending) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    const sequence = entry.sequence, snapshot = structuredClone(entry.data);
    try {
      const saved = await apiPortal('/api/plans/' + slug, {method: 'PUT', body: JSON.stringify({revision: entry.revision, data: snapshot})});
      entry.revision = saved.revision;
      entry.pending = entry.sequence !== sequence;
      ultimaSync = new Date(saved.updatedAt);
      pintarBotonSync();
      return;
    } catch (error) {
      if (error.code !== 'revision_conflict') throw error;
      const remote = await apiPortal('/api/plans/' + slug);
      const choice = await resolverConflicto(slug);
      if (choice === 'cancel') throw new Error('Hay cambios pendientes de resolver.');
      if (choice === 'server') { actualizarPlan(slug, remote); return; }
      entry.revision = remote.revision;
    }
  }
  throw new Error('El plan sigue cambiando en otro dispositivo. Reintentá cuando termine.');
}
function pushRemoto() {
  clearTimeout(tPush);
  colaGuardado = colaGuardado.catch(() => {}).then(async () => {
    for (const [slug, entry] of memoriaCarreras) if (entry.pending) await guardarCarrera(slug);
  }).then(() => { falloGuardado = false; pintarBotonSync(); }, error => { falloGuardado = true; pintarBotonSync(); throw error; });
  return colaGuardado;
}
function programarPush() {
  const entry = registroCarrera(CARRERA.slug);
  entry.pending = true;
  entry.sequence++;
  pintarBotonSync();
  clearTimeout(tPush);
  tPush = setTimeout(() => pushRemoto().catch(error => toast(error.message)), 1000);
}
async function sincronizarAlEntrar() {
  const slug = CARRERA.slug, generation = ++tCarga;
  const entry = registroCarrera(slug);
  await cargarHorariosServidor(slug);
  if (generation !== tCarga || slug !== CARRERA.slug) return;
  if (!entry.loaded) {
    bloquearPortal('Cargando tu planificación');
    const remote = await apiPortal('/api/plans/' + slug);
    if (generation !== tCarga || slug !== CARRERA.slug) return;
    actualizarPlan(slug, remote);
  }
  habilitarPortal();
}
function reconectarSync() {
  if (usuario) sincronizarAlEntrar().catch(error => bloquearPortal('No se pudo cargar la planificación', error.message));
}
function iniciales(nombre) {
  const partes = nombre.split(/\s+/).filter(Boolean);
  const texto = partes.length > 1 ? partes[0][0] + partes.at(-1)[0] : (partes[0] || '?').slice(0, 2);
  return texto.toLocaleUpperCase('es-AR');
}
/* El estado de guardado se muestra aparte del botón de la cuenta: informa sin pedir un clic. */
function pintarBotonSync() {
  const button = document.querySelector('#btnSync');
  button.hidden = false;
  const pending = [...memoriaCarreras.values()].some(x => x.pending);
  const nombre = usuario?.name || 'Cuenta institucional';
  document.querySelector('#avatarIni').textContent = iniciales(nombre);
  button.setAttribute('aria-label', 'Mi cuenta: ' + nombre);
  button.title = usuario ? usuario.email || usuario.name : 'Cuenta institucional';
  document.querySelector('#menuNombre').textContent = nombre;
  document.querySelector('#menuEmail').textContent = usuario?.email || '';
  const [clase, icono, texto] = falloGuardado ? ['aviso', '●', 'Sin guardar'] : pending ? ['', '…', 'Guardando…'] : ultimaSync ? ['ok', '✓', 'Guardado'] : ['', '', ''];
  const estado = document.querySelector('#estadoSync');
  estado.className = 'estado-sync ' + clase;
  estado.innerHTML = texto ? `<span aria-hidden="true">${icono}</span><span class="txt">${texto}</span>` : '';
  document.querySelector('#menuEstado').textContent = falloGuardado ? 'Hay cambios sin guardar.' : pending ? 'Guardando cambios…'
    : ultimaSync ? 'Guardado a las ' + ultimaSync.toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit'}) : 'Sin cambios pendientes.';
}
async function salirPortal(microsoft) {
  try {
    await pushRemoto();
    const result = await apiPortal('/auth/logout', {method: 'POST', body: JSON.stringify({microsoft})});
    memoriaCarreras.clear(); ST = estadoVacio(); usuario = null;
    bloquearPortal('Sesión cerrada');
    location.assign(result.redirect);
  } catch (error) { toast(error.message); }
}
/* Menú de la cuenta con el patrón de menú de WAI-ARIA: flechas, Inicio/Fin, Escape y Tab. */
const botonCuenta = document.querySelector('#btnSync'), menuCuenta = document.querySelector('#menuCuenta');
const itemsMenu = () => [...menuCuenta.querySelectorAll('[role="menuitem"]:not([hidden])')];
function abrirMenuCuenta(foco = 0) {
  pintarBotonSync();
  menuCuenta.hidden = false;
  botonCuenta.setAttribute('aria-expanded', 'true');
  itemsMenu().at(foco)?.focus();
}
function cerrarMenuCuenta(devolverFoco) {
  if (menuCuenta.hidden) return;
  menuCuenta.hidden = true;
  botonCuenta.setAttribute('aria-expanded', 'false');
  if (devolverFoco) botonCuenta.focus();
}
botonCuenta.onclick = () => menuCuenta.hidden ? abrirMenuCuenta() : cerrarMenuCuenta(true);
botonCuenta.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); abrirMenuCuenta(event.key === 'ArrowDown' ? 0 : -1); }
  if (event.key === 'Escape') cerrarMenuCuenta(true);
});
menuCuenta.addEventListener('keydown', event => {
  const items = itemsMenu(), actual = items.indexOf(document.activeElement);
  const destino = {ArrowDown: actual + 1, ArrowUp: actual - 1, Home: 0, End: items.length - 1}[event.key];
  if (destino !== undefined) { event.preventDefault(); items[(destino + items.length) % items.length].focus(); }
  else if (event.key === 'Escape') { event.preventDefault(); cerrarMenuCuenta(true); }
  else if (event.key === 'Tab') cerrarMenuCuenta(false);
});
menuCuenta.addEventListener('click', event => { if (event.target.closest('[role="menuitem"]')) cerrarMenuCuenta(false); });
document.addEventListener('pointerdown', event => { if (!event.target.closest('.menu-cuenta')) cerrarMenuCuenta(false); });
document.querySelector('#syncSubir').onclick = () => pushRemoto().then(() => toast('Planificación guardada')).catch(error => toast(error.message));
document.querySelector('#syncSalir').onclick = () => salirPortal(false);
document.querySelector('#syncSalirMicrosoft').onclick = () => salirPortal(true);
document.addEventListener('click', event => { if (event.target.closest('[data-close-modal]')) cerrarModal(); });
for (const eventName of ['pointerdown', 'keydown', 'touchstart']) {
  document.addEventListener(eventName, event => { if (event.isTrusted && !bloqueadoPortal) actividadPendiente = true; }, {passive: true});
}
document.querySelector('#portalExportar').onclick = () => {
  const data = Object.fromEntries([...memoriaCarreras].filter(([, entry]) => entry.pending).map(([slug, entry]) => [slug, entry.data]));
  for (const [slug, state] of Object.entries(data)) {
    const link = document.createElement('a');
    link.download = 'planificador-' + slug + '.json';
    link.href = URL.createObjectURL(new Blob([JSON.stringify({...state, carrera: slug})], {type: 'application/json'}));
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
};
document.querySelector('#portalReintentar').onclick = () => {
  if (destinoSesion) { location.assign(destinoSesion); return; }
  iniciarPortal().catch(error => bloquearPortal('No se pudo conectar', error.message));
};
async function iniciarPortal() {
  sesionPortal = await apiPortal('/api/session');
  usuario = sesionPortal.user;
  csrfPortal = sesionPortal.csrf;
  await sincronizarAlEntrar();
  await pushRemoto();
  pintarBotonSync();
}
setInterval(async () => {
  if (!usuario || bloqueadoPortal || document.hidden) return;
  try {
    sesionPortal = await apiPortal('/api/session');
    csrfPortal = sesionPortal.csrf;
    if (actividadPendiente) {
      await apiPortal('/api/activity', {method: 'POST', body: '{}'});
      actividadPendiente = false;
    }
    const slug = CARRERA.slug, entry = registroCarrera(slug);
    if (Date.now() - ultimaConsultaHorarios >= 5 * 60_000) await cargarHorariosServidor(slug);
    if (entry.pending) { await pushRemoto(); return; }
    const remote = await apiPortal('/api/plans/' + slug);
    if (slug === CARRERA.slug && !entry.pending && remote.revision > entry.revision) actualizarPlan(slug, remote);
  } catch (error) { if (!bloqueadoPortal) toast(error.message); }
}, 20_000 + Math.floor(Math.random() * 5000));
setInterval(() => {
  if (sesionPortal && !bloqueadoPortal && Date.now() >= Math.min(sesionPortal.expiresAt, sesionPortal.revalidateAt)) {
    apiPortal('/api/session').then(value => { sesionPortal = value; }).catch(() => {});
  }
}, 1000);
addEventListener('offline', () => bloquearPortal('Sin conexión', 'Recuperá la conexión antes de continuar. Los cambios pendientes pueden exportarse.'));
addEventListener('beforeunload', event => {
  if ([...memoriaCarreras.values()].some(x => x.pending)) { event.preventDefault(); event.returnValue = ''; }
});
iniciarPortal().catch(error => bloquearPortal('No se pudo iniciar el portal', error.message));
