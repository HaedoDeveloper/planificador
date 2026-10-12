---
name: db-architect
description: Modelado, esquemas, migraciones y optimización de base de datos. Usar al modificar server/store.js, el esquema SQL, consultas, índices o el respaldo de PostgreSQL/SQLite.
---

# DB-Architect

- Un solo adaptador (`server/store.js`) para PostgreSQL (producción, pool de 10), SQLite de Node 24 (desarrollo) y PGlite (pruebas). Todo SQL debe ser compatible con los tres: parámetros `$1..$n`, `ON CONFLICT`, `RETURNING`; evitar funciones propias de un solo motor.
- Esquema actual: `users`, `sessions`, `auth_transactions`, `plans` (PK `user_id, career`, control de concurrencia con `revision`), `schedule_catalog` (fila única), `schema_version`.
- Migraciones: hoy son `CREATE ... IF NOT EXISTS` idempotentes. Para cambios de columnas, agregar pasos versionados (consultar `schema_version` y aplicar solo los faltantes) en lugar de editar sentencias existentes. Actualizar el mensaje de `server/migrate.js`.
- Escrituras de planes atómicas: `UPDATE ... WHERE revision=$expected RETURNING`; nunca leer-y-luego-escribir.
- Índice para cada columna usada en `WHERE` frecuente o limpieza (ej. evaluar `sessions(expires_at)` y `auth_transactions(expires_at)` para `cleanup`).
- Los payloads son JSON en `TEXT`; no consultar dentro del JSON en caliente. Si hace falta filtrar por un campo, promoverlo a columna.
- Separación de datos: toda consulta de planes filtra por `user_id`. Nunca exponer consultas entre usuarios.
- Probar con `tests/store.test.js` (SQLite y PGlite). Revisar `deploy/backup.sh` si cambia el esquema.
