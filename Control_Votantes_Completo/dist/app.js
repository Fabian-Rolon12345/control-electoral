(() => {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const hasSupabase = !cfg.DEMO_MODE && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase;
  const db = hasSupabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const digits = (value = '') => String(value).replace(/\D/g, '');
  const normalized = (value = '') => String(value).trim().toLocaleLowerCase('es');
  const initials = (name = '') => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const fmtTime = (value) => value ? new Date(value).toLocaleString('es-PY', {dateStyle:'short', timeStyle:'short'}) : '—';
  const PAGE_SIZE = 50;

  const state = {user:null, profiles:[], votantes:[], lista:[], channel:null, voterPage:1, listPage:1};

  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove('show'), 3000);
  }
  function isAdmin() { return state.user?.rol === 'admin'; }
  function listRecord(voterId) { return state.lista.find((row) => row.votante_id === voterId); }

  async function fetchAll(table, order = 'nombre') {
    const rows = [], size = 1000;
    for (let from = 0; ; from += size) {
      const {data, error} = await db.from(table).select('*').order(order).range(from, from + size - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < size) break;
    }
    return rows;
  }
  async function loadAll() {
    const requests = [fetchAll('perfiles'), fetchAll('votantes')];
    if (isAdmin()) requests.push(fetchAll('mis_votantes', 'creado_en'));
    const [profiles, voters, list = []] = await Promise.all(requests);
    state.profiles = profiles; state.votantes = voters; state.lista = list;
  }
  async function login(email, password) {
    if (!hasSupabase) throw new Error('La conexión con Supabase no está configurada.');
    const {data, error} = await db.auth.signInWithPassword({email, password});
    if (error) throw error;
    const {data:profile, error:profileError} = await db.from('perfiles').select('*').eq('id', data.user.id).single();
    if (profileError || !profile?.activo) throw new Error('No se encontró un perfil activo para esta cuenta.');
    state.user = profile; await loadAll(); subscribeRealtime(); enterApp();
  }
  function subscribeRealtime() {
    if (state.channel) db.removeChannel(state.channel);
    state.channel = db.channel('control-electoral-en-vivo')
      .on('postgres_changes', {event:'*', schema:'public', table:'votantes'}, refreshData)
      .on('postgres_changes', {event:'*', schema:'public', table:'mis_votantes'}, refreshData)
      .on('postgres_changes', {event:'*', schema:'public', table:'perfiles'}, refreshData).subscribe();
  }
  async function refreshData() {
    try { await loadAll(); renderAll(); }
    catch (error) { console.warn('No se pudo actualizar en tiempo real:', error.message); }
  }
  function enterApp() {
    $('#login-view').classList.add('hidden'); $('#app-view').classList.remove('hidden');
    $('#side-name').textContent = state.user.nombre;
    $('#side-role').textContent = isAdmin() ? 'Administrador general' : 'Perfil de consulta';
    $('#avatar').textContent = initials(state.user.nombre);
    $$('[data-admin]').forEach((element) => element.classList.toggle('hidden', !isAdmin()));
    renderAll();
    const saved = localStorage.getItem('control-electoral-page') || (isAdmin() ? 'dashboard' : 'votantes');
    navigate(!isAdmin() && saved !== 'votantes' ? 'votantes' : saved);
  }
  function renderAll() {
    if (isAdmin()) { renderStats(); renderSummary(); renderActivity(); renderMyList(); renderManagers(); }
    renderVoters();
  }
  function renderStats() {
    const active = state.lista.filter((row) => row.estado_lista === 'agregado');
    const voterMap = new Map(state.votantes.map((voter) => [voter.id, voter]));
    const voted = active.filter((row) => voterMap.get(row.votante_id)?.voto_confirmado).length;
    $('#stat-total').textContent = active.length; $('#stat-voted').textContent = voted;
    $('#stat-pending').textContent = active.length - voted;
    $('#stat-percent').textContent = `${active.length ? Math.round(voted / active.length * 100) : 0}% de mi lista`;
    $('#stat-excluded').textContent = state.lista.filter((row) => row.estado_lista === 'excluido').length;
    $('#update-time').textContent = `Actualizado ${new Date().toLocaleTimeString('es-PY', {hour:'2-digit', minute:'2-digit'})}`;
  }
  function renderSummary() {
    const active = state.lista.filter((row) => row.estado_lista === 'agregado');
    const voterMap = new Map(state.votantes.map((voter) => [voter.id, voter]));
    const voted = active.filter((row) => voterMap.get(row.votante_id)?.voto_confirmado).length;
    const transferOk = active.filter((row) => row.traslado_ok).length;
    const votePercent = active.length ? Math.round(voted / active.length * 100) : 0;
    const transferPercent = active.length ? Math.round(transferOk / active.length * 100) : 0;
    $('#list-progress').innerHTML = `<div class="progress-row"><div class="progress-meta"><strong>Votos confirmados</strong><span>${voted} de ${active.length} · ${votePercent}%</span></div><div class="progress-track"><i style="width:${votePercent}%"></i></div></div><div class="progress-row"><div class="progress-meta"><strong>Traslados completados</strong><span>${transferOk} de ${active.length} · ${transferPercent}%</span></div><div class="progress-track"><i style="width:${transferPercent}%"></i></div></div>`;
  }
  function renderActivity() {
    const activeIds = new Set(state.lista.filter((row) => row.estado_lista === 'agregado').map((row) => row.votante_id));
    const recent = state.votantes.filter((voter) => voter.voto_confirmado && activeIds.has(voter.id)).sort((a, b) => new Date(b.voto_hora) - new Date(a.voto_hora)).slice(0, 8);
    $('#recent-activity').innerHTML = recent.map((voter) => `<div class="activity-item"><span class="activity-icon">✓</span><div><strong>${esc(voter.nombre)} confirmó su voto</strong><span>${fmtTime(voter.voto_hora)}</span></div></div>`).join('') || '<div class="empty">Sin actividad reciente en tu lista.</div>';
  }
  function filteredVoters() {
    const query = normalized($('#voter-search').value), queryDigits = digits(query), status = $('#filter-status').value;
    return state.votantes.filter((voter) => (!query || normalized(voter.nombre).includes(query) || (queryDigits && digits(voter.cedula).includes(queryDigits))) && (!status || (status === 'voted' ? voter.voto_confirmado : !voter.voto_confirmado)));
  }
  function renderLookupResult(list) {
    const box = $('#lookup-result'), query = $('#voter-search').value.trim();
    if (!query) { box.className = 'lookup-result hidden'; box.innerHTML = ''; return; }
    const exact = digits(query).length >= 4 ? list.find((voter) => digits(voter.cedula) === digits(query)) : null;
    if (exact) {
      box.className = `lookup-result ${exact.voto_confirmado ? 'already-voted' : 'not-voted'}`;
      box.innerHTML = `<span class="lookup-icon">${exact.voto_confirmado ? '✓' : '◷'}</span><div><small>Resultado por cédula</small><strong>${exact.voto_confirmado ? 'YA VOTÓ' : 'TODAVÍA NO VOTÓ'}</strong><p>${esc(exact.nombre)} · C.I. ${esc(exact.cedula)}</p></div>`;
    } else if (!list.length) {
      box.className = 'lookup-result not-found'; box.innerHTML = '<span class="lookup-icon">!</span><div><small>Sin coincidencias</small><strong>NO ESTÁ EN EL SISTEMA</strong><p>Revisá la cédula o el nombre.</p></div>';
    } else {
      box.className = 'lookup-result matches'; box.innerHTML = `<span class="lookup-icon">⌕</span><div><small>Búsqueda</small><strong>${list.length} COINCIDENCIA${list.length === 1 ? '' : 'S'}</strong><p>Elegí a la persona correcta en la lista.</p></div>`;
    }
  }
  function pageRows(list, pageKey) {
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    state[pageKey] = Math.min(Math.max(1, state[pageKey]), pages);
    const start = (state[pageKey] - 1) * PAGE_SIZE;
    return {rows:list.slice(start, start + PAGE_SIZE), pages};
  }
  function renderPagination(target, total, pages, pageKey, render) {
    const current = state[pageKey];
    $(target).innerHTML = total ? `<span>Mostrando ${(current - 1) * PAGE_SIZE + 1}-${Math.min(current * PAGE_SIZE, total)} de ${total}</span><div><button data-prev ${current === 1 ? 'disabled' : ''}>‹ Anterior</button><strong>Página ${current} de ${pages}</strong><button data-next ${current === pages ? 'disabled' : ''}>Siguiente ›</button></div>` : '';
    const prev = $(`${target} [data-prev]`), next = $(`${target} [data-next]`);
    if (prev) prev.onclick = () => { state[pageKey]--; render(); };
    if (next) next.onclick = () => { state[pageKey]++; render(); };
  }
  function renderVoters() {
    const list = filteredVoters(); renderLookupResult(list); $('#empty-voters').classList.toggle('hidden', list.length > 0);
    const {rows, pages} = pageRows(list, 'voterPage');
    $('#voters-body').innerHTML = rows.map((voter) => {
      const listed = listRecord(voter.id);
      const listButton = !isAdmin() ? '' : listed ? `<button class="list-state-btn ${listed.estado_lista}" data-open-list="${voter.id}">${listed.estado_lista === 'agregado' ? '★ Agregado' : 'Excluido'}</button>` : `<button class="add-list-btn" data-add-list="${voter.id}">＋ Agregar</button>`;
      return `<tr><td>${esc(voter.mesa ?? '—')}</td><td>${esc(voter.orden ?? '—')}</td><td>${esc(voter.cedula)}</td><td><strong>${esc(voter.nombre)}</strong></td><td>${esc(voter.fecha_nacimiento || '—')}</td><td>${esc(voter.partido || '—')}</td><td>${esc(voter.edad ?? '—')}</td><td>${esc(voter.tipo_voto || '—')}</td><td>${esc(voter.tipo_inscripcion || '—')}</td><td>${esc(voter.institucion || '—')}</td><td><span class="status ${voter.voto_confirmado ? 'voted' : 'pending'}">${voter.voto_confirmado ? '✓ Ya votó' : '◷ Pendiente'}</span></td><td><div class="row-actions">${voter.voto_confirmado ? `<button class="undo-btn" data-vote="${voter.id}" data-value="false">Deshacer</button>` : `<button class="vote-btn" data-vote="${voter.id}" data-value="true">✓ Marcar votó</button>`}</div></td>${isAdmin() ? `<td>${listButton}</td>` : ''}</tr>`;
    }).join('');
    $$('[data-vote]').forEach((button) => button.onclick = () => toggleVote(button.dataset.vote, button.dataset.value === 'true'));
    $$('[data-add-list]').forEach((button) => button.onclick = () => openListForm(button.dataset.addList));
    $$('[data-open-list]').forEach((button) => button.onclick = () => openListForm(button.dataset.openList));
    renderPagination('#voters-pagination', list.length, pages, 'voterPage', renderVoters);
  }
  function joinedList() {
    const voterMap = new Map(state.votantes.map((voter) => [voter.id, voter]));
    return state.lista.map((row) => ({...row, voter:voterMap.get(row.votante_id)})).filter((row) => row.voter);
  }
  function filteredList() {
    const query = normalized($('#list-search').value), vote = $('#list-vote-filter').value, listState = $('#list-state-filter').value, transfer = $('#list-transfer-filter').value;
    return joinedList().filter((row) => {
      const haystack = normalized(`${row.voter.nombre} ${row.voter.cedula} ${row.encargado || ''} ${row.ciudad || ''}`);
      return (!query || haystack.includes(query)) && (!vote || (vote === 'voted' ? row.voter.voto_confirmado : !row.voter.voto_confirmado)) && (!listState || row.estado_lista === listState) && (!transfer || (transfer === 'ok' ? row.traslado_ok : !row.traslado_ok));
    });
  }
  function renderMyList() {
    const list = filteredList(); $('#empty-list').classList.toggle('hidden', list.length > 0);
    const {rows, pages} = pageRows(list, 'listPage');
    $('#my-list-body').innerHTML = rows.map((row) => `<tr><td>${esc(row.voter.mesa ?? '—')}</td><td>${esc(row.voter.orden ?? '—')}</td><td>${esc(row.voter.cedula)}</td><td><strong>${esc(row.voter.nombre)}</strong></td><td>${esc(row.voter.institucion || '—')}</td><td>${esc(row.ciudad || '—')}</td><td>${esc(row.celular || '—')}</td><td>${esc(row.encargado || '—')}</td><td>${esc(row.gestion || 'Sin asignar')}</td><td><span class="status ${row.voter.voto_confirmado ? 'voted' : 'pending'}">${row.voter.voto_confirmado ? '✓ Sí' : '◷ Pendiente'}</span></td><td><span class="status ${row.estado_lista === 'agregado' ? 'voted' : 'excluded'}">${row.estado_lista === 'agregado' ? 'Agregado' : 'Excluido'}</span></td><td><button class="transfer-btn ${row.traslado_ok ? 'ok' : ''}" data-transfer="${row.id}">${row.traslado_ok ? '✓ OK' : 'Pendiente'}</button></td><td><div class="row-actions"><button class="action-btn" data-view-list="${row.votante_id}">Visualizar datos</button>${row.estado_lista === 'agregado' ? `<button class="action-btn danger" data-exclude="${row.id}">Excluir</button>` : `<button class="action-btn" data-restore="${row.id}">Restaurar</button>`}</div></td></tr>`).join('');
    $$('[data-view-list]').forEach((button) => button.onclick = () => openListForm(button.dataset.viewList));
    $$('[data-transfer]').forEach((button) => button.onclick = () => toggleTransfer(button.dataset.transfer));
    $$('[data-exclude]').forEach((button) => button.onclick = () => setListState(button.dataset.exclude, 'excluido'));
    $$('[data-restore]').forEach((button) => button.onclick = () => setListState(button.dataset.restore, 'agregado'));
    renderPagination('#list-pagination', list.length, pages, 'listPage', renderMyList);
  }
  async function toggleVote(id, value) {
    const voter = state.votantes.find((row) => row.id === id);
    if (!voter || (!value && !confirm(`¿Deshacer la confirmación de ${voter.nombre}?`))) return;
    try {
      const {error} = await db.rpc('marcar_estado_voto', {p_votante_id:id, p_voto_confirmado:value});
      if (error) throw error;
      await refreshData(); toast(value ? 'Voto confirmado en tiempo real' : 'Confirmación deshecha');
    } catch (error) { toast(`No se pudo guardar: ${error.message}`); }
  }
  function showModal({eyebrow, title, fields, onSave}) {
    $('#modal-eyebrow').textContent = eyebrow; $('#modal-title').textContent = title; $('#modal-fields').innerHTML = fields;
    const modal = $('#modal'); modal.showModal();
    $('#modal-form').onsubmit = async (event) => {
      event.preventDefault(); const save = $('#modal-save'); save.disabled = true;
      try { await onSave(new FormData(event.currentTarget)); modal.close(); await refreshData(); }
      catch (error) { toast(error.message); }
      finally { save.disabled = false; }
    };
  }
  function openListForm(voterId) {
    const voter = state.votantes.find((row) => row.id === voterId), existing = listRecord(voterId);
    if (!voter) return;
    showModal({
      eyebrow:existing ? 'SEGUIMIENTO ADMINISTRATIVO' : 'AGREGAR A MI LISTA', title:voter.nombre,
      fields:`<div class="voter-reference">Mesa ${esc(voter.mesa ?? '—')} · Orden ${esc(voter.orden ?? '—')} · Cédula ${esc(voter.cedula)}</div><div class="form-grid"><label>Encargado<input name="encargado" required maxlength="120" value="${esc(existing?.encargado || '')}"></label><label>Celular<input name="celular" inputmode="tel" maxlength="30" value="${esc(existing?.celular || '')}"></label><label>Ciudad<input name="ciudad" required maxlength="100" value="${esc(existing?.ciudad || 'San Patricio')}"></label><label>Costo de traslado<input name="costo_traslado" type="number" min="0" step="1000" value="${esc(existing?.costo_traslado ?? '')}"></label><label>Tipo de gestión<select name="gestion"><option value="Sin asignar" ${!existing || existing.gestion === 'Sin asignar' ? 'selected' : ''}>Sin asignar</option><option value="Concejalía" ${existing?.gestion === 'Concejalía' ? 'selected' : ''}>Concejalía</option><option value="Intendencia + Concejalía" ${existing?.gestion === 'Intendencia + Concejalía' ? 'selected' : ''}>Intendencia + Concejalía</option></select></label><label>Estado en mi lista<select name="estado_lista"><option value="agregado" ${existing?.estado_lista !== 'excluido' ? 'selected' : ''}>Agregado en mi lista</option><option value="excluido" ${existing?.estado_lista === 'excluido' ? 'selected' : ''}>Excluido de mi lista</option></select></label></div><label>Observación<textarea name="observacion" maxlength="500" placeholder="Escribí la observación">${esc(existing?.observacion || '')}</textarea></label>`,
      onSave:async (form) => {
        const row = {votante_id:voterId, encargado:form.get('encargado').trim(), celular:form.get('celular').trim(), ciudad:form.get('ciudad').trim(), costo_traslado:form.get('costo_traslado') ? Number(form.get('costo_traslado')) : null, observacion:form.get('observacion').trim(), gestion:form.get('gestion'), estado_lista:form.get('estado_lista'), actualizado_en:new Date().toISOString()};
        const query = existing ? db.from('mis_votantes').update(row).eq('id', existing.id) : db.from('mis_votantes').insert({...row, creado_por:state.user.id});
        const {error} = await query; if (error) throw error;
        toast(existing ? 'Datos actualizados' : 'Votante agregado a mi lista');
      }
    });
  }
  async function setListState(id, value) {
    if (value === 'excluido' && !confirm('El registro seguirá visible, pero no contará en el resumen. ¿Continuar?')) return;
    const {error} = await db.from('mis_votantes').update({estado_lista:value, actualizado_en:new Date().toISOString()}).eq('id', id);
    if (error) return toast(`No se pudo actualizar: ${error.message}`);
    await refreshData(); toast(value === 'excluido' ? 'Excluido de mi lista' : 'Restaurado en mi lista');
  }
  async function toggleTransfer(id) {
    const row = state.lista.find((item) => item.id === id); if (!row) return;
    const newValue = !row.traslado_ok;
    const {error} = await db.from('mis_votantes').update({traslado_ok:newValue, actualizado_en:new Date().toISOString()}).eq('id', id);
    if (error) return toast(`No se pudo actualizar: ${error.message}`);
    await refreshData(); toast(newValue ? 'Traslado marcado como OK' : 'Traslado marcado pendiente');
  }
  async function managerRequest(body) {
    const {data:{session}} = await db.auth.getSession(); if (!session) throw new Error('La sesión venció. Volvé a ingresar.');
    const response = await fetch(`${cfg.SUPABASE_URL}/functions/v1/crear-encargado`, {method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`}, body:JSON.stringify(body)});
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación'); return result;
  }
  function renderManagers() {
    $('#managers-grid').innerHTML = state.profiles.filter((profile) => profile.rol === 'encargado').map((profile) => `<article class="entity-card"><div class="entity-card-top"><div class="manager-head"><div class="avatar">${initials(profile.nombre)}</div><div><h4>${esc(profile.nombre)}</h4><p>${esc(profile.email)}</p></div></div><div class="card-actions"><button class="action-btn" data-edit-manager="${profile.id}">Editar</button><button class="action-btn danger" data-delete-manager="${profile.id}">Eliminar</button></div></div><div class="mini-stats"><span>Perfil de consulta general</span><strong>${profile.activo ? 'Activo' : 'Inactivo'}</strong></div></article>`).join('') || '<div class="empty">Todavía no hay usuarios de consulta.</div>';
    $$('[data-edit-manager]').forEach((button) => button.onclick = () => openManager(state.profiles.find((profile) => profile.id === button.dataset.editManager)));
    $$('[data-delete-manager]').forEach((button) => button.onclick = () => deleteManager(button.dataset.deleteManager));
  }
  function openManager(existing = null) {
    showModal({eyebrow:'CONTROL DE ACCESO', title:existing ? 'Editar usuario' : 'Crear usuario de consulta', fields:`<label>Nombre y apellido<input name="nombre" required maxlength="100" value="${esc(existing?.nombre || '')}"></label><label>Correo electrónico<input name="email" type="email" required value="${esc(existing?.email || '')}"></label><label>${existing ? 'Nueva contraseña (opcional)' : 'Contraseña temporal'}<input name="password" type="password" ${existing ? '' : 'required'} minlength="8"></label>`, onSave:async (form) => {await managerRequest({action:existing ? 'update' : 'create', id:existing?.id, nombre:form.get('nombre').trim(), email:form.get('email').trim(), password:form.get('password')}); toast(existing ? 'Usuario actualizado' : 'Usuario de consulta creado');}});
  }
  async function deleteManager(id) {
    const manager = state.profiles.find((profile) => profile.id === id);
    if (!manager || !confirm(`¿Eliminar definitivamente la cuenta de ${manager.nombre}?`)) return;
    try { await managerRequest({action:'delete', id}); await refreshData(); toast('Usuario eliminado'); }
    catch (error) { toast(`No se pudo eliminar: ${error.message}`); }
  }
  function navigate(page) {
    if (!document.getElementById(page) || (!isAdmin() && page !== 'votantes')) page = isAdmin() ? 'dashboard' : 'votantes';
    $$('.page').forEach((element) => element.classList.toggle('active', element.id === page));
    $$('#nav button').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
    localStorage.setItem('control-electoral-page', page);
  }

  $('#login-form').onsubmit = async (event) => {event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true; button.textContent = 'Ingresando…'; try {await login($('#email').value.trim(), $('#password').value);} catch (error) {toast(error.message);} finally {button.disabled = false; button.textContent = 'Ingresar';}};
  $('#logout').onclick = async () => {await db.auth.signOut(); if (state.channel) await db.removeChannel(state.channel); localStorage.removeItem('control-electoral-page'); location.reload();};
  $('#modal-close').onclick = () => $('#modal').close(); $('#modal-cancel').onclick = () => $('#modal').close();
  $$('#nav button').forEach((button) => button.onclick = () => navigate(button.dataset.page)); $('#new-manager').onclick = () => openManager();
  $('#voter-search').addEventListener('input', () => {state.voterPage = 1; renderVoters();});
  $('#filter-status').addEventListener('change', () => {state.voterPage = 1; renderVoters();});
  ['#list-search','#list-vote-filter','#list-state-filter','#list-transfer-filter'].forEach((selector) => $(selector).addEventListener(selector === '#list-search' ? 'input' : 'change', () => {state.listPage = 1; renderMyList();}));

  async function restoreSession() {
    if (!hasSupabase) return;
    try {
      const {data:{session}} = await db.auth.getSession(); if (!session) return;
      const {data:profile, error} = await db.from('perfiles').select('*').eq('id', session.user.id).single();
      if (error || !profile?.activo) {await db.auth.signOut(); return;}
      state.user = profile; await loadAll(); subscribeRealtime(); enterApp();
    } catch (error) {console.warn('No se pudo restaurar la sesión:', error.message);}
  }
  restoreSession();
})();
