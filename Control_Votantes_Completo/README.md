# Control Electoral — San Patricio

Sistema web responsive para administrar votantes por barrios. Funciona en computadora y celular, e incluye un modo de demostración que no necesita base de datos.

## Probar ahora

1. Abrir la carpeta `dist`.
2. Ejecutar un servidor local. Por ejemplo, con VS Code: instalar **Live Server**, hacer clic derecho en `index.html` y elegir **Open with Live Server**.
3. Ingresar como administrador con `admin@demo.com` / `admin123`, o como encargado con `encargado@demo.com` / `encargado123`.

No abrir `index.html` directamente con doble clic: por seguridad del navegador, conviene usar un servidor local.

## Funciones incluidas

- Administrador general con acceso a todos los barrios.
- Creación de barrios y cuentas de encargados.
- Encargado limitado al barrio asignado.
- Registro y búsqueda por cédula, nombre o teléfono.
- Aviso grande: **YA VOTÓ**, **TODAVÍA NO VOTÓ** o **NO ESTÁ EN EL SISTEMA**.
- Prevención de cédulas duplicadas, incluso con puntos o guiones.
- Selector de barrio al registrar; el encargado solo ve su barrio asignado.
- Confirmación y anulación del voto con hora y responsable.
- Estadísticas y progreso por barrio.
- Historial de acciones.
- Exportación CSV compatible con Excel.
- Actualización en tiempo real al conectar Supabase.
- Diseño responsive para celular, tablet y computadora.

## Conectar Supabase

1. Crear un proyecto en Supabase.
2. Abrir **SQL Editor**, pegar el contenido de `supabase.sql` y ejecutarlo.
3. Crear el primer usuario en **Authentication > Users**.
4. Ejecutar el `INSERT` comentado al final de `supabase.sql`, reemplazando UUID, nombre y correo.
5. Copiar `dist/config.example.js` sobre `dist/config.js` y completar `SUPABASE_URL` y `SUPABASE_ANON_KEY`. Mantener `DEMO_MODE: false`.
6. Desplegar la función `edge-functions/crear-encargado` como Edge Function de Supabase con el nombre `crear-encargado`.
7. En Supabase, autorizar el dominio donde se publique la página.

Nunca colocar la clave `service_role` en `config.js`; esa clave queda solamente dentro de Supabase Edge Functions.

## Publicación

La carpeta pública es `dist`. Puede publicarse en Vercel, Netlify o un hosting tradicional. En Vercel, no requiere comando de compilación y el directorio de salida es `dist`.
