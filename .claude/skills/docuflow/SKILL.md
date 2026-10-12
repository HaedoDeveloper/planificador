---
name: docuflow
description: Documentación de código y archivos README/docs. Usar al agregar funcionalidades, variables de entorno, comandos o pasos de despliegue que deban documentarse.
---

# DocuFlow (documentación)

- Idioma: español rioplatense, sin tildes en README.md y docs/*.md (seguir el estilo actual de esos archivos).
- Documentar en el lugar correcto: `README.md` (visión general, desarrollo, validación), `docs/debian.md` (despliegue), `docs/entra.md` (registro de la app), `docs/horarios.md` (sincronización), `docs/acceptance.md` (pruebas manuales).
- Variable de entorno nueva: agregarla a `.env.example`, `deploy/production.env.example`, validarla en `server/config.js` y mencionarla en el README.
- Comentarios en código: pocos y del porqué, igual que el código actual. No agregar JSDoc masivo a funciones obvias.
- No afirmar en la documentación algo que no fue probado (ej. login real con Entra o carga de 1000 usuarios).
