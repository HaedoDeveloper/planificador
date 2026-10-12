---
name: i18n-a11y
description: Internacionalización y accesibilidad WCAG 2.2 AA. Usar al crear o revisar interfaz, textos, formularios, modales, contraste de colores o navegación con teclado.
---

# I18n-Ready y accesibilidad

## Idioma y formato
- La app está en español de Argentina (`lang="es-AR"`). Usar `toLocaleDateString('es-AR')`, `Intl` y `localeCompare(..., 'es')` para fechas, números y orden.
- No concatenar fragmentos de frases con variables cuando cambie la gramática; usar el helper `plural` existente.
- Los textos nuevos deben quedar agrupados y ser fáciles de extraer si en el futuro se agrega otro idioma. No introducir una librería de i18n sin pedido explícito.

## Accesibilidad (WCAG 2.2 AA)
- Contraste mínimo 4.5:1 (3:1 en textos grandes y bordes de controles), en tema claro y en tema oscuro.
- Acciones con `<button>`, navegación con `<a>`; nada de `div` clickeables sin rol ni teclado.
- Modales (`#modal`): foco inicial dentro, Escape para cerrar, devolver el foco al disparador, `role="dialog"` y `aria-modal`.
- Mensajes de estado y toasts con `role="status"` / `aria-live="polite"`.
- No transmitir información solo con color (estados de materias, choques de horario): sumar texto o ícono.
- Imágenes con `alt`; íconos decorativos con `aria-hidden="true"`.
- Probar con teclado solo y en el viewport mobile.
