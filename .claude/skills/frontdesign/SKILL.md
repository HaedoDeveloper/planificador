---
name: frontdesign
description: Diseño visual y UI moderna del planificador. Usar al crear o modificar pantallas, componentes, estilos, colores, tipografía o modo oscuro en index.html, client/login.html o client/*.css.
---

# Frontdesign (interfaz visual)

- Reutilizar los tokens CSS existentes en `:root` y `html[data-tema="oscuro"]` de `index.html` (`--petrol`, `--acento`, `--texto`, `--gris`, ...). No introducir colores sueltos sin definirlos para ambos temas.
- Tipografía: Inter variable local (`/fonts/inter-variable.woff2`, `client/typography.css`). No cargar fuentes ni CSS externos: la CSP solo permite `'self'`.
- No usar frameworks CSS por CDN (Tailwind, Bootstrap): rompen la CSP y el modo "solo online sin terceros".
- Espaciados en múltiplos de 4px; respetar las clases existentes (`.btn`, `.btn.primario`, `.btn.peligro`, `#modal`, `#velo`, `.est-*`).
- Cada vista nueva debe funcionar en desktop (1440×900) y mobile (390×844), los dos viewports de Playwright.
- Prever estados de carga, vacío y error; el bloqueo del portal (`#portalBloqueo`) ya cubre "sin conexión" y "sesión vencida".
- Prohibido `onclick="..."` u otros atributos de evento inline (CSP `script-src-attr 'none'`): asignar handlers desde JS.
- Todo texto dinámico que entre por `innerHTML` pasa por `escHTML`.
