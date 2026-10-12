---
name: omniroute
description: Arquitectura de navegación y ruteo. Usar al agregar rutas Express, endpoints /api, vistas del planificador, redirecciones de login o manejo de errores 401/404/500.
---

# Omniroute (navegación y rutas)

## Servidor (`server/app.js`)
- Toda ruta con datos de usuario va detrás de `authenticate`; toda mutación (POST/PUT/DELETE) además lleva `csrf`.
- Las rutas `/api/*` pasan por el chequeo `X-Portal-Account` y el rate limit por sesión. Respetar el orden de los middlewares.
- Validar parámetros con `app.param` (ej. `career` contra `CAREERS`).
- Errores en JSON con `{code}` estable (`not_found`, `session_expired`, `reauth_required`, `revision_conflict`, ...); el cliente depende de esos códigos.
- API: 401 con `{code, login}`; páginas HTML: redirect a `/login`.
- No servir archivos estáticos por directorio: agregar cada archivo explícitamente a la tabla de rutas. `legacy/` nunca se sirve.

## Cliente
- Las vistas son `VISTAS` en `index.html` (`hoy`, `materias`, `grilla`, `agenda`, `mapa`, `simulador`, `avance`), sin router de URL. Agregar vistas a esa lista y a la navegación existente.
- El cambio de carrera usa `CARRERA.slug`; cada cambio debe pasar por `sincronizarAlEntrar` del portal.
