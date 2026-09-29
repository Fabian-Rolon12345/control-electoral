# Control Electoral - San Patricio

Sistema web conectado a Supabase y publicado mediante Vercel.

## Perfiles

- **Administrador:** Resumen, Padrón general, Mis votantes y Usuarios.
- **Consulta:** solamente Padrón general y confirmación del estado de voto.

## Actualización obligatoria en Supabase

Antes de publicar los archivos web:

1. Entrar en Supabase.
2. Abrir **SQL Editor > New query**.
3. Copiar todo el archivo `actualizacion_mis_votantes.sql`.
4. Pulsar **Run**.
5. Confirmar que las tres verificaciones finales devuelvan `true`.

Este SQL conserva todos los usuarios y votantes existentes.

## Edge Function

Volver a desplegar `edge-functions/crear-encargado/index.ts` con el nombre `crear-encargado`. Esta versión crea usuarios de consulta sin exigir un barrio.

## Publicación

La carpeta pública es `dist`. En Vercel:

- Framework: Other
- Root Directory: la carpeta del proyecto usada actualmente
- Build Command: vacío
- Output Directory: `dist`

Al enviar los cambios a la rama `main`, Vercel actualizará automáticamente la página.
