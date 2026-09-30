(() => {
  'use strict';

  /* =========================================================
     CONFIGURACIÓN GENERAL
  ========================================================= */

  const cfg = window.APP_CONFIG || {};

  const hasSupabase =
    !cfg.DEMO_MODE &&
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    window.supabase;

  const db = hasSupabase
    ? window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
      )
    : null;

  const $ = (selector) => document.querySelector(selector);

  const $$ = (selector) => [
    ...document.querySelectorAll(selector)
  ];

  const esc = (value = '') =>
    String(value).replace(
      /[&<>'"]/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        })[char]
    );

  const digits = (value = '') =>
    String(value).replace(/\D/g, '');

  const normalized = (value = '') =>
    String(value)
      .trim()
      .toLocaleLowerCase('es');

  const initials = (name = '') =>
    String(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || '')
      .join('')
      .toUpperCase();

  const fmtTime = (value) =>
    value
      ? new Date(value).toLocaleString('es-PY', {
          dateStyle: 'short',
          timeStyle: 'short'
        })
      : '—';

  const fmtDate = (value) => {
    if (!value) return '—';

    try {
      return new Date(`${value}T00:00:00`).toLocaleDateString(
        'es-PY'
      );
    } catch {
      return String(value);
    }
  };

  const sameId = (a, b) =>
    String(a ?? '') === String(b ?? '');

  const PAGE_SIZE = 50;


  /* =========================================================
     ESTADO
  ========================================================= */

  const state = {
    user: null,
    profiles: [],
    votantes: [],
    lista: [],
    channel: null,
    refreshTimer: null,
    voterPage: 1,
    listPage: 1
  };


  /* =========================================================
     UTILIDADES DE INTERFAZ
  ========================================================= */

  function toast(message) {
    const element = $('#toast');

    if (!element) return;

    element.textContent = message;
    element.classList.add('show');

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
      element.classList.remove('show');
    }, 3000);
  }


  /* =========================================================
     ROLES
     
     IMPORTANTE:
     Reconoce:
     - admin
     - administrador
     - administrator
     - perfil 2
  ========================================================= */

  function isAdminRole(role) {
    const value = normalized(role);

    return (
      value === 'admin' ||
      value === 'administrador' ||
      value === 'administrator' ||
      value === 'perfil 2' ||
      value === 'perfil2' ||
      value.includes('administrador')
    );
  }

  function isAdmin() {
    return isAdminRole(
      state.user?.rol ||
      state.user?.role ||
      ''
    );
  }

  function listRecord(voterId) {
    return state.lista.find((row) =>
      sameId(row.votante_id, voterId)
    );
  }


  /* =========================================================
     CARGA DE DATOS
  ========================================================= */

  async function fetchAll(table, order = 'nombre') {
    const rows = [];
    const size = 1000;

    for (let from = 0; ; from += size) {
      const { data, error } = await db
        .from(table)
        .select('*')
        .order(order)
        .range(from, from + size - 1);

      if (error) throw error;

      rows.push(...(data || []));

      if (!data || data.length < size) break;
    }

    return rows;
  }


  async function loadAll() {
    /*
      Perfil Consulta:
      solo necesita el padrón.

      Perfil Administrador:
      padrón + perfiles + mis_votantes.
    */

    if (isAdmin()) {
      const [voters, profiles, list] = await Promise.all([
        fetchAll('votantes'),
        fetchAll('perfiles'),
        fetchAll('mis_votantes', 'creado_en')
      ]);

      state.votantes = voters;
      state.profiles = profiles;
      state.lista = list;
    } else {
      state.votantes = await fetchAll('votantes');
      state.profiles = [];
      state.lista = [];
    }
  }


  /* =========================================================
     LOGIN
  ========================================================= */

  async function login(email, password) {
    if (!hasSupabase) {
      throw new Error(
        'La conexión con Supabase no está configurada.'
      );
    }

    const { data, error } =
      await db.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    const {
      data: profile,
      error: profileError
    } = await db
      .from('perfiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile?.activo) {
      await db.auth.signOut();

      throw new Error(
        'No se encontró un perfil activo para esta cuenta.'
      );
    }

    state.user = profile;

    await loadAll();

    subscribeRealtime();

    enterApp();
  }


  /* =========================================================
     TIEMPO REAL
  ========================================================= */

  function subscribeRealtime() {
    if (!db) return;

    if (state.channel) {
      db.removeChannel(state.channel);
    }

    state.channel = db
      .channel('control-electoral-en-vivo')

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'votantes'
        },
        scheduleRefresh
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mis_votantes'
        },
        scheduleRefresh
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'perfiles'
        },
        scheduleRefresh
      )

      .subscribe();
  }


  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);

    state.refreshTimer = setTimeout(() => {
      refreshData();
    }, 250);
  }


  async function refreshData() {
    try {
      await loadAll();
      renderAll();
    } catch (error) {
      console.warn(
        'No se pudo actualizar en tiempo real:',
        error.message
      );
    }
  }


  /* =========================================================
     ENTRADA AL SISTEMA
  ========================================================= */

  function enterApp() {
    $('#login-view')?.classList.add('hidden');
    $('#app-view')?.classList.remove('hidden');

    if ($('#side-name')) {
      $('#side-name').textContent =
        state.user?.nombre || 'Usuario';
    }

    if ($('#side-role')) {
      $('#side-role').textContent = isAdmin()
        ? 'Administrador general'
        : 'Perfil de consulta';
    }

    if ($('#avatar')) {
      $('#avatar').textContent =
        initials(state.user?.nombre || 'Usuario');
    }

    /*
      Todo elemento con data-admin
      solo se muestra al administrador.
    */
    $$('[data-admin]').forEach((element) => {
      element.classList.toggle(
        'hidden',
        !isAdmin()
      );
    });

    renderAll();

    const saved =
      localStorage.getItem(
        'control-electoral-page'
      ) ||
      (isAdmin()
        ? 'dashboard'
        : 'votantes');

    navigate(
      !isAdmin() && saved !== 'votantes'
        ? 'votantes'
        : saved
    );
  }


  function renderAll() {
    if (isAdmin()) {
      renderStats();
      renderSummary();
      renderActivity();
      renderMyList();
      renderManagers();
    }

    renderVoters();
  }


  /* =========================================================
     RESUMEN
     
     IMPORTANTE:
     El resumen se calcula SOLAMENTE
     con "Mis votantes", como pide el PDF.
  ========================================================= */

  function renderStats() {
    const active = state.lista.filter(
      (row) =>
        normalized(row.estado_lista) ===
        'agregado'
    );

    const voterMap = new Map(
      state.votantes.map((voter) => [
        String(voter.id),
        voter
      ])
    );

    const voted = active.filter(
      (row) =>
        voterMap.get(
          String(row.votante_id)
        )?.voto_confirmado
    ).length;

    const transferOk = active.filter(
      (row) => Boolean(row.traslado_ok)
    ).length;

    const excluded = state.lista.filter(
      (row) =>
        normalized(row.estado_lista) ===
        'excluido'
    ).length;

    if ($('#stat-total')) {
      $('#stat-total').textContent =
        active.length;
    }

    if ($('#stat-voted')) {
      $('#stat-voted').textContent =
        voted;
    }

    if ($('#stat-pending')) {
      $('#stat-pending').textContent =
        active.length - voted;
    }

    if ($('#stat-transfer')) {
      $('#stat-transfer').textContent =
        transferOk;
    }

    if ($('#stat-excluded')) {
      $('#stat-excluded').textContent =
        excluded;
    }

    if ($('#stat-percent')) {
      $('#stat-percent').textContent =
        `${
          active.length
            ? Math.round(
                (voted / active.length) * 100
              )
            : 0
        }% de mi lista`;
    }

    if ($('#update-time')) {
      $('#update-time').textContent =
        `Actualizado ${new Date().toLocaleTimeString(
          'es-PY',
          {
            hour: '2-digit',
            minute: '2-digit'
          }
        )}`;
    }
  }


  function renderSummary() {
    const active = state.lista.filter(
      (row) =>
        normalized(row.estado_lista) ===
        'agregado'
    );

    const voterMap = new Map(
      state.votantes.map((voter) => [
        String(voter.id),
        voter
      ])
    );

    const voted = active.filter(
      (row) =>
        voterMap.get(
          String(row.votante_id)
        )?.voto_confirmado
    ).length;

    const transferOk = active.filter(
      (row) => Boolean(row.traslado_ok)
    ).length;

    const votePercent =
      active.length
        ? Math.round(
            (voted / active.length) * 100
          )
        : 0;

    const transferPercent =
      active.length
        ? Math.round(
            (transferOk / active.length) *
              100
          )
        : 0;

    if (!$('#list-progress')) return;

    $('#list-progress').innerHTML = `
      <div class="progress-row">

        <div class="progress-meta">
          <strong>Votos confirmados</strong>
          <span>
            ${voted} de ${active.length}
            · ${votePercent}%
          </span>
        </div>

        <div class="progress-track">
          <i style="width:${votePercent}%"></i>
        </div>

      </div>

      <div class="progress-row">

        <div class="progress-meta">
          <strong>Traslados completados</strong>
          <span>
            ${transferOk} de ${active.length}
            · ${transferPercent}%
          </span>
        </div>

        <div class="progress-track">
          <i style="width:${transferPercent}%"></i>
        </div>

      </div>
    `;
  }


  function renderActivity() {
    if (!$('#recent-activity')) return;

    const activeIds = new Set(
      state.lista
        .filter(
          (row) =>
            normalized(
              row.estado_lista
            ) === 'agregado'
        )
        .map((row) =>
          String(row.votante_id)
        )
    );

    const recent = state.votantes
      .filter(
        (voter) =>
          voter.voto_confirmado &&
          activeIds.has(
            String(voter.id)
          )
      )
      .sort(
        (a, b) =>
          new Date(
            b.voto_hora || 0
          ) -
          new Date(
            a.voto_hora || 0
          )
      )
      .slice(0, 8);

    $('#recent-activity').innerHTML =
      recent
        .map(
          (voter) => `
            <div class="activity-item">

              <span class="activity-icon">
                ✓
              </span>

              <div>

                <strong>
                  ${esc(
                    voter.nombre_completo ||
                    voter.nombre ||
                    'Votante'
                  )}
                  confirmó su voto
                </strong>

                <span>
                  ${fmtTime(
                    voter.voto_hora
                  )}
                </span>

              </div>

            </div>
          `
        )
        .join('') ||
      `
        <div class="empty">
          Sin actividad reciente en tu lista.
        </div>
      `;
  }


  /* =========================================================
     PADRÓN GENERAL
  ========================================================= */

  function filteredVoters() {
    const query = normalized(
      $('#voter-search')?.value || ''
    );

    const queryDigits =
      digits(query);

    const status =
      $('#filter-status')?.value || '';

    return state.votantes.filter(
      (voter) => {
        const name = normalized(
          voter.nombre_completo ||
          voter.nombre ||
          ''
        );

        const matchesSearch =
          !query ||
          name.includes(query) ||
          (
            queryDigits &&
            digits(
              voter.cedula
            ).includes(
              queryDigits
            )
          );

        const matchesStatus =
          !status ||
          (
            status === 'voted'
              ? Boolean(
                  voter.voto_confirmado
                )
              : !Boolean(
                  voter.voto_confirmado
                )
          );

        return (
          matchesSearch &&
          matchesStatus
        );
      }
    );
  }


  function renderLookupResult(list) {
    const box =
      $('#lookup-result');

    if (!box) return;

    const query =
      $('#voter-search')?.value.trim() ||
      '';

    if (!query) {
      box.className =
        'lookup-result hidden';

      box.innerHTML = '';

      return;
    }

    const exact =
      digits(query).length >= 4
        ? list.find(
            (voter) =>
              digits(
                voter.cedula
              ) ===
              digits(query)
          )
        : null;

    if (exact) {
      box.className =
        `lookup-result ${
          exact.voto_confirmado
            ? 'already-voted'
            : 'not-voted'
        }`;

      box.innerHTML = `
        <span class="lookup-icon">
          ${
            exact.voto_confirmado
              ? '✓'
              : '◷'
          }
        </span>

        <div>

          <small>
            Resultado por cédula
          </small>

          <strong>
            ${
              exact.voto_confirmado
                ? 'YA VOTÓ'
                : 'TODAVÍA NO VOTÓ'
            }
          </strong>

          <p>
            ${esc(
              exact.nombre_completo ||
              exact.nombre ||
              'Votante'
            )}
            · C.I.
            ${esc(
              exact.cedula
            )}
          </p>

        </div>
      `;
    } else if (!list.length) {
      box.className =
        'lookup-result not-found';

      box.innerHTML = `
        <span class="lookup-icon">
          !
        </span>

        <div>

          <small>
            Sin coincidencias
          </small>

          <strong>
            NO ESTÁ EN EL SISTEMA
          </strong>

          <p>
            Revisá la cédula o el nombre.
          </p>

        </div>
      `;
    } else {
      box.className =
        'lookup-result matches';

      box.innerHTML = `
        <span class="lookup-icon">
          ⌕
        </span>

        <div>

          <small>
            Búsqueda
          </small>

          <strong>
            ${list.length}
            COINCIDENCIA${
              list.length === 1
                ? ''
                : 'S'
            }
          </strong>

          <p>
            Elegí a la persona correcta en la lista.
          </p>

        </div>
      `;
    }
  }


  /* =========================================================
     PAGINACIÓN
  ========================================================= */

  function pageRows(
    list,
    pageKey
  ) {
    const pages =
      Math.max(
        1,
        Math.ceil(
          list.length /
          PAGE_SIZE
        )
      );

    state[pageKey] =
      Math.min(
        Math.max(
          1,
          state[pageKey]
        ),
        pages
      );

    const start =
      (
        state[pageKey] - 1
      ) *
      PAGE_SIZE;

    return {
      rows: list.slice(
        start,
        start +
        PAGE_SIZE
      ),
      pages
    };
  }


  function renderPagination(
    target,
    total,
    pages,
    pageKey,
    render
  ) {
    const element =
      $(target);

    if (!element) return;

    const current =
      state[pageKey];

    element.innerHTML =
      total
        ? `
          <span>
            Mostrando
            ${
              (
                current - 1
              ) *
                PAGE_SIZE +
              1
            }-${Math.min(
              current *
                PAGE_SIZE,
              total
            )}
            de ${total}
          </span>

          <div>

            <button
              data-prev
              ${
                current === 1
                  ? 'disabled'
                  : ''
              }>
              ‹ Anterior
            </button>

            <strong>
              Página
              ${current}
              de
              ${pages}
            </strong>

            <button
              data-next
              ${
                current === pages
                  ? 'disabled'
                  : ''
              }>
              Siguiente ›
            </button>

          </div>
        `
        : '';

    const prev =
      $(`${target} [data-prev]`);

    const next =
      $(`${target} [data-next]`);

    if (prev) {
      prev.onclick = () => {
        state[pageKey]--;
        render();
      };
    }

    if (next) {
      next.onclick = () => {
        state[pageKey]++;
        render();
      };
    }
  }


  /* =========================================================
     RENDER PADRÓN GENERAL

     AQUÍ APARECE:
     "AGREGAR A MI LISTA"

     SOLAMENTE PARA ADMINISTRADOR
  ========================================================= */

  function renderVoters() {
    const list =
      filteredVoters();

    renderLookupResult(list);

    if ($('#empty-voters')) {
      $('#empty-voters').classList.toggle(
        'hidden',
        list.length > 0
      );
    }

    const {
      rows,
      pages
    } = pageRows(
      list,
      'voterPage'
    );

    if (!$('#voters-body')) return;

    $('#voters-body').innerHTML =
      rows
        .map((voter) => {
          const listed =
            listRecord(
              voter.id
            );

          /*
            BOTÓN AGREGAR A MI LISTA
          */
          let listButton = '';

          if (isAdmin()) {
            if (listed) {
              listButton = `
                <button
                  class="list-state-btn ${esc(
                    listed.estado_lista ||
                    'agregado'
                  )}"
                  data-open-list="${esc(
                    voter.id
                  )}">

                  ${
                    normalized(
                      listed.estado_lista
                    ) === 'excluido'
                      ? 'Excluido de mi lista'
                      : '★ Agregado a mi lista'
                  }

                </button>
              `;
            } else {
              listButton = `
                <button
                  class="add-list-btn"
                  data-add-list="${esc(
                    voter.id
                  )}">

                  ＋ Agregar a mi lista

                </button>
              `;
            }
          }


          /*
            BOTÓN ESTADO DE VOTO
          */
          const voteAction =
            voter.voto_confirmado
              ? (
                  isAdmin()
                    ? `
                      <button
                        class="undo-btn"
                        data-vote="${esc(
                          voter.id
                        )}"
                        data-value="false">

                        Deshacer

                      </button>
                    `
                    : `
                      <span
                        class="locked-state">

                        Confirmado

                      </span>
                    `
                )
              : `
                  <button
                    class="vote-btn"
                    data-vote="${esc(
                      voter.id
                    )}"
                    data-value="true">

                    ✓ Marcar votó

                  </button>
                `;


          return `
            <tr>

              <td>
                ${esc(
                  voter.mesa ??
                  '—'
                )}
              </td>

              <td>
                ${esc(
                  voter.orden ??
                  voter.numero_orden ??
                  '—'
                )}
              </td>

              <td>
                ${esc(
                  voter.cedula
                )}
              </td>

              <td>
                <strong>
                  ${esc(
                    voter.nombre_completo ||
                    voter.nombre ||
                    '—'
                  )}
                </strong>
              </td>

              <td>
                ${esc(
                  voter.fecha_nacimiento
                    ? fmtDate(
                        voter.fecha_nacimiento
                      )
                    : '—'
                )}
              </td>

              <td>
                ${esc(
                  voter.partido ||
                  '—'
                )}
              </td>

              <td>
                ${esc(
                  voter.edad ??
                  '—'
                )}
              </td>

              <td>
                ${esc(
                  voter.tipo_voto ||
                  '—'
                )}
              </td>

              <td>
                ${esc(
                  voter.tipo_inscripcion ||
                  '—'
                )}
              </td>

              <td>
                ${esc(
                  voter.institucion ||
                  '—'
                )}
              </td>

              <td>

                <span
                  class="status ${
                    voter.voto_confirmado
                      ? 'voted'
                      : 'pending'
                  }">

                  ${
                    voter.voto_confirmado
                      ? '✓ Ya votó'
                      : '◷ Pendiente'
                  }

                </span>

              </td>

              <td>

                <div class="row-actions">

                  ${voteAction}

                </div>

              </td>

              ${
                isAdmin()
                  ? `
                    <td>
                      ${listButton}
                    </td>
                  `
                  : ''
              }

            </tr>
          `;
        })
        .join('');


    $$('[data-vote]').forEach(
      (button) => {
        button.onclick =
          () =>
            toggleVote(
              button.dataset.vote,
              button.dataset.value ===
                'true'
            );
      }
    );


    $$('[data-add-list]').forEach(
      (button) => {
        button.onclick =
          () =>
            openListForm(
              button.dataset.addList
            );
      }
    );


    $$('[data-open-list]').forEach(
      (button) => {
        button.onclick =
          () =>
            openListForm(
              button.dataset.openList
            );
      }
    );


    renderPagination(
      '#voters-pagination',
      list.length,
      pages,
      'voterPage',
      renderVoters
    );
  }


  /* =========================================================
     MIS VOTANTES
  ========================================================= */

  function joinedList() {
    const voterMap = new Map(
      state.votantes.map(
        (voter) => [
          String(voter.id),
          voter
        ]
      )
    );

    return state.lista
      .map((row) => ({
        ...row,

        voter:
          voterMap.get(
            String(
              row.votante_id
            )
          )
      }))
      .filter(
        (row) =>
          row.voter
      );
  }


  function filteredList() {
    const query =
      normalized(
        $('#list-search')?.value ||
        ''
      );

    const vote =
      $('#list-vote-filter')?.value ||
      '';

    const listState =
      $('#list-state-filter')?.value ||
      '';

    const transfer =
      $('#list-transfer-filter')?.value ||
      '';

    return joinedList().filter(
      (row) => {
        const haystack =
          normalized(`
            ${
              row.voter
                .nombre_completo ||
              row.voter.nombre ||
              ''
            }
            ${
              row.voter.cedula ||
              ''
            }
            ${
              row.encargado ||
              ''
            }
            ${
              row.ciudad ||
              ''
            }
          `);

        const matchesQuery =
          !query ||
          haystack.includes(
            query
          );

        const matchesVote =
          !vote ||
          (
            vote === 'voted'
              ? Boolean(
                  row.voter
                    .voto_confirmado
                )
              : !Boolean(
                  row.voter
                    .voto_confirmado
                )
          );

        const matchesList =
          !listState ||
          normalized(
            row.estado_lista
          ) ===
            normalized(
              listState
            );

        const matchesTransfer =
          !transfer ||
          (
            transfer === 'ok'
              ? Boolean(
                  row.traslado_ok
                )
              : !Boolean(
                  row.traslado_ok
                )
          );

        return (
          matchesQuery &&
          matchesVote &&
          matchesList &&
          matchesTransfer
        );
      }
    );
  }


  function renderMyList() {
    if (!isAdmin()) return;

    const list =
      filteredList();

    if ($('#empty-list')) {
      $('#empty-list').classList.toggle(
        'hidden',
        list.length > 0
      );
    }

    const {
      rows,
      pages
    } = pageRows(
      list,
      'listPage'
    );

    if (!$('#my-list-body')) return;

    $('#my-list-body').innerHTML =
      rows
        .map((row) => {
          const excluded =
            normalized(
              row.estado_lista
            ) === 'excluido';

          return `
            <tr>

              <td>
                ${esc(
                  row.voter.mesa ??
                  '—'
                )}
              </td>

              <td>
                ${esc(
                  row.voter.orden ??
                  row.voter
                    .numero_orden ??
                  '—'
                )}
              </td>

              <td>
                ${esc(
                  row.voter.cedula
                )}
              </td>

              <td>
                <strong>
                  ${esc(
                    row.voter
                      .nombre_completo ||
                    row.voter.nombre ||
                    '—'
                  )}
                </strong>
              </td>

              <td>
                ${esc(
                  row.voter
                    .institucion ||
                  '—'
                )}
              </td>

              <td>
                ${esc(
                  row.ciudad ||
                  '—'
                )}
              </td>

              <td>
                ${esc(
                  row.celular ||
                  '—'
                )}
              </td>

              <td>
                ${esc(
                  row.encargado ||
                  '—'
                )}
              </td>

              <td>
                ${esc(
                  row.gestion ||
                  'Sin asignar'
                )}
              </td>

              <td>

                <span
                  class="status ${
                    row.voter
                      .voto_confirmado
                      ? 'voted'
                      : 'pending'
                  }">

                  ${
                    row.voter
                      .voto_confirmado
                      ? '✓ Ya votó'
                      : '◷ Pendiente'
                  }

                </span>

              </td>

              <td>

                <span
                  class="status ${
                    excluded
                      ? 'excluded'
                      : 'voted'
                  }">

                  ${
                    excluded
                      ? 'Excluido de mi lista'
                      : 'Agregado en mi lista'
                  }

                </span>

              </td>

              <td>

                <button
                  class="transfer-btn ${
                    row.traslado_ok
                      ? 'ok'
                      : ''
                  }"
                  data-transfer="${esc(
                    row.id
                  )}">

                  ${
                    row.traslado_ok
                      ? '✓ OK'
                      : 'Pendiente'
                  }

                </button>

              </td>

              <td>

                <div class="row-actions">

                  <button
                    class="action-btn view"
                    data-view-list="${esc(
                      row.votante_id
                    )}">

                    Visualizar datos

                  </button>

                  ${
                    !excluded
                      ? `
                        <button
                          class="action-btn danger"
                          data-exclude="${esc(
                            row.id
                          )}">

                          Excluir de mi lista

                        </button>
                      `
                      : `
                        <button
                          class="action-btn"
                          data-restore="${esc(
                            row.id
                          )}">

                          Restaurar a mi lista

                        </button>
                      `
                  }

                </div>

              </td>

            </tr>
          `;
        })
        .join('');


    $$('[data-view-list]').forEach(
      (button) => {
        button.onclick =
          () =>
            openListForm(
              button.dataset
                .viewList
            );
      }
    );


    $$('[data-transfer]').forEach(
      (button) => {
        button.onclick =
          () =>
            toggleTransfer(
              button.dataset
                .transfer
            );
      }
    );


    $$('[data-exclude]').forEach(
      (button) => {
        button.onclick =
          () =>
            setListState(
              button.dataset
                .exclude,
              'excluido'
            );
      }
    );


    $$('[data-restore]').forEach(
      (button) => {
        button.onclick =
          () =>
            setListState(
              button.dataset
                .restore,
              'agregado'
            );
      }
    );


    renderPagination(
      '#list-pagination',
      list.length,
      pages,
      'listPage',
      renderMyList
    );
  }


  /* =========================================================
     MARCAR VOTO
  ========================================================= */

  async function toggleVote(
    id,
    value
  ) {
    if (
      !value &&
      !isAdmin()
    ) {
      return toast(
        'Solo el administrador puede deshacer una confirmación.'
      );
    }

    const voter =
      state.votantes.find(
        (row) =>
          sameId(
            row.id,
            id
          )
      );

    if (!voter) {
      return toast(
        'No se encontró el votante.'
      );
    }

    if (
      !value &&
      !confirm(
        `¿Deshacer la confirmación de ${
          voter.nombre_completo ||
          voter.nombre ||
          'este votante'
        }?`
      )
    ) {
      return;
    }

    try {
      const {
        error
      } = await db.rpc(
        'marcar_estado_voto',
        {
          p_votante_id:
            voter.id,

          p_voto_confirmado:
            value
        }
      );

      if (error) throw error;

      /*
        Actualización local inmediata
        para que la interfaz no se sienta lenta.
      */
      voter.voto_confirmado =
        value;

      voter.voto_hora =
        value
          ? new Date().toISOString()
          : null;

      renderAll();

      toast(
        value
          ? 'Voto confirmado en tiempo real'
          : 'Confirmación deshecha'
      );

      /*
        Después sincroniza nuevamente
        desde Supabase.
      */
      scheduleRefresh();

    } catch (error) {
      toast(
        `No se pudo guardar: ${error.message}`
      );
    }
  }


  /* =========================================================
     MODAL GENERAL
  ========================================================= */

  function showModal({
    eyebrow,
    title,
    fields,
    onSave
  }) {
    $('#modal-eyebrow').textContent =
      eyebrow;

    $('#modal-title').textContent =
      title;

    $('#modal-fields').innerHTML =
      fields;

    const modal =
      $('#modal');

    modal.showModal();

    $('#modal-form').onsubmit =
      async (event) => {
        event.preventDefault();

        const save =
          $('#modal-save');

        save.disabled = true;

        try {
          await onSave(
            new FormData(
              event.currentTarget
            )
          );

          modal.close();

          await refreshData();

        } catch (error) {
          toast(
            error.message
          );
        } finally {
          save.disabled =
            false;
        }
      };
  }


  /* =========================================================
     AGREGAR / VISUALIZAR / EDITAR MI LISTA
  ========================================================= */

  function openListForm(voterId) {
    if (!isAdmin()) {
      return toast(
        'Esta función es exclusiva del administrador.'
      );
    }

    const voter =
      state.votantes.find(
        (row) =>
          sameId(
            row.id,
            voterId
          )
      );

    const existing =
      listRecord(
        voterId
      );

    if (!voter) {
      return toast(
        'No se encontró el votante seleccionado.'
      );
    }

    const fullName =
      voter.nombre_completo ||
      voter.nombre ||
      'Sin nombre';


    /*
      DATOS DEL PADRÓN
    */
    const info = [
      [
        'Mesa',
        voter.mesa
      ],

      [
        'Orden',
        voter.orden ??
        voter.numero_orden
      ],

      [
        'Cédula',
        voter.cedula
      ],

      [
        'Apellido y Nombre',
        fullName
      ],

      [
        'Fecha de nacimiento',
        voter.fecha_nacimiento
          ? fmtDate(
              voter.fecha_nacimiento
            )
          : null
      ],

      [
        'Partido',
        voter.partido
      ],

      [
        'Edad',
        voter.edad
      ],

      [
        'Tipo de voto',
        voter.tipo_voto
      ],

      [
        'Tipo de inscripción',
        voter.tipo_inscripcion
      ],

      [
        'Institución',
        voter.institucion
      ]
    ];


    const infoHtml =
      info
        .map(
          ([label, value]) => `
            <div class="detail-item">

              <span>
                ${esc(label)}
              </span>

              <strong>
                ${esc(
                  value ?? '—'
                )}
              </strong>

            </div>
          `
        )
        .join('');


    /*
      ESTADO EN MI LISTA
      solo aparece si ya existe.
    */
    const stateField =
      existing
        ? `
          <label>

            Estado en mi lista

            <select
              name="estado_lista">

              <option
                value="agregado"
                ${
                  normalized(
                    existing.estado_lista
                  ) !== 'excluido'
                    ? 'selected'
                    : ''
                }>

                Agregado en mi lista

              </option>

              <option
                value="excluido"
                ${
                  normalized(
                    existing.estado_lista
                  ) === 'excluido'
                    ? 'selected'
                    : ''
                }>

                Excluido de mi lista

              </option>

            </select>

          </label>
        `
        : '';


    showModal({
      eyebrow: existing
        ? 'VISUALIZAR DATOS'
        : 'AGREGAR A MI LISTA',

      title:
        fullName,

      fields: `
        <section class="detail-card">

          <div class="detail-card-head">

            <div>

              <span class="eyebrow">
                DATOS DEL PADRÓN
              </span>

              <h4>
                Información del registro
              </h4>

            </div>

            <span
              class="status ${
                voter.voto_confirmado
                  ? 'voted'
                  : 'pending'
              }">

              ${
                voter.voto_confirmado
                  ? '✓ Ya votó'
                  : '◷ Pendiente'
              }

            </span>

          </div>


          <div class="detail-grid">

            ${infoHtml}

          </div>

        </section>


        <section class="admin-card">

          <div class="admin-card-head">

            <div>

              <span class="eyebrow">
                DATOS ADMINISTRATIVOS
              </span>

              <h4>

                ${
                  existing
                    ? 'Seguimiento y edición'
                    : 'Completar para agregar a mi lista'
                }

              </h4>

            </div>


            ${
              existing
                ? `
                  <span
                    class="list-pill ${esc(
                      existing.estado_lista ||
                      'agregado'
                    )}">

                    ${
                      normalized(
                        existing.estado_lista
                      ) === 'excluido'
                        ? 'Excluido de mi lista'
                        : 'Agregado a mi lista'
                    }

                  </span>
                `
                : ''
            }

          </div>


          <div class="form-grid">


            <label>

              Encargado

              <input
                name="encargado"
                required
                maxlength="120"
                value="${esc(
                  existing?.encargado ||
                  ''
                )}"
                placeholder="Nombre del encargado"
              />

            </label>


            <label>

              Celular

              <input
                name="celular"
                inputmode="tel"
                maxlength="30"
                value="${esc(
                  existing?.celular ||
                  ''
                )}"
                placeholder="Ej.: 0981 000 000"
              />

            </label>


            <label>

              Ciudad

              <input
                name="ciudad"
                required
                maxlength="100"
                value="${esc(
                  existing?.ciudad ||
                  'San Patricio'
                )}"
              />

            </label>


            <label>

              Costo de Traslado

              <input
                name="costo_traslado"
                type="number"
                min="0"
                step="1000"
                value="${esc(
                  existing?.costo_traslado ??
                  ''
                )}"
                placeholder="0"
              />

            </label>


            <label>

              Gestión

              <select
                name="gestion">

                <option
                  value="Sin asignar"
                  ${
                    !existing ||
                    existing.gestion ===
                      'Sin asignar'
                      ? 'selected'
                      : ''
                  }>

                  Sin asignar

                </option>


                <option
                  value="Concejalía"
                  ${
                    existing?.gestion ===
                    'Concejalía'
                      ? 'selected'
                      : ''
                  }>

                  Concejalía

                </option>


                <option
                  value="Intendencia + Concejalía"
                  ${
                    existing?.gestion ===
                    'Intendencia + Concejalía'
                      ? 'selected'
                      : ''
                  }>

                  Intendencia + Concejalía

                </option>

              </select>

            </label>


            ${stateField}


          </div>


          <label>

            Observación

            <textarea
              name="observacion"
              maxlength="500"
              placeholder="Escribí la observación">${esc(
                existing?.observacion ||
                ''
              )}</textarea>

          </label>

        </section>
      `,


      onSave:
        async (form) => {
          const row = {
            votante_id:
              voter.id,

            encargado:
              String(
                form.get(
                  'encargado'
                ) ||
                ''
              ).trim(),

            celular:
              String(
                form.get(
                  'celular'
                ) ||
                ''
              ).trim(),

            ciudad:
              String(
                form.get(
                  'ciudad'
                ) ||
                ''
              ).trim(),

            costo_traslado:
              form.get(
                'costo_traslado'
              )
                ? Number(
                    form.get(
                      'costo_traslado'
                    )
                  )
                : null,

            observacion:
              String(
                form.get(
                  'observacion'
                ) ||
                ''
              ).trim(),

            gestion:
              form.get(
                'gestion'
              ),

            estado_lista:
              existing
                ? form.get(
                    'estado_lista'
                  )
                : 'agregado',

            actualizado_en:
              new Date().toISOString()
          };


          let query;


          /*
            SI YA EXISTE:
            actualiza.
          */
          if (existing) {
            query = db
              .from(
                'mis_votantes'
              )
              .update(row)
              .eq(
                'id',
                existing.id
              );
          }


          /*
            SI NO EXISTE:
            agrega y traslado queda
            PENDIENTE por defecto.
          */
          else {
            query = db
              .from(
                'mis_votantes'
              )
              .insert({
                ...row,

                traslado_ok:
                  false,

                creado_por:
                  state.user.id
              });
          }


          const {
            error
          } = await query;


          if (error) {
            throw error;
          }


          toast(
            existing
              ? 'Datos actualizados correctamente'
              : 'Agregado a mi lista'
          );
        }
    });
  }


  /* =========================================================
     EXCLUIR / RESTAURAR
  ========================================================= */

  async function setListState(
    id,
    value
  ) {
    if (!isAdmin()) return;

    if (
      value === 'excluido' &&
      !confirm(
        'El registro seguirá visible, pero no contará en el resumen. ¿Continuar?'
      )
    ) {
      return;
    }

    const existing =
      state.lista.find(
        (row) =>
          sameId(
            row.id,
            id
          )
      );

    if (!existing) {
      return toast(
        'No se encontró el registro.'
      );
    }

    const {
      error
    } = await db
      .from(
        'mis_votantes'
      )
      .update({
        estado_lista:
          value,

        actualizado_en:
          new Date().toISOString()
      })
      .eq(
        'id',
        existing.id
      );

    if (error) {
      return toast(
        `No se pudo actualizar: ${error.message}`
      );
    }

    await refreshData();

    toast(
      value === 'excluido'
        ? 'Excluido de mi lista'
        : 'Restaurado en mi lista'
    );
  }


  /* =========================================================
     TRASLADO
  ========================================================= */

  async function toggleTransfer(
    id
  ) {
    if (!isAdmin()) return;

    const row =
      state.lista.find(
        (item) =>
          sameId(
            item.id,
            id
          )
      );

    if (!row) {
      return toast(
        'No se encontró el registro.'
      );
    }

    const newValue =
      !Boolean(
        row.traslado_ok
      );

    const {
      error
    } = await db
      .from(
        'mis_votantes'
      )
      .update({
        traslado_ok:
          newValue,

        actualizado_en:
          new Date().toISOString()
      })
      .eq(
        'id',
        row.id
      );

    if (error) {
      return toast(
        `No se pudo actualizar: ${error.message}`
      );
    }

    /*
      Actualización inmediata
    */
    row.traslado_ok =
      newValue;

    renderStats();
    renderSummary();
    renderMyList();

    toast(
      newValue
        ? 'Traslado marcado como OK'
        : 'Traslado marcado pendiente'
    );

    scheduleRefresh();
  }


  /* =========================================================
     USUARIOS
  ========================================================= */

  async function managerRequest(
    body
  ) {
    const {
      data: {
        session
      }
    } =
      await db.auth.getSession();

    if (!session) {
      throw new Error(
        'La sesión venció. Volvé a ingresar.'
      );
    }

    const response =
      await fetch(
        `${cfg.SUPABASE_URL}/functions/v1/crear-encargado`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${session.access_token}`
          },

          body:
            JSON.stringify(
              body
            )
        }
      );


    let result = {};

    try {
      result =
        await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      throw new Error(
        result.error ||
        'No se pudo completar la operación'
      );
    }

    return result;
  }


  function renderManagers() {
    if (
      !isAdmin() ||
      !$('#managers-grid')
    ) {
      return;
    }


    /*
      El sistema tiene dos perfiles:
      Administrador y Consulta.

      Se muestran todos los perfiles
      que NO son administradores.
    */
    const consultaUsers =
      state.profiles.filter(
        (profile) =>
          !isAdminRole(
            profile.rol
          )
      );


    $('#managers-grid').innerHTML =
      consultaUsers
        .map(
          (profile) => `
            <article class="entity-card">

              <div class="entity-card-top">

                <div class="manager-head">

                  <div class="avatar">

                    ${initials(
                      profile.nombre ||
                      'Usuario'
                    )}

                  </div>

                  <div>

                    <h4>
                      ${esc(
                        profile.nombre ||
                        'Usuario'
                      )}
                    </h4>

                    <p>
                      ${esc(
                        profile.email ||
                        ''
                      )}
                    </p>

                  </div>

                </div>


                <div class="card-actions">

                  <button
                    class="action-btn"
                    data-edit-manager="${esc(
                      profile.id
                    )}">

                    Editar

                  </button>


                  <button
                    class="action-btn danger"
                    data-delete-manager="${esc(
                      profile.id
                    )}">

                    Eliminar

                  </button>

                </div>

              </div>


              <div class="mini-stats">

                <span>
                  Perfil de consulta general
                </span>

                <strong>
                  ${
                    profile.activo
                      ? 'Activo'
                      : 'Inactivo'
                  }
                </strong>

              </div>

            </article>
          `
        )
        .join('') ||
      `
        <div class="empty">
          Todavía no hay usuarios de consulta.
        </div>
      `;


    $$('[data-edit-manager]').forEach(
      (button) => {
        button.onclick =
          () => {
            const profile =
              state.profiles.find(
                (item) =>
                  sameId(
                    item.id,
                    button.dataset
                      .editManager
                  )
              );

            if (profile) {
              openManager(
                profile
              );
            }
          };
      }
    );


    $$('[data-delete-manager]').forEach(
      (button) => {
        button.onclick =
          () =>
            deleteManager(
              button.dataset
                .deleteManager
            );
      }
    );
  }


  function openManager(
    existing = null
  ) {
    if (!isAdmin()) return;

    showModal({
      eyebrow:
        'CONTROL DE ACCESO',

      title:
        existing
          ? 'Editar usuario'
          : 'Crear usuario de consulta',

      fields: `
        <label>

          Nombre y apellido

          <input
            name="nombre"
            required
            maxlength="100"
            value="${esc(
              existing?.nombre ||
              ''
            )}"
          />

        </label>


        <label>

          Correo electrónico

          <input
            name="email"
            type="email"
            required
            value="${esc(
              existing?.email ||
              ''
            )}"
          />

        </label>


        <label>

          ${
            existing
              ? 'Nueva contraseña (opcional)'
              : 'Contraseña temporal'
          }

          <input
            name="password"
            type="password"
            ${
              existing
                ? ''
                : 'required'
            }
            minlength="8"
          />

        </label>
      `,


      onSave:
        async (form) => {
          await managerRequest({
            action:
              existing
                ? 'update'
                : 'create',

            id:
              existing?.id,

            nombre:
              String(
                form.get(
                  'nombre'
                ) ||
                ''
              ).trim(),

            email:
              String(
                form.get(
                  'email'
                ) ||
                ''
              ).trim(),

            password:
              String(
                form.get(
                  'password'
                ) ||
                ''
              )
          });


          toast(
            existing
              ? 'Usuario actualizado'
              : 'Usuario de consulta creado'
          );
        }
    });
  }


  async function deleteManager(
    id
  ) {
    if (!isAdmin()) return;

    const manager =
      state.profiles.find(
        (profile) =>
          sameId(
            profile.id,
            id
          )
      );

    if (!manager) return;

    if (
      !confirm(
        `¿Eliminar definitivamente la cuenta de ${manager.nombre}?`
      )
    ) {
      return;
    }

    try {
      await managerRequest({
        action:
          'delete',

        id:
          manager.id
      });

      await refreshData();

      toast(
        'Usuario eliminado'
      );

    } catch (error) {
      toast(
        `No se pudo eliminar: ${error.message}`
      );
    }
  }


  /* =========================================================
     NAVEGACIÓN
  ========================================================= */

  function navigate(page) {
    if (
      !document.getElementById(
        page
      ) ||
      (
        !isAdmin() &&
        page !== 'votantes'
      )
    ) {
      page =
        isAdmin()
          ? 'dashboard'
          : 'votantes';
    }

    $$('.page').forEach(
      (element) => {
        element.classList.toggle(
          'active',
          element.id === page
        );
      }
    );

    $$('#nav button').forEach(
      (button) => {
        button.classList.toggle(
          'active',
          button.dataset.page ===
            page
        );
      }
    );

    localStorage.setItem(
      'control-electoral-page',
      page
    );
  }


  /* =========================================================
     EVENTOS
  ========================================================= */

  if ($('#login-form')) {
    $('#login-form').onsubmit =
      async (event) => {
        event.preventDefault();

        const button =
          event.currentTarget.querySelector(
            'button'
          );

        button.disabled =
          true;

        button.textContent =
          'Ingresando…';

        try {
          await login(
            $('#email').value.trim(),
            $('#password').value
          );
        } catch (error) {
          toast(
            error.message
          );
        } finally {
          button.disabled =
            false;

          button.textContent =
            'Ingresar';
        }
      };
  }


  if ($('#logout')) {
    $('#logout').onclick =
      async () => {
        await db.auth.signOut();

        if (state.channel) {
          await db.removeChannel(
            state.channel
          );
        }

        localStorage.removeItem(
          'control-electoral-page'
        );

        location.reload();
      };
  }


  if ($('#modal-close')) {
    $('#modal-close').onclick =
      () =>
        $('#modal').close();
  }


  if ($('#modal-cancel')) {
    $('#modal-cancel').onclick =
      () =>
        $('#modal').close();
  }


  $$('#nav button').forEach(
    (button) => {
      button.onclick =
        () =>
          navigate(
            button.dataset.page
          );
    }
  );


  if ($('#new-manager')) {
    $('#new-manager').onclick =
      () =>
        openManager();
  }


  if ($('#voter-search')) {
    $('#voter-search').addEventListener(
      'input',
      () => {
        state.voterPage = 1;
        renderVoters();
      }
    );
  }


  if ($('#filter-status')) {
    $('#filter-status').addEventListener(
      'change',
      () => {
        state.voterPage = 1;
        renderVoters();
      }
    );
  }


  [
    '#list-search',
    '#list-vote-filter',
    '#list-state-filter',
    '#list-transfer-filter'
  ].forEach((selector) => {
    const element =
      $(selector);

    if (!element) return;

    element.addEventListener(
      selector ===
        '#list-search'
        ? 'input'
        : 'change',

      () => {
        state.listPage = 1;

        if (isAdmin()) {
          renderMyList();
        }
      }
    );
  });


  /* =========================================================
     RESTAURAR SESIÓN
  ========================================================= */

  async function restoreSession() {
    if (!hasSupabase) return;

    try {
      const {
        data: {
          session
        }
      } =
        await db.auth.getSession();

      if (!session) return;


      const {
        data: profile,
        error
      } = await db
        .from('perfiles')
        .select('*')
        .eq(
          'id',
          session.user.id
        )
        .single();


      if (
        error ||
        !profile?.activo
      ) {
        await db.auth.signOut();
        return;
      }


      state.user =
        profile;


      await loadAll();

      subscribeRealtime();

      enterApp();

    } catch (error) {
      console.warn(
        'No se pudo restaurar la sesión:',
        error.message
      );
    }
  }


  /* =========================================================
     INICIAR
  ========================================================= */

  restoreSession();

})();