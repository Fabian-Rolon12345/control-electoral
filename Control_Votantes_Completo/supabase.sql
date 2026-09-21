-- Ejecutar una sola vez en Supabase > SQL Editor.
create extension if not exists pgcrypto;

create type public.rol_usuario as enum ('admin', 'encargado');

create table public.barrios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email text not null,
  rol public.rol_usuario not null default 'encargado',
  barrio_id uuid references public.barrios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  constraint encargado_con_barrio check (rol = 'admin' or barrio_id is not null)
);

create table public.votantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cedula text not null unique,
  telefono text,
  barrio_id uuid not null references public.barrios(id),
  voto_confirmado boolean not null default false,
  voto_hora timestamptz,
  voto_registrado_por uuid references public.perfiles(id),
  registrado_por uuid not null references public.perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.auditoria (
  id bigint generated always as identity primary key,
  accion text not null,
  usuario_id uuid not null references public.perfiles(id),
  creado_en timestamptz not null default now()
);

create index votantes_barrio_idx on public.votantes(barrio_id);
create index votantes_cedula_idx on public.votantes(cedula);
create unique index votantes_cedula_normalizada_uidx on public.votantes ((regexp_replace(cedula, '[^0-9]', '', 'g')));
create index votantes_nombre_busqueda_idx on public.votantes ((lower(nombre)));
create index votantes_telefono_busqueda_idx on public.votantes ((regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g')));
create index auditoria_fecha_idx on public.auditoria(creado_en desc);

-- Permisos explícitos: el proyecto fue creado sin exposición automática.
revoke all on public.barrios, public.perfiles, public.votantes, public.auditoria from anon;
grant usage on schema public to authenticated;
grant select on public.barrios, public.perfiles to authenticated;
grant select, insert, update on public.votantes to authenticated;
grant select, insert on public.auditoria to authenticated;
grant usage, select on sequence public.auditoria_id_seq to authenticated;

alter table public.barrios enable row level security;
alter table public.perfiles enable row level security;
alter table public.votantes enable row level security;
alter table public.auditoria enable row level security;

create or replace function public.mi_perfil()
returns public.perfiles language sql stable security definer set search_path = public
as $$ select * from public.perfiles where id = auth.uid() and activo = true $$;

create or replace function public.soy_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin' and activo=true) $$;

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

alter publication supabase_realtime add table public.votantes;
alter publication supabase_realtime add table public.auditoria;
alter publication supabase_realtime add table public.barrios;

-- Después de crear manualmente el primer usuario en Authentication > Users,
-- reemplazar los valores y ejecutar este INSERT para convertirlo en administrador:
-- insert into public.perfiles(id,nombre,email,rol)
-- values ('UUID_DEL_USUARIO','Nombre del administrador','correo@ejemplo.com','admin');
