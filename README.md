# Planificador Academico FRH

Portal basado en el planificador original del alumno. Conserva las seis carreras,
correlativas, estados y notas, regimen de cursada, horarios y su optimizador,
agenda, calendario, simulador, mapa, importacion/exportacion JSON y exportaciones
PNG/ICS. El acceso institucional reemplaza la sincronizacion Firebase.

## Decisiones acordadas

- Produccion: `https://planificador.frh.utn.edu.ar` en Debian 13.
- Todos los miembros del tenant universitario; invitados rechazados.
- Base nueva, sin migracion de Google/Firebase ni de estados anonimos antiguos.
- Solo online. No se guardan planificaciones ni tokens en localStorage, IndexedDB
  o Cache Storage. El estado pendiente existe unicamente en memoria de la pestana.
- Inactividad: 30 minutos; limite absoluto: 8 horas; comprobacion con Entra:
  15 minutos. Las lecturas de sincronizacion no renuevan la actividad.
- Cada usuario accede exclusivamente a sus planes. Administracion mediante SSH y
  CLI, sin permitir a administradores del tenant leer planes por ese solo hecho.

## Arquitectura

Nginx termina HTTPS y reenvia al backend Express en loopback. MSAL Node utiliza
Authorization Code + PKCE y OIDC con un tenant fijo. JOSE verifica la firma RSA,
emisor, audiencia, vencimiento, nonce y pertenencia. La identidad es `tid:oid`;
el correo solo se muestra en pantalla. No se consulta Microsoft Graph.

La cookie contiene un identificador aleatorio HttpOnly; en la base solo se guarda
su HMAC. En produccion usa prefijo `__Host-`, Secure y SameSite=Lax. Las
transacciones de login duran cinco minutos, estan vinculadas al navegador y se
consumen una sola vez. La sesion rota al autenticar o revalidar.

Las revalidaciones realizan un flujo nuevo contra Entra, no una renovacion local
ni la reutilizacion de tokens en cache. No extienden el limite de ocho horas ni
la actividad anterior. Al vencer la autorizacion, las rutas dejan de servir datos.
Entra puede requerir interaccion o demorar la propagacion de una baja: hay que
medirlo con el tenant real. Para bloquear inmediatamente dentro del portal usar
la CLI. No se promete revocacion instantanea en Microsoft.

PostgreSQL se usa en produccion con un pool de diez conexiones. Desarrollo usa
SQLite de Node 24 en `.data/`, sin instalar un servicio adicional; esta API es
experimental en la version local y no se utiliza en produccion. PGlite ejecuta
PostgreSQL local en las pruebas, sin Docker. Las revisiones de planes se actualizan
atomicamente; un conflicto exige elegir una version, nunca sobrescribe solo.

## Desarrollo en VS Code

Requiere Node.js 24 LTS. Las versiones de dependencias estan fijadas en
`package.json` y `package-lock.json`. No abrir el HTML como archivo ni usar Live
Server: el control de acceso pertenece al backend.

Comandos que instalan dependencias o crean la base local:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run db:migrate
npm.cmd run dev
```

Abrir `http://localhost:3000`. Sin configurar Entra se muestra el acceso pendiente
y se rechazan las rutas del planificador por defecto. Para la prueba temporal
solicitada se habilito `DEV_LOGIN_ENABLED=true` en el `.env` local: aparece
**Ingresar para pruebas**, con una cuenta local separada y persistencia SQLite.
Solo funciona en desarrollo y desde loopback, sin proxy. Se desactiva al configurar
Entra y nunca se habilita en produccion. Quitar la opcion o ponerla en `false` para
retirar el boton. Esta cuenta no demuestra el funcionamiento del login institucional.

Configurar los identificadores y secretos en `.env` despues de registrar la app,
siguiendo [docs/entra.md](docs/entra.md). No enviar ni pegar secretos en el chat.
Para generar SESSION_SECRET, ejecutar localmente y guardar el resultado solo en
el archivo protegido o gestor de secretos:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

## Validacion

Comandos de prueba; crean archivos temporales y resultados locales:

```powershell
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:browser
npm.cmd audit --omit=dev
```

Las pruebas cubren validacion criptografica JWT, tenant e invitados, CSRF,
sesiones, bloqueo, datos separados, conflictos, persistencia tras reinicio,
consultas PostgreSQL y navegacion desktop/mobile bajo CSP. El navegador comprueba
tambien guardado, logout, ausencia de progreso local y bloqueo al quedar offline.

La aceptacion institucional todavia requiere las pruebas manuales de
[docs/acceptance.md](docs/acceptance.md). Las pruebas locales no certifican un login
real con Entra, la propagacion de bajas, HTTPS/Nginx ni 1000 usuarios activos.

## Despliegue y operacion

Repositorio de trabajo: [HaedoDeveloper/planificador](https://github.com/HaedoDeveloper/planificador).
El [instructivo de instalacion en Debian 13](docs/debian.md) incluye descarga,
configuracion de Entra, PostgreSQL, HTTPS, servicio, backups y actualizaciones.

Los horarios se actualizan centralmente desde la web oficial al iniciar y cada
seis horas, sin copias manuales por parte de los alumnos. El catalogo compartido
persiste en la base; una falla conserva la ultima version valida. Configuracion,
validaciones y supervision: [docs/horarios.md](docs/horarios.md).

Seguir [docs/debian.md](docs/debian.md): usuario dedicado, PostgreSQL, Node 24,
systemd, Nginx, TLS, firewall, logs, backup/restauracion y reversion. No publicar
el directorio del repositorio como raiz estatica.

La version anterior se conserva en `legacy/index.html`, fuera de las rutas que
sirve el backend. No habilitarla en produccion. Se mantiene como referencia hasta
validar el acceso institucional; contiene la configuracion publica de Firebase,
no credenciales privadas de Entra. Su configuracion y reglas remotas no fueron
auditadas. No se modifica ni elimina la base antigua.

El worker `/sw.js` solo retira instalaciones antiguas, borra caches del
planificador y se desregistra; no intercepta ni almacena respuestas. `cleanup.js`
tambien retira estados locales anteriores. Como se acordo un inicio desde cero,
no se importan. Copias previamente descargadas en equipos desconectados no pueden
revocarse remotamente: el cambio de politica no elimina archivos exportados.
