# Despliegue en Debian 13

Esta guia no fue ejecutada contra el servidor. Requiere acceso SSH administrativo,
DNS del dominio hacia el servidor y las credenciales de Entra configuradas fuera
del repositorio. Primero validar desarrollo y despues produccion.

## Paquetes y usuario: modifican el sistema

```bash
sudo apt update
sudo apt install nginx postgresql postgresql-client certbot python3-certbot-nginx curl xz-utils ufw unattended-upgrades
sudo useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin planificador
sudo install -d -m 0755 /opt/planificador/releases
sudo install -d -m 0750 -o root -g planificador /etc/planificador
```

Debian 13 publica PostgreSQL 17. Mantener los parches de Debian; las dependencias
JavaScript estan fijadas mediante el lockfile. Usar Node 24 LTS con un parche
vigente aprobado y registrar la version exacta en el acta de despliegue. La maquina
de desarrollo se verifico con Node 24.12.0; no asumir que ese parche sigue siendo
el adecuado para produccion. El servicio busca `/opt/node24/bin/node`.

## Node 24: descarga e instalacion, modifican el sistema

Consultar la version vigente en la web oficial. El siguiente bloque solicita esa
version, verifica el checksum oficial y conserva la descarga para trazabilidad.
No instala desde scripts remotos ejecutados directamente.

```bash
set -eu
read -r -p 'Version exacta aprobada, con prefijo v24.: ' node_version
printf '%s' "$node_version" | grep -Eq '^v24\.[0-9]+\.[0-9]+$'
case "$(dpkg --print-architecture)" in
  amd64) node_arch=x64 ;;
  arm64) node_arch=arm64 ;;
  *) printf '%s\n' 'Arquitectura no contemplada'; exit 1 ;;
esac
node_download=$(mktemp -d)
cd "$node_download"
node_archive="node-$node_version-linux-$node_arch.tar.xz"
curl -fSLO "https://nodejs.org/dist/$node_version/$node_archive"
curl -fSLO "https://nodejs.org/dist/$node_version/SHASUMS256.txt"
awk -v archive="$node_archive" '$2 == archive {print}' SHASUMS256.txt | sha256sum --check --strict
sudo tar -xJf "$node_archive" -C /opt
sudo ln -s "/opt/node-$node_version-linux-$node_arch" /opt/node24
/opt/node24/bin/node --version
```

Si `/opt/node24` ya existe, no reemplazarlo sin identificar su version y planificar
la actualizacion. Para autenticidad adicional verificar la firma del archivo de
checksums con las claves de publicacion de Node. No borrar la descarga antes de
registrar la version y el resultado de la verificacion.

## Base de datos nueva: modifican el sistema

Estos comandos crean un rol sin privilegios globales y solicitan su contrasena
interactivamente; no escribirla en argumentos ni en el historial.

```bash
sudo -u postgres createuser --pwprompt --no-superuser --no-createdb --no-createrole planificador
sudo -u postgres createdb --owner=planificador planificador
sudo -u postgres psql -d planificador -c 'REVOKE ALL ON DATABASE planificador FROM PUBLIC; GRANT CONNECT ON DATABASE planificador TO planificador;'
sudo -u postgres psql -c 'SHOW listen_addresses;'
```

Mantener PostgreSQL solo en loopback y autenticacion SCRAM. No abrir 5432.
El rol es propietario de esta base para aplicar el esquema; no administra otras
bases. Configurar DATABASE_URL con la contrasena codificada correctamente como
componente de URL. Un gestor de secretos puede materializar el archivo de entorno.

## Release y configuracion: modifican el sistema

En un checkout revisado, con cambios incluidos en un commit validado, exportar
solo archivos versionados. No copiar `.env`, la base de desarrollo o node_modules.
Reemplazar los marcadores por el commit real y una ruta local absoluta del checkout.

```bash
release_ref='<commit_validado>'
checkout_dir='<ruta_absoluta_del_checkout>'
release_dir="/opt/planificador/releases/$release_ref"
sudo install -d -m 0755 "$release_dir"
git -C "$checkout_dir" archive "$release_ref" | sudo tar -x -C "$release_dir"
cd "$release_dir"
sudo env PATH=/opt/node24/bin:/usr/bin:/bin /opt/node24/bin/npm ci --omit=dev
sudo install -m 0640 -o root -g planificador deploy/production.env.example /etc/planificador/production.env
sudoedit /etc/planificador/production.env
sudo ln -s "$release_dir" /opt/planificador/current
sudo install -m 0644 deploy/planificador.service /etc/systemd/system/planificador.service
sudo systemctl daemon-reload
sudo systemctl enable --now planificador
```

El ejemplo de entorno contiene marcadores: completar todo antes de iniciar. No
copiarlo nuevamente sobre un archivo con secretos ya configurado. En cada release
el esquema se aplica de forma idempotente al arrancar; tambien puede comprobarse
con el mismo usuario y entorno del servicio antes de habilitar trafico. Version
actual de esquema: 2, tablas users, sessions, auth_transactions, plans y
schedule_catalog. La actualizacion de horarios funciona dentro del servicio,
sin instalar navegadores ni cron; ver [horarios.md](horarios.md).

## HTTPS: modifican Nginx y certificados

Primero revisar cualquier sitio existente que use el mismo dominio. Desde el
directorio del release:

```bash
sudo install -m 0644 deploy/nginx-http.conf /etc/nginx/sites-available/planificador
sudo ln -s /etc/nginx/sites-available/planificador /etc/nginx/sites-enabled/planificador
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --nginx -d planificador.frh.utn.edu.ar
sudo install -m 0644 deploy/nginx.conf /etc/nginx/sites-available/planificador
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

El backend se escucha exclusivamente en 127.0.0.1:3000. Nginx no publica archivos
del repositorio ni cachea respuestas. El backend agrega CSP, HSTS, no-store y
protecciones de cookies. No usar una raiz estatica alternativa para index.html.
Los logs de acceso omiten la query; los errores de callback se registran mediante
eventos sanitizados del backend, no con URLs y codigos OAuth completos.

## Firewall: modifican conectividad

Verificar primero el puerto SSH real y acceso por consola de recuperacion. Las
siguientes reglas suponen que el perfil OpenSSH corresponde a ese puerto.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw status verbose
sudo ufw enable
```

No habilitar el firewall hasta comprobar SSH. No abrir 3000 ni 5432 a Internet.

## Verificacion: lectura, sin modificar datos

```bash
systemctl is-active planificador nginx postgresql
curl -fsS http://127.0.0.1:3000/health/live
curl -fsS http://127.0.0.1:3000/health/ready
curl -I https://planificador.frh.utn.edu.ar/
sudo journalctl -u planificador --since '15 minutes ago'
sudo ss -lntp
```

`live` comprueba el proceso. `ready` comprueba base y presencia de configuracion,
no la validez de credenciales ni la disponibilidad de Microsoft: probar el login
real por separado. Configurar un monitor externo con alarmas ante 5xx, falta de
salud, memoria alta, disco disponible y vencimiento de TLS/client secret.

Los eventos de autenticacion no incluyen tokens ni mensajes crudos del proveedor.
El identificador de actor es un HMAC para correlacion administrativa. Restringir
lectura de logs y definir retencion institucional. Nginx usa la rotacion del paquete
Debian; journald limita sus archivos segun su configuracion global. Antes de
cambiar SystemMaxUse o MaxRetentionSec, revisar el impacto en otros servicios.

## Backups: crean archivos privados

```bash
sudo install -d -m 0755 /usr/local/lib/planificador
sudo install -m 0755 deploy/backup.sh /usr/local/lib/planificador/backup.sh
sudo install -m 0644 deploy/planificador-backup.service /etc/systemd/system/planificador-backup.service
sudo install -m 0644 deploy/planificador-backup.timer /etc/systemd/system/planificador-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now planificador-backup.timer
sudo systemctl start planificador-backup.service
sudo systemctl status planificador-backup.service
```

Los archivos quedan en `/var/lib/planificador-backups`, permiso 0700, propiedad
postgres. El backup diario valida la estructura del archivo, no demuestra una
restauracion completa. Copiar cifrado a otro equipo, verificar integridad y definir
retencion. No se eliminan backups automaticamente. Respaldar tambien, por un canal
seguro y cifrado, la configuracion y sus secretos; nunca en el repositorio.

Restauracion de prueba: crea una base aparte, no modifica produccion. Reemplazar
la ruta por el backup elegido. Verificar despues usuarios y planes; no exportar
datos personales a equipos sin autorizacion.

```bash
sudo -u postgres createdb --owner=planificador planificador_restore_test
sudo -u postgres pg_restore --exit-on-error --no-owner --role=planificador --dbname=planificador_restore_test /var/lib/planificador-backups/<archivo.backup>
sudo -u postgres psql -d planificador_restore_test -c 'SELECT count(*) FROM users; SELECT count(*) FROM plans;'
sudo -u postgres psql -d planificador_restore_test -c 'DELETE FROM sessions; DELETE FROM auth_transactions;'
```

La ultima instruccion invalida las sesiones SOLO en la base de prueba. Antes de
restaurar sobre produccion detener el servicio, obtener un backup nuevo y aprobar
el procedimiento concreto. Esta guia no incluye un borrado de la base de produccion.
Tras restaurar datos reales, revocar siempre las sesiones restauradas.

## Actualizacion y reversion: modifican el servicio

Registrar el destino anterior con `readlink -f /opt/planificador/current`. Preparar
un release nuevo, ejecutar pruebas en desarrollo y obtener backup. Cambiar el
enlace solo despues de revisar la compatibilidad de esquema:

```bash
sudo systemctl stop planificador
sudo ln -sfn '/opt/planificador/releases/<nuevo_commit>' /opt/planificador/current
sudo systemctl start planificador
curl -fsS http://127.0.0.1:3000/health/ready
```

Para revertir, repetir con el commit anterior del portal y su configuracion
compatible. No apuntar al HTML Firebase como alternativa publica. El esquema 2
actual es aditivo; versiones futuras deben declarar si admiten rollback. Una
restauracion de datos requiere un procedimiento separado porque perderia cambios
posteriores al backup. No eliminar releases anteriores durante la validacion.

Activar y comprobar actualizaciones de seguridad de Debian con
`sudo dpkg-reconfigure unattended-upgrades`. Para Node y npm, actualizar en pruebas,
revisar lockfile y auditoria, registrar versiones y desplegar otro release. El pool
de diez conexiones y MemoryMax=768M son puntos de partida; medir con 1000 usuarios
antes de ampliar procesos o conexiones. No se certifico esa capacidad en Windows.

## Administracion de acceso: modifica sesiones y permisos

Ejecutar la CLI con el usuario planificador y el entorno protegido cargado por un
servicio temporal, evitando que los secretos aparezcan en argumentos:

```bash
sudo systemd-run --wait --pipe --collect --property=User=planificador --property=Group=planificador --property=WorkingDirectory=/opt/planificador/current --property=EnvironmentFile=/etc/planificador/production.env /opt/node24/bin/node server/admin.js block '<tenant-id>:<object-id>'
```

Usar `unblock` para habilitar nuevamente; `revoke` solo invalida sesiones y no
desbloquea una cuenta que ya estuviera bloqueada. El bloqueo local se verifica en
cada peticion y persiste incluso si Entra permite autenticar. Esta via depende del
acceso SSH del administrador, no de una cuenta alternativa de Google.

## Fuentes

- [PostgreSQL en Debian 13](https://packages.debian.org/trixie/postgresql)
- [Ciclo de soporte Node](https://nodejs.org/en/about/previous-releases)
