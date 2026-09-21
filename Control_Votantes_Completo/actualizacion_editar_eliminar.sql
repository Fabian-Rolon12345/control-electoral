-- Ejecutar UNA VEZ en Supabase > SQL Editor.
-- Agrega permisos para editar/eliminar y permite borrar encargados sin borrar votantes.

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.barrios to authenticated;
grant select, insert, update, delete on public.votantes to authenticated;
grant select, insert, update, delete on public.perfiles to authenticated, service_role;
grant select, insert, update, delete on public.auditoria to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Los votantes se conservan aunque se elimine la cuenta del encargado que los cargó.
alter table public.votantes alter column registrado_por drop not null;

alter table public.votantes
  drop constraint if exists votantes_registrado_por_fkey;
alter table public.votantes
  add constraint votantes_registrado_por_fkey
  foreign key (registrado_por) references public.perfiles(id) on delete set null;

alter table public.votantes
  drop constraint if exists votantes_voto_registrado_por_fkey;
alter table public.votantes
  add constraint votantes_voto_registrado_por_fkey
  foreign key (voto_registrado_por) references public.perfiles(id) on delete set null;

drop policy if exists "votantes eliminar admin" on public.votantes;
create policy "votantes eliminar admin"
on public.votantes for delete to authenticated
using (public.soy_admin() or barrio_id=(select barrio_id from public.mi_perfil()));

-- La política existente de barrios ya controla que solo el administrador modifique.
-- Estas políticas aseguran edición y borrado aun si el proyecto fue creado por etapas.
drop policy if exists "admin barrios modificar" on public.barrios;
create policy "admin barrios modificar"
on public.barrios for all to authenticated
using (public.soy_admin())
with check (public.soy_admin());

-- Verificación: los resultados deben ser TRUE.
select
  has_table_privilege('authenticated','public.votantes','DELETE') as eliminar_votantes,
  has_table_privilege('authenticated','public.barrios','DELETE') as eliminar_barrios,
  has_table_privilege('service_role','public.perfiles','DELETE') as eliminar_encargados;
