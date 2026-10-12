---
name: secops
description: Seguridad web estricta (OWASP, sesiones, CSP, Entra). Usar al tocar autenticación, cookies, CSRF, CSP, validación de entrada, secretos, Nginx o cualquier dato de usuario.
---

# SecOps (seguridad)

Invariantes del proyecto que no se pueden debilitar sin acuerdo explícito del usuario:

- Identidad `tid:oid`; solo miembros del tenant (`acct=0`), invitados rechazados (`memberIdentity`).
- Cookie de sesión aleatoria, HttpOnly, `__Host-` + Secure en producción, SameSite=Lax; en la base solo su HMAC (`digest`).
- Sesión: inactividad 30 min, absoluto 8 h, revalidación con Entra cada 15 min (`SESSION_POLICY`). Las lecturas no renuevan la actividad.
- CSRF: `Origin` exacto + `X-CSRF-Token` en toda mutación. Comparaciones con `equal` (tiempo constante).
- CSP con hashes de scripts inline; sin `unsafe-inline` en scripts ni atributos de evento. Nada de CDNs.
- Entrada del usuario o del sitio de horarios: escapar con `escHTML` antes de `innerHTML`; validar JSON con `validState`.
- Secretos solo en `.env` / archivo protegido; nunca en el código, logs ni el chat. Los logs no registran query strings de `/auth/callback` ni identidades en claro.
- El login de desarrollo solo funciona en loopback, sin proxy y sin Entra configurado.
- Al cambiar algo sensible, agregar o actualizar pruebas en `tests/security.test.js` / `tests/app.test.js` y sugerir `/security-review`.
