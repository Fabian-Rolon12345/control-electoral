-- CONTROL ELECTORAL - ACTUALIZACION SEGUN DOCUMENTO FUNCIONAL
-- Ejecutar UNA SOLA VEZ en Supabase > SQL Editor > New query.
-- Es segura para los votantes y usuarios existentes: no elimina registros.

begin;

-- Los perfiles de consulta ya no dependen de un barrio.
alter table public.perfiles drop constraint if exists encargado_con_barrio;
update public.perfiles set barrio_id = null where rol = 'encargado';

-- Seguimiento administrativo de "Mis votantes".
create table if not exists public.mis_votantes (
  id uuid primary key default gen_random_uuid(),
  votante_id uuid not null unique references public.votantes(id) on delete cascade,
  encargado text not null,
  celular text,
  ciudad text not null default 'San Patricio',
  costo_traslado numeric(14,2),
  observacion text,
  gestion text not null default 'Sin asignar',
  estado_lista text not null default 'agregado',
  traslado_ok boolean not null default false,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint mis_votantes_costo_valido check (costo_traslado is null or costo_traslado >= 0),
  constraint mis_votantes_gestion_valida check (gestion in ('Sin asignar','Concejalía','Intendencia + Concejalía')),
  constraint mis_votantes_estado_valido check (estado_lista in ('agregado','excluido'))
);

create index if not exists mis_votantes_estado_idx on public.mis_votantes(estado_lista);
create index if not exists mis_votantes_traslado_idx on public.mis_votantes(traslado_ok);

grant usage on schema public to authenticated;
grant select on public.perfiles, public.votantes to authenticated;
grant select, insert, update on public.mis_votantes to authenticated;

alter table public.mis_votantes enable row level security;

drop policy if exists "mis votantes solo admin lectura" on public.mis_votantes;
drop policy if exists "mis votantes solo admin insertar" on public.mis_votantes;
drop policy if exists "mis votantes solo admin actualizar" on public.mis_votantes;

create policy "mis votantes solo admin lectura"
on public.mis_votantes for select to authenticated
using (public.soy_admin());

create policy "mis votantes solo admin insertar"
on public.mis_votantes for insert to authenticated
with check (public.soy_admin() and creado_por = auth.uid());

create policy "mis votantes solo admin actualizar"
on public.mis_votantes for update to authenticated
using (public.soy_admin())
with check (public.soy_admin());

-- Todo usuario activo puede consultar el padrón general.
drop policy if exists "votantes visibles por rol" on public.votantes;
drop policy if exists "votantes insertar por rol" on public.votantes;
drop policy if exists "votantes actualizar por rol" on public.votantes;
drop policy if exists "votantes lectura general" on public.votantes;

create policy "votantes lectura general"
on public.votantes for select to authenticated
using (exists (
  select 1 from public.perfiles
  where id = auth.uid() and activo = true
));

-- La confirmación del voto se hace únicamente mediante esta función.
-- Evita que el perfil de consulta modifique nombres, cédulas u otros datos.
revoke insert, update, delete on public.votantes from authenticated;

create or replace function public.marcar_estado_voto(
  p_votante_id uuid,
  p_voto_confirmado boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.perfiles
    where id = auth.uid() and activo = true
  ) then
    raise exception 'Usuario no autorizado';
  end if;

  update public.votantes
  set voto_confirmado = p_voto_confirmado,
      voto_hora = case when p_voto_confirmado then now() else null end,
      voto_registrado_por = case when p_voto_confirmado then auth.uid() else null end,
      actualizado_en = now()
  where id = p_votante_id;

  if not found then
    raise exception 'Votante no encontrado';
  end if;
end;
$$;

revoke all on function public.marcar_estado_voto(uuid, boolean) from public;
grant execute on function public.marcar_estado_voto(uuid, boolean) to authenticated;

-- Agrega la tabla a Realtime solamente si todavía no está incluida.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mis_votantes'
  ) then
    alter publication supabase_realtime add table public.mis_votantes;
  end if;
end $$;

commit;

-- Verificación final: debe devolver 3 filas con TRUE.
select 'tabla_mis_votantes' as verificacion, to_regclass('public.mis_votantes') is not null as correcto
union all
select 'funcion_marcar_voto', to_regprocedure('public.marcar_estado_voto(uuid,boolean)') is not null
union all
select 'perfiles_sin_barrio', not exists (
  select 1 from pg_constraint where conname = 'encargado_con_barrio'
);
