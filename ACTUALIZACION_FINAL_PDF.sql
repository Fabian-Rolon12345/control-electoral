-- ============================================================
-- CONTROL ELECTORAL - ACTUALIZACION FINAL SEGUN PDF FUNCIONAL
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- Idempotente: puede ejecutarse sobre la instalacion existente.
-- No elimina votantes ni usuarios.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- Funcion auxiliar de seguridad.
create or replace function public.soy_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles
    where id = auth.uid()
      and rol = 'admin'
      and activo = true
  )
$$;

grant execute on function public.soy_admin() to authenticated;

-- El perfil de consulta accede al padron general, sin depender de barrio.
alter table public.perfiles drop constraint if exists encargado_con_barrio;
update public.perfiles set barrio_id = null where rol = 'encargado';

-- Seguimiento de "Mis votantes".
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
  actualizado_en timestamptz not null default now()
);

-- Compatibilidad si la tabla ya existia en una version anterior.
alter table public.mis_votantes add column if not exists encargado text;
alter table public.mis_votantes add column if not exists celular text;
alter table public.mis_votantes add column if not exists ciudad text default 'San Patricio';
alter table public.mis_votantes add column if not exists costo_traslado numeric(14,2);
alter table public.mis_votantes add column if not exists observacion text;
alter table public.mis_votantes add column if not exists gestion text default 'Sin asignar';
alter table public.mis_votantes add column if not exists estado_lista text default 'agregado';
alter table public.mis_votantes add column if not exists traslado_ok boolean default false;
alter table public.mis_votantes add column if not exists creado_por uuid references public.perfiles(id) on delete set null;
alter table public.mis_votantes add column if not exists creado_en timestamptz default now();
alter table public.mis_votantes add column if not exists actualizado_en timestamptz default now();

update public.mis_votantes set ciudad = 'San Patricio' where ciudad is null;
update public.mis_votantes set gestion = 'Sin asignar' where gestion is null;
update public.mis_votantes set estado_lista = 'agregado' where estado_lista is null;
update public.mis_votantes set traslado_ok = false where traslado_ok is null;

alter table public.mis_votantes alter column ciudad set default 'San Patricio';
alter table public.mis_votantes alter column gestion set default 'Sin asignar';
alter table public.mis_votantes alter column estado_lista set default 'agregado';
alter table public.mis_votantes alter column traslado_ok set default false;

-- Restricciones funcionales.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mis_votantes_costo_valido') then
    alter table public.mis_votantes
      add constraint mis_votantes_costo_valido
      check (costo_traslado is null or costo_traslado >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mis_votantes_gestion_valida') then
    alter table public.mis_votantes
      add constraint mis_votantes_gestion_valida
      check (gestion in ('Sin asignar','Concejalía','Intendencia + Concejalía'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mis_votantes_estado_valido') then
    alter table public.mis_votantes
      add constraint mis_votantes_estado_valido
      check (estado_lista in ('agregado','excluido'));
  end if;
end $$;

create index if not exists mis_votantes_estado_idx on public.mis_votantes(estado_lista);
create index if not exists mis_votantes_traslado_idx on public.mis_votantes(traslado_ok);

-- Permisos: consulta puede leer el padron y marcar voto por RPC.
-- Solo admin puede trabajar con "Mis votantes" mediante RLS.
grant usage on schema public to authenticated;
grant select on public.perfiles, public.votantes to authenticated;
grant select, insert, update on public.mis_votantes to authenticated;
revoke delete on public.mis_votantes from authenticated;
revoke insert, update, delete on public.votantes from authenticated;

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

-- Cualquier perfil activo puede consultar el padron general.
drop policy if exists "votantes visibles por rol" on public.votantes;
drop policy if exists "votantes insertar por rol" on public.votantes;
drop policy if exists "votantes actualizar por rol" on public.votantes;
drop policy if exists "votantes eliminar admin" on public.votantes;
drop policy if exists "votantes lectura general" on public.votantes;

create policy "votantes lectura general"
on public.votantes for select to authenticated
using (exists (
  select 1
  from public.perfiles
  where id = auth.uid() and activo = true
));

-- Marcar como voto:
-- - Perfil consulta: puede pasar de pendiente a votado.
-- - Administrador: tambien puede deshacer una confirmacion.
-- La funcion NO permite editar otros datos del padron.
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

  if p_voto_confirmado = false and not public.soy_admin() then
    raise exception 'Solo el administrador puede deshacer una confirmacion';
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

-- Realtime para cambios en "Mis votantes".
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

-- ============================================================
-- VERIFICACION FINAL
-- Todos los resultados deben devolver TRUE.
-- ============================================================
select 'tabla_mis_votantes' as verificacion,
       to_regclass('public.mis_votantes') is not null as correcto
union all
select 'funcion_marcar_voto',
       to_regprocedure('public.marcar_estado_voto(uuid,boolean)') is not null
union all
select 'perfiles_sin_barrio_obligatorio',
       not exists (select 1 from pg_constraint where conname = 'encargado_con_barrio')
union all
select 'consulta_sin_update_directo_padron',
       not has_table_privilege('authenticated','public.votantes','UPDATE')
union all
select 'mis_votantes_con_rls',
       (select relrowsecurity from pg_class where oid = 'public.mis_votantes'::regclass);
