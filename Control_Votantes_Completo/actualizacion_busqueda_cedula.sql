-- Ejecutar una sola vez en Supabase > SQL Editor después de supabase.sql.
-- Refuerza la búsqueda y evita cédulas duplicadas aunque tengan puntos o guiones.

create unique index if not exists votantes_cedula_normalizada_uidx
  on public.votantes ((regexp_replace(cedula, '[^0-9]', '', 'g')));

create index if not exists votantes_nombre_busqueda_idx
  on public.votantes ((lower(nombre)));

create index if not exists votantes_telefono_busqueda_idx
  on public.votantes ((regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g')));
