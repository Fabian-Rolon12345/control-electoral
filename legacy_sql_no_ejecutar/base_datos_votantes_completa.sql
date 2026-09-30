-- Base de datos completa para padrón de votantes
-- Ejecutar en Supabase > SQL Editor.

create extension if not exists pgcrypto;

create type public.rol_usuario as enum ('admin', 'encargado');

create table if not exists public.barrios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  codigo text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email text not null,
  rol public.rol_usuario not null default 'encargado',
  barrio_id uuid references public.barrios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  constraint encargado_con_barrio check (rol = 'admin' or barrio_id is not null)
);

create table if not exists public.votantes (
  id uuid primary key default gen_random_uuid(),

  -- Datos básicos
  nombre text,
  segundo_nombre text,
  apellido text,
  apellido_materno text,
  nombre_completo text,
  cedula text not null,
  telefono text,
  celular text,
  email text,
  sexo text,
  fecha_nacimiento date,
  edad integer,
  estado_civil text,
  nacionalidad text,

  -- Ubicación / barrio
  barrio_id uuid references public.barrios(id),
  barrio text,
  departamento text,
  ciudad text,
  municipio text,
  distrito text,
  zona text,
  sector text,
  direccion text,
  numero_casa text,
  manzana text,
  lote text,
  referencia text,

  -- datos adicionales del padron
  numero_orden integer,
  mesa text,
  circuito text,
  junta text,
  observaciones text,
  foto_url text,

  -- Estado de votación
  voto_confirmado boolean not null default false,
  voto_hora timestamptz,
  voto_registrado_por uuid references public.perfiles(id),
  registrado_por uuid references public.perfiles(id),

  -- Auditoría
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  unique (cedula)
);

create table if not exists public.votantes_importacion (
  id bigint generated always as identity primary key,
  fila integer,
  nombre text,
  segundo_nombre text,
  apellido text,
  apellido_materno text,
  nombre_completo text,
  cedula text,
  telefono text,
  celular text,
  email text,
  sexo text,
  fecha_nacimiento text,
  edad text,
  estado_civil text,
  nacionalidad text,
  barrio text,
  departamento text,
  ciudad text,
  municipio text,
  distrito text,
  zona text,
  sector text,
  direccion text,
  numero_casa text,
  manzana text,
  lote text,
  referencia text,
  numero_orden text,
  mesa text,
  circuito text,
  junta text,
  observaciones text,
  voto_confirmado text,
  voto_hora text,
  raw_data jsonb,
  creado_en timestamptz not null default now()
);

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  accion text not null,
  usuario_id uuid not null references public.perfiles(id),
  creado_en timestamptz not null default now()
);

create index if not exists votantes_barrio_idx on public.votantes(barrio_id);
create index if not exists votantes_cedula_idx on public.votantes(cedula);
create unique index if not exists votantes_cedula_normalizada_uidx on public.votantes ((regexp_replace(cedula, '[^0-9]', '', 'g')));
create index if not exists votantes_nombre_busqueda_idx on public.votantes ((lower(coalesce(nombre, '')) || ' ' || lower(coalesce(apellido, ''))));
create index if not exists votantes_telefono_busqueda_idx on public.votantes ((regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g')));
create index if not exists votantes_barrio_text_idx on public.votantes (lower(coalesce(barrio, '')));
create index if not exists votantes_departamento_idx on public.votantes (lower(coalesce(departamento, '')));
create index if not exists votantes_ciudad_idx on public.votantes (lower(coalesce(ciudad, '')));
create index if not exists auditoria_fecha_idx on public.auditoria(creado_en desc);

revoke all on public.barrios, public.perfiles, public.votantes, public.votantes_importacion, public.auditoria from anon;
grant usage on schema public to authenticated;
grant select on public.barrios, public.perfiles to authenticated;
grant select, insert, update on public.votantes to authenticated;
grant select, insert on public.votantes_importacion to authenticated;
grant select, insert on public.auditoria to authenticated;
grant usage, select on sequence public.auditoria_id_seq to authenticated;

after this line, if you are using this schema in Supabase with Real-time enabled, continue with the RLS settings below:

alter table public.barrios enable row level security;
alter table public.perfiles enable row level security;
alter table public.votantes enable row level security;
alter table public.votantes_importacion enable row level security;
alter table public.auditoria enable row level security;

create or replace function public.mi_perfil()
returns public.perfiles language sql stable security definer set search_path = public
as $$
  select * from public.perfiles where id = auth.uid() and activo = true
$$;

create or replace function public.soy_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.perfiles where id=auth.uid() and rol='admin' and activo=true
  )
$$;

grant execute on function public.mi_perfil() to authenticated;
grant execute on function public.soy_admin() to authenticated;

create policy "barrios lectura autenticada" on public.barrios for select to authenticated using (true);
create policy "barrios administra admin" on public.barrios for all to authenticated using (public.soy_admin()) with check (public.soy_admin());

create policy "perfil propio o admin" on public.perfiles for select to authenticated
using (id=auth.uid() or public.soy_admin());
create policy "admin actualiza perfiles" on public.perfiles for update to authenticated
using (public.soy_admin()) with check (public.soy_admin());

create policy "votantes visibles por rol" on public.votantes for select to authenticated
using (public.soy_admin() or barrio_id=(select barrio_id from public.mi_perfil()));
create policy "votantes insertar por rol" on public.votantes for insert to authenticated
with check (public.soy_admin() or barrio_id=(select barrio_id from public.mi_perfil()));
create policy "votantes actualizar por rol" on public.votantes for update to authenticated
using (public.soy_admin() or barrio_id=(select barrio_id from public.mi_perfil()))
with check (public.soy_admin() or barrio_id=(select barrio_id from public.mi_perfil()));

create policy "auditoria visible por rol" on public.auditoria for select to authenticated
using (public.soy_admin() or usuario_id=auth.uid());
create policy "auditoria insertar propia" on public.auditoria for insert to authenticated
with check (usuario_id=auth.uid());

create policy "importacion lectura autenticada" on public.votantes_importacion for select to authenticated using (true);
create policy "importacion escritura autenticada" on public.votantes_importacion for insert to authenticated with check (true);

alter publication supabase_realtime add table public.votantes;
alter publication supabase_realtime add table public.auditoria;
alter publication supabase_realtime add table public.barrios;

-- Ejemplo para insertar un administrador después de crear el usuario en Authentication > Users
-- insert into public.perfiles(id,nombre,email,rol)
-- values ('UUID_DEL_USUARIO','Administrador','correo@ejemplo.com','admin');

-- Ejemplo de carga desde Excel/CSV a la tabla de importación
-- 1) Importar el CSV a public.votantes_importacion.
-- 2) Luego mapear las columnas y moverlos a public.votantes como quieras.
--
-- insert into public.votantes (
--   nombre,
--   apellido,
--   cedula,
--   telefono,
--   celular,
--   barrio,
--   departamento,
--   ciudad,
--   municipio,
--   direccion,
--   voto_confirmado,
--   voto_hora,
--   registrado_por
-- )
-- select
--   coalesce(i.nombre, ''),
--   coalesce(i.apellido, ''),
--   i.cedula,
--   i.telefono,
--   i.celular,
--   i.barrio,
--   i.departamento,
--   i.ciudad,
--   i.municipio,
--   i.direccion,
--   coalesce(i.voto_confirmado::boolean, false),
--   case when trim(i.voto_hora) = '' then null else i.voto_hora::timestamptz end,
--   (select id from public.perfiles where rol = 'admin' limit 1)
-- from public.votantes_importacion i;
