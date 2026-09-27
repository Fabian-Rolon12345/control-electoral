-- Importar votantes reales desde Excel/CSV a la base de datos.
-- Requisitos:
-- 1) Tener creados los barrios en public.barrios.
-- 2) Tener creado el usuario encargado/admin en public.perfiles.
-- 3) Exportar el padrón a CSV con columnas:
--    nombre, cedula, telefono, barrio, voto_confirmado, voto_hora
--
-- Ejemplo de datos esperados en la tabla public.votantes:
--   id UUID se genera solo.
--   nombre text
--   cedula text unique
--   telefono text
--   barrio_id uuid
--   voto_confirmado boolean
--   voto_hora timestamptz
--   voto_registrado_por uuid
--   registrado_por uuid
--   creado_en timestamptz default now()
--   actualizado_en timestamptz default now()

-- 1) Ver barrios disponibles
select id, nombre from public.barrios order by nombre;

-- 2) Ver perfiles disponibles para registrar autor
select id, nombre, email, rol, barrio_id from public.perfiles order by nombre;

-- 3) Ejemplo de inserción manual
-- Reemplazar los valores reales por los del padrón.
insert into public.votantes (
  nombre,
  cedula,
  telefono,
  barrio_id,
  voto_confirmado,
  voto_hora,
  voto_registrado_por,
  registrado_por
)
values (
  'Nombre completo del votante',
  '1234567',
  '0981234567',
  'UUID_DEL_BARRIO',
  false,
  null,
  null,
  'UUID_DEL_PERFIL_ENCARGADO'
);

-- 4) Si querés cargar múltiples filas a la vez:
insert into public.votantes (
  nombre,
  cedula,
  telefono,
  barrio_id,
  voto_confirmado,
  voto_hora,
  voto_registrado_por,
  registrado_por
)
values
  ('Ana López', '1234567', '0981234567', 'UUID_DEL_BARRIO', true, '2026-09-26T10:15:00-03:00', 'UUID_DEL_ADMIN', 'UUID_DEL_ADMIN'),
  ('Pedro García', '7654321', '0977654321', 'UUID_DEL_BARRIO', false, null, null, 'UUID_DEL_ADMIN');

-- 5) Si tenés un CSV con columnas exactas, podés importarlo desde Supabase SQL Editor usando una tabla temporal:
-- create temp table tmp_votantes (
--   nombre text,
--   cedula text,
--   telefono text,
--   barrio text,
--   voto_confirmado boolean,
--   voto_hora text
-- );
--
-- Luego importar el CSV a tmp_votantes desde el menú de Supabase y ejecutar:
-- insert into public.votantes (nombre, cedula, telefono, barrio_id, voto_confirmado, voto_hora, registrado_por)
-- select
--   t.nombre,
--   t.cedula,
--   t.telefono,
--   b.id,
--   coalesce(t.voto_confirmado, false),
--   case when t.voto_hora is null or trim(t.voto_hora) = '' then null else t.voto_hora::timestamptz end,
--   (select id from public.perfiles where rol = 'admin' limit 1)
-- from tmp_votantes t
-- join public.barrios b on lower(trim(b.nombre)) = lower(trim(t.barrio));

-- 6) Verificación final
select nombre, cedula, telefono, barrio_id, voto_confirmado, voto_hora from public.votantes order by nombre;
