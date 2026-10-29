/* Se carga sin defer para aplicar el tema del planificador antes de pintar el login. */
try {
  const tema = localStorage.getItem('planificador-tema') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro');
  document.documentElement.setAttribute('data-tema', tema);
} catch {}
