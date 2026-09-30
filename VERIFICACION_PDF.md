# Verificación funcional contra CONTROL ELECTORAL.pdf

## 1. Acceso por perfil

**Cumple.**

- Consulta: solo Padrón general + marcar como votó.
- No ve Resumen, Mis votantes ni Usuarios.
- No puede agregar, excluir ni editar registros administrativos.
- Administrador: acceso a todas las secciones.

## 2. Agregar a mi lista

**Cumple.**

- Botón con texto exacto **Agregar a mi lista**.
- Solo Administrador.
- Formulario con Encargado, Celular, Ciudad, Costo de Traslado, Observación y Gestión.
- Barrio no aparece en el formulario.
- Gestión tiene 3 opciones: Sin asignar, Concejalía, Intendencia + Concejalía.
- Luego de agregar, el botón/estado muestra **Agregado a mi lista**.

## 3. Mis votantes

**Cumple.**

- Búsqueda y filtros por estado.
- Columnas: Mesa, Orden, Cédula, Apellido y Nombre, Institución, Ciudad, Celular, Encargado, Tipo de Gestión, Estado de Votó, Estado en mi lista, Traslado y Acciones.
- Visualizar datos muestra los datos del padrón y el bloque administrativo editable.
- Traslado nuevo = Pendiente; puede cambiar a OK.
- Excluir no elimina: cambia a Excluido de mi lista.
- Excluidos siguen visibles tanto en Padrón general como en Mis votantes.
- Excluidos no contabilizan en el Resumen.

## 4. Resumen

**Cumple.**

El Resumen usa únicamente los registros de Mis votantes con estado activo para mostrar:

- Total en mi lista
- Ya votaron
- Pendientes
- Traslados OK
- Excluidos como dato separado
- Avance de votos
- Avance de traslados
- Actividad reciente

## Correcciones realizadas respecto del ZIP recibido

El ZIP recibido estaba muy cerca, pero no era 100% literal con el PDF. Se corrigió especialmente:

- texto del botón **Agregar a mi lista**;
- texto del estado **Agregado a mi lista**;
- detalle completo en **Visualizar datos**;
- restricción para que Consulta no pueda deshacer votos;
- encabezados exactos de Mis votantes;
- Resumen más claro y totalmente basado en Mis votantes;
- diseño visual completo y modal administrativo más profesional.
