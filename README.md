# Control Electoral - versión final según PDF

Versión preparada para reemplazar la carpeta actual del proyecto.

## Qué se corrigió

- Perfil **Consulta**: solamente ve **Padrón general** y puede **Marcar votó**.
- Perfil **Administrador**: ve **Resumen**, **Padrón general**, **Mis votantes** y **Usuarios**.
- Botón exacto **Agregar a mi lista** solo para Administrador.
- Al agregar se solicitan: Encargado, Celular, Ciudad, Costo de Traslado, Observación y Gestión.
- Gestión incluye exactamente 3 opciones: **Sin asignar**, **Concejalía**, **Intendencia + Concejalía**.
- Al quedar incorporado, el estado visible es **Agregado a mi lista**.
- **Mis votantes** mantiene búsqueda y filtros de voto, estado en lista y traslado.
- **Visualizar datos** muestra la información del padrón y permite al Administrador modificar los datos administrativos.
- Traslado inicia en **Pendiente** y puede cambiarse a **OK**.
- **Excluir de mi lista** no borra el registro; cambia su estado y continúa visible.
- Los excluidos no se cuentan dentro de los votos logrados del Resumen.
- El Resumen calcula sus indicadores solamente a partir de **Mis votantes** activos.
- El perfil Consulta no puede deshacer una confirmación de voto; solo el Administrador puede hacerlo.
- Diseño visual renovado: interfaz más limpia, profesional, moderna, responsive y con mejor modal de datos.

## Paso 1 - Supabase

Ejecutar una sola vez:

`ACTUALIZACION_FINAL_PDF.sql`

Ruta: **Supabase > SQL Editor > New query > pegar todo > Run**.

Al final aparecen verificaciones y todas deben devolver `true`.

La carpeta `legacy_sql_no_ejecutar` queda solo como respaldo del ZIP anterior. Para esta versión, **no hace falta ejecutar esos SQL**.

## Paso 2 - Edge Function

Volver a desplegar:

`edge-functions/crear-encargado/index.ts`

con el nombre:

`crear-encargado`

## Paso 3 - Web / Vercel

La carpeta pública continúa siendo:

`dist`

Configuración recomendada en Vercel:

- Framework Preset: **Other**
- Build Command: vacío
- Output Directory: **dist**

Si ya está conectado a GitHub, reemplazar estos archivos, hacer commit y push a `main`.

## Importante

El archivo `dist/config.js` fue conservado desde el proyecto recibido para no romper la conexión existente. No publicar claves privadas de tipo `service_role` en `dist`.
