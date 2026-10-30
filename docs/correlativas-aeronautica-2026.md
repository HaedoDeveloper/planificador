# Correlativas de Aeronautica / Ingenieria Aeroespacial, ciclo 2026

Fuente aportada: `Correlativas Aeronautica 2026.pdf`, 13 paginas.
Ordenanza UTN 2187, del 11 de diciembre de 2025: modifica el Anexo I de la
Ord. 1927, Plan 2023 aprobado por Ord. 1926, con vigencia desde el ciclo 2026
(articulos 1 a 3, pagina 2). Se revisaron las 50 materias obligatorias del anexo.

SHA-256 del PDF revisado:
`c6b3538ee8276d728620d9a7d8e551e4be70c4cf1a871d9e199dd85e70f32c54`.

En la tabla, los numeros son los identificadores de materia del plan.
"Cursadas" se representa como regularizadas o aprobadas en el planificador.

| Materia | Cursadas antes | Cursadas ahora | Aprobadas antes | Aprobadas ahora | Pagina |
| --- | --- | --- | --- | --- | --- |
| 3. Diseno y Representacion Aeroespacial | 2 | 1, 2, 4 | Ninguna | Ninguna | 4 |
| 13. Computacion | 3, 5 | 2, 5 | Ninguna | Ninguna | 4 |
| 15. Mecanica Racional | 6, 14 | 4, 5, 6 | Ninguna | Ninguna | 5 |
| 29. Motores Aeronauticos | 22, 24, 26 | 22, 24, 26, 31 | 10, 12 | 10, 12 | 10 |
| 39. Proyecto y Diseno Aerodinamico | 28, 29, 33 | 20, 24, 26 | 10, 20 | 10 | 9 |
| 40. Mecanica del Vuelo | 29, 32, 33 | 39, 32, 33 | 10, 20 | 10, 20 | 10 |

Referencias para interpretar los cambios: 1 Conocimientos Aeronauticos y Espaciales I;
2 Sistemas de Representacion en Ingenieria; 4 Algebra y Geometria Analitica;
5 Analisis Matematico I; 6 Fisica I; 14 Analisis Matematico II;
20 Programacion y Analisis Numerico; 24 Termodinamica; 26 Mecanica de los Fluidos;
28 Sistemas de Vehiculos Aereos y Espaciales; 31 Mecanismos; 32 Sistemas de Control;
33 Aerodinamica Teorica.

## Niveles

El nuevo anexo tambien cambia la ubicacion de tres asignaturas:

- Diseno y Representacion Aeroespacial (3): nivel I -> II, pagina 4.
- Motores Aeronauticos (29): nivel IV -> V, pagina 10.
- Proyecto y Diseno Aerodinamico (39): nivel V -> IV, pagina 9.

Los identificadores se conservan para mantener los estados y notas existentes.
No se deduce una nueva carga horaria a partir de esta tabla de correlativas.

## Proyecto Final y PPS

Para cursar Proyecto Final no cambian los requisitos: 39, 41, 43 y 44 cursadas;
28 y 35 aprobadas. Para rendirlo, la pagina 13 exige todas las materias del plan
aprobadas y el requisito de electivas satisfecho. Se activa esa comprobacion
usando las 4 horas semanales anualizadas de electivas ya definidas en el catalogo;
las cuatrimestrales computan la mitad. El catalogo anterior solo comprobaba las
obligatorias para rendir Proyecto Final.

La condicion de PPS no cambia: cumplir los requisitos para inscribirse a
Analisis y Diseno de Misiles y Lanzadores, integradora de quinto nivel.

## Alcance y verificacion

Se actualiza el catalogo de la aplicacion activa y su fuente normativa.
Las demas correlativas obligatorias coinciden con el anexo (ignorando el orden
de las listas). Las correlativas de las electivas mantienen sus resoluciones
particulares: este PDF no incluye una nueva tabla de electivas.
`legacy/index.html` conserva la version historica.

`tests/fixtures/aeronautica-ord2187.json` transcribe los niveles y correlativas
del anexo para verificar las 50 materias. Las pruebas tambien comprueban las
nuevas condiciones de cursada, finales, electivas, ausencia de ciclos y que las
otras carreras y los restantes datos de Aeronautica no cambien.

## Actualizacion en Debian

Ejecutar uno por uno; si falla la descarga, detenerse antes de reiniciar:

```bash
sudo git -C /opt/planificador/app pull --ff-only origin main
sudo systemctl restart planificador
```

No requiere instalar dependencias ni migrar datos. Recargar el navegador para
obtener el nuevo catalogo; los planes existentes mantienen sus estados y notas.
