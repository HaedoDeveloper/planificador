# Actualizacion central de horarios

El servidor consulta exclusivamente https://horarios.frh.utn.edu.ar/ al iniciar
y cada seis horas. `SCHEDULE_REFRESH_MINUTES=360` controla el intervalo (15 a
1440 minutos). No requiere cron, Chromium, Google, Entra ni credenciales de los
alumnos. Un unico proceso del portal realiza la consulta para todos los usuarios.
Los navegadores solo consultan el catalogo local autenticado, al ingresar,
al cambiar de carrera y cada cinco minutos mientras la pestana esta activa.

La publicacion actual incluye el ciclo y las comisiones como atributos HTML.
Se procesan con parse5, sin ejecutar sus scripts, conservar HTML ni descargar
assets externos. Se mantienen las reglas originales por carrera: planes
actuales, asignaturas compartidas con planes anteriores, basicas e ingles.
Los catalogos y las correlativas academicas no se actualizan por esta via.

El resultado completo de las seis carreras se guarda atomicamente en
`schedule_catalog`, compartido y separado de `plans`. En desarrollo se usa
SQLite; en produccion, PostgreSQL. Persiste tras reinicios y entra en los backups
de la base. El esquema 2 agrega una tabla; no modifica ni elimina planes.
No reemplazar este almacenamiento con horarios guardados por cada alumno.

## Fallas y supervisión

La conexion tiene un limite de 30 segundos y 16 MiB descomprimidos. No admite
redirecciones ni URLs indicadas por usuarios. Rechaza ciclos anteriores,
documentos truncados, tiempos invalidos, carreras vacias y reducciones mayores
al 40% respecto del ultimo catalogo. Un fallo de descarga, validacion o escritura
conserva la ultima version valida, sin dejar una actualizacion parcial.

Si nunca se pudo consultar la fuente, se ofrece el catalogo incluido en el
proyecto, identificado en pantalla como pendiente de verificacion. Despues
de dos intervalos sin verificar, se muestra nuevamente el aviso pendiente,
sin atribuir a los datos una fecha de verificacion nueva.

Los eventos `schedules_updated` y `schedules_update_failed` se registran en los
logs del proceso. Supervisar fallas repetidas mediante journald y el monitor
institucional. Si cambia el formato de la web o hay una reduccion legitima de
oferta, el administrador debe revisar la fuente y adaptar el importador o sus
reglas mediante un release probado, no pedir a los alumnos que peguen HTML.
Para reintentar inmediatamente una vez corregida la causa, reiniciar el servicio.

## Planificaciones

Las elecciones usan claves estables (curso y materia), no posiciones de arrays.
Cambios de aulas y horarios se reflejan sin tocar notas, estados ni elecciones.
Si una comision deja de publicarse, se avisa al alumno y se conserva su eleccion
guardada para que pueda revisarla; no se cambia automaticamente por otro curso.
Los JSON antiguos siguen admitiendo el progreso, pero su catalogo personalizado
de horarios se ignora. Las cursadas manuales de otras regionales siguen disponibles.

Esto automatiza los horarios publicados, no certifica su exactitud academica.
Un cambio de ciclo no regenera el calendario ni las correlativas: requieren
su propia fuente oficial y una actualizacion independiente.
