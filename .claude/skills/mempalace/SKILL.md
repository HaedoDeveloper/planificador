---
name: mempalace
description: Gestión del estado global y sincronización con el servidor. Usar al modificar ST, memoriaCarreras, guardado, revisiones, conflictos o la forma del estado del plan.
---

# Mempalace (estado)

- Estado del plan activo: `ST` (forma en `estadoVacio()`: `version`, `estados`, `notas`, `aplazos`, `grilla`, `sim`, ...). Estado por carrera: `memoriaCarreras` (`data`, `revision`, `loaded`, `pending`, `sequence`).
- Toda mutación de `ST` termina en `programarPush()` para marcarla pendiente y guardarla con debounce de 1 s.
- Persistencia solo en el servidor (`PUT /api/plans/:career` con `revision`). Prohibido guardar planes o tokens en localStorage/IndexedDB/Cache Storage. localStorage solo para preferencias de UI ya listadas en `client/cleanup.js` (tema, carrera, banner, calendario plegado).
- Conflictos: nunca sobrescribir sin elección del usuario (`resolverConflicto`).
- Si cambiás la forma del estado: actualizar `estadoVacio`, `sanearEstado` y `validState` (`server/security.js`), y contemplar datos ya guardados. Subir `version` solo con migración.
- Limpiar timers e intervalos y no retener referencias a DOM eliminado.
