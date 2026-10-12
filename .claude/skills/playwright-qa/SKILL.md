---
name: playwright-qa
description: Pruebas E2E y QA con Playwright. Usar al validar flujos de usuario, agregar pruebas de navegador, verificar que un cambio no rompe la interfaz o tomar capturas.
---

# Playwright QA

- Las pruebas viven en `tests/browser/*.spec.js`; configuración en `playwright.config.js` (proyectos `desktop` y `mobile`).
- Ejecutar: `npm.cmd test` (unitarias, `node --test`) y luego `npm.cmd run test:browser`. Si falta el navegador: `npx.cmd playwright install chromium`.
- Seguir los helpers de `tests/helpers.js` y el patrón de `portal.spec.js` / `development-login.spec.js` (servidor efímero, login de desarrollo, SQLite temporal).
- Cubrir siempre: guardado y recarga del plan, logout, ausencia de datos en localStorage/IndexedDB/Cache Storage, bloqueo offline y errores de CSP en consola (una violación de CSP es una falla).
- No usar `waitForTimeout` fijo: esperar por selectores, respuestas de red o `expect.poll`.
- Al terminar, informar los resultados reales con la salida; si una prueba falla, no la marques como pasada ni la desactives.
- Las pruebas locales no certifican Entra real, HTTPS/Nginx ni carga; decirlo cuando corresponda (`docs/acceptance.md`).
