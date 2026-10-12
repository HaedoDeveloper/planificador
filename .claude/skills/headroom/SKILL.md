---
name: headroom
description: Rendimiento y Core Web Vitals (LCP, INP, CLS). Usar al optimizar carga, renderizado, tamaño de index.html, consultas costosas o tiempos de respuesta del backend.
---

# Headroom (rendimiento)

- `index.html` pesa ~500 KB y contiene `CARRERAS` (~228 KB) inline. Antes de agregar datos inline, evaluar el impacto en LCP y en los hashes CSP (se recalculan al iniciar `server/app.js`).
- El servidor responde con `Cache-Control: no-store` por política (solo online, sin caché). No agregar Service Worker de caché ni almacenamiento offline: `sw.js` existe solo para desregistrarse.
- Sin dependencias de frontend nuevas; preferir JS nativo.
- Renderizado: `render()` redibuja la vista activa. Evitar recalcular todas las vistas o `todasComs()` dentro de bucles; cachear resultados por render.
- Evitar CLS: reservar tamaño de imágenes e iconos, no insertar banners que desplacen contenido después de la carga.
- Polling del portal: cada ~20 s (`client/portal.js`). No acortarlo; el rate limit de la API es 120 req/min por sesión.
- Medir antes y después (Lighthouse/Performance de Chrome, o tiempos en Playwright) e informar números, no impresiones.
