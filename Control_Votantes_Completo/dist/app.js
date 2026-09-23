(() => {
  'use strict';
  const cfg = window.APP_CONFIG || {};
  const hasSupabase = !cfg.DEMO_MODE && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase;
  const db = hasSupabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {auth:{persistSession:true,autoRefreshToken:true}}) : null;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const fmtTime = (v) => v ? new Date(v).toLocaleTimeString('es-PY', {hour:'2-digit',minute:'2-digit'}) : '—';
  const initials = (name='') => name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const digits = (v='') => String(v).replace(/\D/g,'');
  const normalized = (v='') => String(v).trim().toLocaleLowerCase('es');

  const seed = {
    barrios: [
      {id:'b1',nombre:'Centro',descripcion:'Zona céntrica de San Patricio',activo:true},
      {id:'b2',nombre:'San Antonio',descripcion:'Sector norte',activo:true},
      {id:'b3',nombre:'Santa Librada',descripcion:'Sector este',activo:true},
      {id:'b4',nombre:'San José',descripcion:'Sector sur',activo:true}
    ],
    profiles: [
      {id:'u1',nombre:'Fabián Rolón',email:'admin@demo.com',rol:'admin',barrio_id:null,activo:true,password:'admin123'},
      {id:'u2',nombre:'María González',email:'encargado@demo.com',rol:'encargado',barrio_id:'b1',activo:true,password:'encargado123'},
      {id:'u3',nombre:'Carlos Benítez',email:'carlos@demo.com',rol:'encargado',barrio_id:'b2',activo:true,password:'encargado123'}
    ],
    votantes: [
      {id:'v1',nombre:'Andrea López',cedula:'4821560',telefono:'0981123456',barrio_id:'b1',voto_confirmado:true,voto_hora:new Date(Date.now()-8*60000).toISOString(),registrado_por:'u2'},
      {id:'v2',nombre:'Ramón Acosta',cedula:'3928041',telefono:'0972123456',barrio_id:'b1',voto_confirmado:false,voto_hora:null,registrado_por:'u2'},
      {id:'v3',nombre:'Lucía Martínez',cedula:'5512098',telefono:'0983123456',barrio_id:'b2',voto_confirmado:true,voto_hora:new Date(Date.now()-22*60000).toISOString(),registrado_por:'u3'},
      {id:'v4',nombre:'Pedro Giménez',cedula:'3245771',telefono:'',barrio_id:'b2',voto_confirmado:false,voto_hora:null,registrado_por:'u3'},
      {id:'v5',nombre:'Rosa Fernández',cedula:'6129033',telefono:'0984123456',barrio_id:'b3',voto_confirmado:true,voto_hora:new Date(Date.now()-42*60000).toISOString(),registrado_por:'u1'},
      {id:'v6',nombre:'Miguel Rojas',cedula:'4456129',telefono:'',barrio_id:'b3',voto_confirmado:false,voto_hora:null,registrado_por:'u1'},
      {id:'v7',nombre:'Elena Vera',cedula:'5077334',telefono:'',barrio_id:'b4',voto_confirmado:false,voto_hora:null,registrado_por:'u1'}
    ],
    auditoria: []
  };

  const state = { user:null, barrios:[], profiles:[], votantes:[], auditoria:[], channel:null };
  function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2400)}
  function barrioName(id){return state.barrios.find(b=>b.id===id)?.nombre || 'Sin asignar'}
  function profileName(id){return state.profiles.find(p=>p.id===id)?.nombre || 'Usuario'}
  function visibleVoters(){return state.user?.rol==='admin' ? state.votantes : state.votantes.filter(v=>v.barrio_id===state.user?.barrio_id)}
  function visibleBarrios(){return state.user?.rol==='admin' ? state.barrios : state.barrios.filter(b=>b.id===state.user?.barrio_id)}

  function savedValue(key){try{return sessionStorage.getItem(key)}catch{return null}}
  function rememberLoginEmail(email){
    try{localStorage.setItem('control-electoral:last-email',email||'')}catch{}
  }
  function prepareLogin(){
    let email='';
    try{email=localStorage.getItem('control-electoral:last-email')||''}catch{}
    $('#email').value=email;
    $('#password').value='';
  }
  function saveValue(key,value){try{if(value===null)sessionStorage.removeItem(key);else sessionStorage.setItem(key,value)}catch{}}
  function pageKey(){return 'control-electoral:page:'+state.user.id}
  async function loadSessionUser(user){
    const {data:profile,error}=await db.from('perfiles').select('*').eq('id',user.id).single();
    if(error)throw error;
    if(!profile||!profile.activo)throw new Error('Esta cuenta no est? activa.');
    state.user=profile;
    await loadAll();subscribeRealtime();
  }
  async function restoreSession(){
    $('#login-view').classList.add('hidden');
    $('#session-loading').classList.remove('hidden');
    try{
      if(hasSupabase){
        const {data,error}=await db.auth.getSession();
        if(error)throw error;
        if(data.session){await loadSessionUser(data.session.user);enterApp()}
      }else{
        const profile=seed.profiles.find(p=>p.id===savedValue('control-electoral:demo-user')&&p.activo);
        if(profile)await login(profile.email,profile.password);
      }
    }catch(error){
      state.user=null;
      toast('No se pudo recuperar la sesi?n: '+error.message);
    }finally{
      $('#session-loading').classList.add('hidden');
      if(!state.user){prepareLogin();$('#login-view').classList.remove('hidden')}
    }
  }
  async function login(email,password){
    if(hasSupabase){
      const {data,error}=await db.auth.signInWithPassword({email,password});
      if(error) throw error;
      await loadSessionUser(data.user);
    } else {
      const profile=seed.profiles.find(p=>p.email.toLowerCase()===email.toLowerCase()&&p.password===password&&p.activo);
      if(!profile) throw new Error('Correo o contraseña incorrectos');
      saveValue('control-electoral:demo-user',profile.id);
      state.user={...profile}; state.barrios=structuredClone(seed.barrios); state.profiles=structuredClone(seed.profiles); state.votantes=structuredClone(seed.votantes);
      state.auditoria=[
        {id:'a1',accion:'Confirmó el voto de Andrea López',usuario_id:'u2',creado_en:new Date(Date.now()-8*60000).toISOString()},
        {id:'a2',accion:'Confirmó el voto de Lucía Martínez',usuario_id:'u3',creado_en:new Date(Date.now()-22*60000).toISOString()},
        {id:'a3',accion:'Confirmó el voto de Rosa Fernández',usuario_id:'u1',creado_en:new Date(Date.now()-42*60000).toISOString()}
      ];
    }
    enterApp();
  }
  async function loadAll(){
    const [b,p,v]=await Promise.all([
      db.from('barrios').select('*').order('nombre'), db.from('perfiles').select('*').order('nombre'),
      db.from('votantes').select('*').order('nombre')
    ]);
    [b,p,v].forEach(r=>{if(r.error)throw r.error});
    state.barrios=b.data;state.profiles=p.data;state.votantes=v.data;
  }
  function subscribeRealtime(){
    state.channel=db.channel('control-en-vivo')
      .on('postgres_changes',{event:'*',schema:'public',table:'votantes'},async()=>{await loadAll();renderAll()})
      .on('postgres_changes',{event:'*',schema:'public',table:'barrios'},async()=>{await loadAll();renderAll()})
      .on('postgres_changes',{event:'*',schema:'public',table:'perfiles'},async()=>{await loadAll();renderAll()})
      .subscribe();
  }
  function enterApp(){
    rememberLoginEmail(state.user.email);
    $('#password').value='';
    $('#login-view').classList.add('hidden');$('#app-view').classList.remove('hidden');
    $('#side-name').textContent=state.user.nombre;$('#side-role').textContent=state.user.rol==='admin'?'Administrador general':`Encargado · ${barrioName(state.user.barrio_id)}`;$('#avatar').textContent=initials(state.user.nombre);
    $$('[data-admin]').forEach(el=>el.classList.toggle('hidden',state.user.rol!=='admin'));
    $('#demo-box').classList.toggle('hidden',hasSupabase);
    renderAll();
    navigate(savedValue(pageKey())||'dashboard');
  }
  function renderAll(){renderStats();renderProgress();renderActivity();renderFilters();renderVoters();renderBarrios();renderManagers()}
  function renderStats(){
    const voters=visibleVoters(), voted=voters.filter(v=>v.voto_confirmado).length;
    $('#stat-total').textContent=voters.length;$('#stat-voted').textContent=voted;$('#stat-pending').textContent=voters.length-voted;$('#stat-percent').textContent=`${voters.length?Math.round(voted/voters.length*100):0}% del padrón`;$('#stat-barrios').textContent=visibleBarrios().filter(b=>b.activo).length;
    $('#update-time').textContent=`Actualizado ${new Date().toLocaleTimeString('es-PY',{hour:'2-digit',minute:'2-digit'})}`;
  }
  function renderProgress(){
    $('#barrio-progress').innerHTML=visibleBarrios().map(b=>{const all=state.votantes.filter(v=>v.barrio_id===b.id),n=all.filter(v=>v.voto_confirmado).length,p=all.length?Math.round(n/all.length*100):0;return `<div class="progress-row"><div class="progress-meta"><strong>${esc(b.nombre)}</strong><span>${n} de ${all.length} · ${p}%</span></div><div class="progress-track"><i style="width:${p}%"></i></div></div>`}).join('') || '<div class="empty">Todavía no hay barrios.</div>';
  }
  function renderActivity(){
    const allowed=new Set(visibleVoters().map(v=>v.id));
    const recent=state.votantes.filter(v=>v.voto_confirmado&&allowed.has(v.id)).sort((a,b)=>new Date(b.voto_hora)-new Date(a.voto_hora)).slice(0,6);
    $('#recent-activity').innerHTML=recent.map(v=>`<div class="activity-item"><span class="activity-icon">✓</span><div><strong>${esc(v.nombre)} confirmó su voto</strong><span>${esc(barrioName(v.barrio_id))} · ${fmtTime(v.voto_hora)}</span></div></div>`).join('') || '<div class="empty">Sin actividad reciente.</div>';
  }
  function renderFilters(){
    const current=$('#filter-barrio').value;
    $('#filter-barrio').innerHTML='<option value="">Todos los barrios</option>'+visibleBarrios().map(b=>`<option value="${b.id}">${esc(b.nombre)}</option>`).join('');$('#filter-barrio').value=current;
  }
  function filteredVoters(){const q=normalized($('#voter-search').value),qDigits=digits(q),b=$('#filter-barrio').value,s=$('#filter-status').value;return visibleVoters().filter(v=>(!q||normalized(v.nombre).includes(q)||(qDigits&&digits(v.cedula).includes(qDigits))||(qDigits&&digits(v.telefono).includes(qDigits)))&&(!b||v.barrio_id===b)&&(!s||(s==='voted'?v.voto_confirmado:!v.voto_confirmado)))}
  function renderLookupResult(list){
    const box=$('#lookup-result'),query=$('#voter-search').value.trim();
    if(!query){box.className='lookup-result hidden';box.innerHTML='';return}
    const exact=digits(query).length>=4?list.find(v=>digits(v.cedula)===digits(query)):null;
    if(exact){
      box.className=`lookup-result ${exact.voto_confirmado?'already-voted':'not-voted'}`;
      box.innerHTML=`<span class="lookup-icon">${exact.voto_confirmado?'✓':'◷'}</span><div><small>Resultado por cédula</small><strong>${exact.voto_confirmado?'YA VOTÓ':'TODAVÍA NO VOTÓ'}</strong><p>${esc(exact.nombre)} · C.I. ${esc(exact.cedula)} · ${esc(barrioName(exact.barrio_id))}${exact.voto_confirmado?` · ${fmtTime(exact.voto_hora)}`:''}</p></div>`;
    }else if(!list.length){
      box.className='lookup-result not-found';box.innerHTML='<span class="lookup-icon">!</span><div><small>Sin coincidencias</small><strong>NO ESTÁ EN EL SISTEMA</strong><p>Revisá la cédula, el nombre o el teléfono.</p></div>';
    }else{box.className='lookup-result matches';box.innerHTML=`<span class="lookup-icon">⌕</span><div><small>Búsqueda</small><strong>${list.length} COINCIDENCIA${list.length===1?'':'S'}</strong><p>Elegí a la persona correcta en la lista.</p></div>`}
  }
  function renderVoters(){
    const list=filteredVoters();renderLookupResult(list);$('#empty-voters').classList.toggle('hidden',list.length>0);
    $('#voters-body').innerHTML=list.map(v=>`<tr><td><strong>${esc(v.nombre)}</strong><span class="person-meta">${esc(v.telefono||'Sin teléfono')}</span></td><td>${esc(v.cedula)}</td><td>${esc(barrioName(v.barrio_id))}</td><td><span class="status ${v.voto_confirmado?'voted':'pending'}">${v.voto_confirmado?'✓ Ya votó':'◷ Pendiente'}</span></td><td>${fmtTime(v.voto_hora)}</td><td><div class="row-actions">${v.voto_confirmado?`<button class="undo-btn" data-vote="${v.id}" data-value="false">Deshacer</button>`:`<button class="vote-btn" data-vote="${v.id}" data-value="true">✓ Marcar votó</button>`}<button class="action-btn" data-edit-voter="${v.id}">Editar</button>${state.user.rol==='admin'?`<button class="action-btn danger" data-delete-voter="${v.id}">Eliminar</button>`:''}</div></td></tr>`).join('');
    $$('[data-vote]').forEach(btn=>btn.onclick=()=>toggleVote(btn.dataset.vote,btn.dataset.value==='true'));
    $$('[data-edit-voter]').forEach(btn=>btn.onclick=()=>openVoter(state.votantes.find(v=>v.id===btn.dataset.editVoter)));
    $$('[data-delete-voter]').forEach(btn=>btn.onclick=()=>deleteVoter(btn.dataset.deleteVoter));
  }
  function renderBarrios(){
    $('#barrios-grid').innerHTML=state.barrios.map(b=>{const voters=state.votantes.filter(v=>v.barrio_id===b.id),n=voters.filter(v=>v.voto_confirmado).length;return `<article class="entity-card"><div class="entity-card-top"><div><h4>${esc(b.nombre)}</h4><p>${esc(b.descripcion||'Sin descripción')}</p></div><div class="card-actions"><button class="action-btn" data-edit-barrio="${b.id}">Editar</button><button class="action-btn danger" data-delete-barrio="${b.id}">Eliminar</button></div></div><div class="mini-stats"><span>${voters.length} registrados</span><strong>${n} votaron</strong></div></article>`}).join('');
    $$('[data-edit-barrio]').forEach(btn=>btn.onclick=()=>openBarrio(state.barrios.find(b=>b.id===btn.dataset.editBarrio)));
    $$('[data-delete-barrio]').forEach(btn=>btn.onclick=()=>deleteBarrio(btn.dataset.deleteBarrio));
  }
  function renderManagers(){
    $('#managers-grid').innerHTML=state.profiles.filter(p=>p.rol==='encargado').map(p=>`<article class="entity-card"><div class="entity-card-top"><div class="manager-head"><div class="avatar">${initials(p.nombre)}</div><div><h4>${esc(p.nombre)}</h4><p>${esc(p.email)}</p></div></div><div class="card-actions"><button class="action-btn" data-edit-manager="${p.id}">Editar</button><button class="action-btn danger" data-delete-manager="${p.id}">Eliminar</button></div></div><div class="mini-stats"><span>${esc(barrioName(p.barrio_id))}</span><strong>${p.activo?'Activo':'Inactivo'}</strong></div></article>`).join('');
    $$('[data-edit-manager]').forEach(btn=>btn.onclick=()=>openManager(state.profiles.find(p=>p.id===btn.dataset.editManager)));
    $$('[data-delete-manager]').forEach(btn=>btn.onclick=()=>deleteManager(btn.dataset.deleteManager));
  }
  async function audit(action){
    const row={accion:action,usuario_id:state.user.id,creado_en:new Date().toISOString()};
    if(hasSupabase){const {error}=await db.from('auditoria').insert(row);if(error)console.warn('No se pudo registrar auditoría:',error.message)}else state.auditoria.unshift({id:uid(),...row});
  }
  async function toggleVote(id,value){
    const voter=state.votantes.find(v=>v.id===id);if(!voter)return;
    if(!value&&!confirm(`¿Deshacer la confirmación de ${voter.nombre}?`))return;
    const changes={voto_confirmado:value,voto_hora:value?new Date().toISOString():null,voto_registrado_por:value?state.user.id:null};
    try{
      if(hasSupabase){const {error}=await db.from('votantes').update(changes).eq('id',id);if(error)throw error}else Object.assign(voter,changes);
      await audit(`${value?'Confirmó':'Deshizo'} el voto de ${voter.nombre}`);if(hasSupabase)await loadAll();renderAll();toast(value?'Voto confirmado en tiempo real':'Confirmación deshecha');
    }catch(e){toast(`No se pudo guardar: ${e.message}`)}
  }
  function showModal({eyebrow,title,fields,onSave}){
    $('#modal-eyebrow').textContent=eyebrow;$('#modal-title').textContent=title;$('#modal-fields').innerHTML=fields;const modal=$('#modal');modal.showModal();
    $('#modal-form').onsubmit=async(e)=>{e.preventDefault();if(e.submitter?.value==='cancel'){modal.close();return}try{await onSave(new FormData(e.currentTarget));modal.close();renderAll()}catch(err){toast(err.message)}};
  }
  // Closing never submits the form or triggers required-field validation.
  $$('[data-modal-close]').forEach(button=>button.onclick=()=>$('#modal').close('cancel'));
  function barrioOptions(selected=''){return visibleBarrios().filter(b=>b.activo).map(b=>`<option value="${b.id}" ${b.id===selected?'selected':''}>${esc(b.nombre)}</option>`).join('')}
  function openVoter(existing=null){const assigned=existing?.barrio_id||(state.user.rol==='admin'?'':state.user.barrio_id);showModal({eyebrow:'PADRÓN ELECTORAL',title:existing?'Editar votante':'Agregar nuevo votante',fields:`<label>Nombre y apellido<input name="nombre" required maxlength="100" value="${esc(existing?.nombre||'')}"></label><label>Número de cédula<input name="cedula" inputmode="numeric" pattern="[0-9]+" required maxlength="15" value="${esc(existing?.cedula||'')}"></label><label>Teléfono<input name="telefono" inputmode="tel" maxlength="30" value="${esc(existing?.telefono||'')}"></label><label>Barrio<select name="barrio_id" required><option value="">Seleccionar…</option>${barrioOptions(assigned)}</select></label>`,onSave:async fd=>{
    const cedula=digits(fd.get('cedula'));if(state.votantes.some(v=>v.id!==existing?.id&&digits(v.cedula)===cedula)){const found=state.votantes.find(v=>v.id!==existing?.id&&digits(v.cedula)===cedula);throw new Error(`La cédula ya está registrada: ${found.voto_confirmado?'YA VOTÓ':'todavía no votó'}`)}
    const barrioId=fd.get('barrio_id');if(state.user.rol!=='admin'&&barrioId!==state.user.barrio_id)throw new Error('Solo podés registrar personas de tu barrio asignado');
    const row=existing
      ? {nombre:fd.get('nombre').trim(),cedula,telefono:fd.get('telefono').trim(),barrio_id:barrioId}
      : {nombre:fd.get('nombre').trim(),cedula,telefono:fd.get('telefono').trim(),barrio_id:barrioId,voto_confirmado:false,registrado_por:state.user.id};
    if(hasSupabase){const q=existing?db.from('votantes').update({...row,actualizado_en:new Date().toISOString()}).eq('id',existing.id).select().single():db.from('votantes').insert(row).select().single();const {data,error}=await q;if(error)throw error;if(existing)Object.assign(existing,data);else state.votantes.push(data)}else if(existing)Object.assign(existing,row);else state.votantes.push({id:uid(),voto_hora:null,...row});await audit(`${existing?'Actualizó':'Registró'} a ${row.nombre} en el padrón`);toast(existing?'Votante actualizado':'Votante agregado correctamente');
  }})}
  async function deleteVoter(id){const voter=state.votantes.find(v=>v.id===id);if(!voter||!confirm(`¿Eliminar definitivamente a ${voter.nombre}?`))return;try{if(hasSupabase){const {error}=await db.from('votantes').delete().eq('id',id);if(error)throw error;await loadAll()}else state.votantes=state.votantes.filter(v=>v.id!==id);await audit(`Eliminó del padrón a ${voter.nombre}`);renderAll();toast('Votante eliminado')}catch(e){toast(`No se pudo eliminar: ${e.message}`)}}
  function openBarrio(existing=null){showModal({eyebrow:'ORGANIZACIÓN TERRITORIAL',title:existing?'Editar barrio':'Crear nuevo barrio',fields:`<label>Nombre del barrio<input name="nombre" required maxlength="80" value="${esc(existing?.nombre||'')}"></label><label>Descripción<input name="descripcion" maxlength="140" value="${esc(existing?.descripcion||'')}"></label>`,onSave:async fd=>{const row={nombre:fd.get('nombre').trim(),descripcion:fd.get('descripcion').trim(),activo:true};if(hasSupabase){const q=existing?db.from('barrios').update(row).eq('id',existing.id):db.from('barrios').insert(row);const {error}=await q;if(error)throw error;await loadAll()}else if(existing)Object.assign(existing,row);else state.barrios.push({id:uid(),...row});await audit(`${existing?'Actualizó':'Creó'} el barrio ${row.nombre}`);toast('Barrio guardado')}})}
  async function deleteBarrio(id){const barrio=state.barrios.find(b=>b.id===id);if(!barrio)return;const usados=state.votantes.some(v=>v.barrio_id===id)||state.profiles.some(p=>p.barrio_id===id);if(usados){toast('Primero eliminá o reasigná sus votantes y encargados');return}if(!confirm(`¿Eliminar definitivamente el barrio ${barrio.nombre}?`))return;try{if(hasSupabase){const {error}=await db.from('barrios').delete().eq('id',id);if(error)throw error;await loadAll()}else state.barrios=state.barrios.filter(b=>b.id!==id);await audit(`Eliminó el barrio ${barrio.nombre}`);renderAll();toast('Barrio eliminado')}catch(e){toast(`No se pudo eliminar: ${e.message}`)}}
  async function managerRequest(body){const {data:{session}}=await db.auth.getSession();if(!session)throw new Error('La sesión venció. Volvé a ingresar.');const res=await fetch(`${cfg.SUPABASE_URL}/functions/v1/crear-encargado`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify(body)});const result=await res.json();if(!res.ok)throw new Error(result.error||'No se pudo completar la operación');return result}
  function openManager(existing=null){showModal({eyebrow:'CONTROL DE ACCESO',title:existing?'Editar encargado':'Crear encargado',fields:`<label>Nombre y apellido<input name="nombre" required maxlength="100" value="${esc(existing?.nombre||'')}"></label><label>Correo electrónico<input name="encargado_email" type="email" autocomplete="off" autocapitalize="none" spellcheck="false" required value="${esc(existing?.email||'')}"></label><label>${existing?'Nueva contraseña (opcional)':'Contraseña temporal'}<input name="encargado_password" type="password" autocomplete="new-password" ${existing?'':'required'} minlength="8"></label><label>Barrio asignado<select name="barrio_id" required><option value="">Seleccionar…</option>${barrioOptions(existing?.barrio_id||'')}</select></label>`,onSave:async fd=>{const row={action:existing?'update':'create',id:existing?.id,nombre:fd.get('nombre').trim(),email:fd.get('encargado_email').trim(),password:fd.get('encargado_password'),barrio_id:fd.get('barrio_id')};if(hasSupabase){await managerRequest(row);await loadAll()}else if(existing)Object.assign(existing,row);else state.profiles.push({id:uid(),rol:'encargado',activo:true,...row});await audit(`${existing?'Actualizó':'Creó'} la cuenta de ${row.nombre}`);toast(existing?'Encargado actualizado':'Encargado creado y asignado')}})}
  async function deleteManager(id){const manager=state.profiles.find(p=>p.id===id);if(!manager||!confirm(`¿Eliminar definitivamente la cuenta de ${manager.nombre}?`))return;try{if(hasSupabase){await managerRequest({action:'delete',id});await loadAll()}else state.profiles=state.profiles.filter(p=>p.id!==id);await audit(`Eliminó la cuenta de ${manager.nombre}`);renderAll();toast('Encargado eliminado')}catch(e){toast(`No se pudo eliminar: ${e.message}`)}}
  function exportCsv(){const rows=[['Nombre','Cedula','Telefono','Barrio','Estado','Hora'],...filteredVoters().map(v=>[v.nombre,v.cedula,v.telefono||'',barrioName(v.barrio_id),v.voto_confirmado?'Ya votó':'Pendiente',v.voto_hora||''])];const csv='\uFEFF'+rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`votantes-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)}
  function navigate(page){
    const allowed=state.user.rol==='admin'?['dashboard','votantes','barrios','encargados']:['dashboard','votantes'];
    if(!allowed.includes(page))page='dashboard';
    saveValue(pageKey(),page);
    $$('.page').forEach(p=>p.classList.toggle('active',p.id===page));$$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));const meta={dashboard:['Resumen general','Estado actualizado de la jornada'],votantes:['Control de votantes','Buscá y confirmá rápidamente'],barrios:['Barrios y zonas','Organización territorial'],encargados:['Equipo de encargados','Cuentas, permisos y asignaciones']}[page];$('#page-title').textContent=meta[0];$('#page-subtitle').textContent=meta[1];$('.sidebar').classList.remove('open')}

  $('#login-form').onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;btn.textContent='Ingresando…';try{await login($('#email').value.trim(),$('#password').value)}catch(err){toast(err.message)}finally{btn.disabled=false;btn.textContent='Ingresar'}};
  $('#logout').onclick=async()=>{
    try{
      if(hasSupabase){const {error}=await db.auth.signOut();if(error)throw error;if(state.channel)await db.removeChannel(state.channel)}
      if(state.user)rememberLoginEmail(state.user.email);
      if(state.user)saveValue(pageKey(),null);
      saveValue('control-electoral:demo-user',null);
      location.reload();
    }catch(error){toast('No se pudo cerrar la sesi?n: '+error.message)}
  };
  $$('#nav button').forEach(b=>b.onclick=()=>navigate(b.dataset.page));$('#menu').onclick=()=>$('.sidebar').classList.toggle('open');
  ['#voter-search','#filter-barrio','#filter-status'].forEach(s=>$(s).addEventListener(s==='#voter-search'?'input':'change',renderVoters));
  $('#new-voter').onclick=()=>openVoter();$('#new-barrio').onclick=()=>openBarrio();$('#new-manager').onclick=()=>openManager();$('#export-btn').onclick=exportCsv;
  restoreSession();
})();
