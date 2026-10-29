# Instalacion simple en Debian 13

Ejecutar los comandos uno por uno por SSH. Si aparece un error, detenerse antes
de seguir. Usamos una sola carpeta: `/opt/planificador/app`.

**Si ya descargaste los archivos e instalaste las dependencias en esa carpeta,
continua desde el paso 4.** Los pasos ya completados no necesitan repetirse.

## 1. Instalar los paquetes

```bash
sudo apt update
sudo apt install git ca-certificates nginx postgresql postgresql-client certbot python3-certbot-nginx curl nano
sudo systemctl enable --now postgresql nginx
```

Que un paquete diga que ya esta instalado es normal.

## 2. Comprobar Node.js

```bash
/opt/node24/bin/node --version
/opt/node24/bin/npm --version
```

Node debe mostrar una version que empiece por `v24.`. En tu servidor ya funciona
con `v24.22.1`. Para otro servidor sin Node, seguir la seccion Node 24 de
[la referencia avanzada](debian-avanzado.md).

## 3. Descargar el sistema

Si `/opt/planificador/app` ya contiene los archivos, omitir `git clone`.

```bash
sudo mkdir -p /opt/planificador
sudo git clone https://github.com/HaedoDeveloper/planificador.git /opt/planificador/app
cd /opt/planificador/app
ls -l package.json package-lock.json
sudo env PATH=/opt/node24/bin:/usr/bin:/bin /opt/node24/bin/npm ci --omit=dev
```

Los dos archivos deben aparecer antes de ejecutar `npm ci`. Si el repositorio
es privado, usar una cuenta o clave SSH autorizada. No poner tokens en la URL.

## 4. Crear el usuario del servicio

```bash
sudo useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin planificador
sudo install -d -m 0750 -o root -g planificador /etc/planificador
```

Si dice que el usuario ya existe, continuar con el segundo comando.

## 5. Crear la base de datos

```bash
sudo -u postgres createuser --pwprompt --no-superuser --no-createdb --no-createrole planificador
sudo -u postgres createdb --owner=planificador planificador
```

El primer comando pide una contrasena nueva. Guardarla para el paso 6.
No se muestran caracteres al escribirla.

Si el rol o la base ya existen, no recrearlos ni borrarlos. Usar su clave actual.
Si se olvido la clave, cambiarla interactivamente:

```bash
sudo -u postgres psql
```

Dentro de PostgreSQL escribir:

```text
\password planificador
\q
```

Restringir el acceso publico a la base:

```bash
sudo -u postgres psql -d planificador -c 'REVOKE ALL ON DATABASE planificador FROM PUBLIC; GRANT CONNECT ON DATABASE planificador TO planificador;'
```

PostgreSQL debe escuchar solo en el servidor. No abrir 5432 a Internet.

## 6. Completar la configuracion

Copiar el ejemplo sin sobrescribir un archivo existente:

```bash
sudo cp -n /opt/planificador/app/deploy/production.env.example /etc/planificador/production.env
sudo chown root:planificador /etc/planificador/production.env
sudo chmod 640 /etc/planificador/production.env
```

Generar el secreto de sesion y conservar el resultado para el archivo:

```bash
/opt/node24/bin/node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Abrir la configuracion:

```bash
sudo nano /etc/planificador/production.env
```

Completar los datos, reemplazando los textos de ejemplo:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=https://planificador.frh.utn.edu.ar
TRUST_PROXY=true
MICROSOFT_TENANT_ID=TU_TENANT_ID
MICROSOFT_CLIENT_ID=TU_CLIENT_ID
MICROSOFT_CLIENT_SECRET=VALOR_DEL_SECRETO_MICROSOFT
SESSION_SECRET=SECRETO_GENERADO_CON_NODE
DATABASE_URL=postgresql://planificador:CLAVE_DE_LA_BASE@127.0.0.1:5432/planificador
SCHEDULE_REFRESH_MINUTES=360
```

En nano: `Ctrl+O`, Enter para guardar y `Ctrl+X` para salir.
En la clave de DATABASE_URL, codificar caracteres especiales: por ejemplo,
`@` como `%40`, `#` como `%23` y `%` como `%25`.
No publicar este archivo ni agregarlo a Git.

Los datos Microsoft se obtienen siguiendo [entra.md](entra.md). Registrar una
aplicacion Web, de un solo tenant, con el claim opcional `acct` en el ID token
y esta direccion de retorno:

```text
https://planificador.frh.utn.edu.ar/auth/callback
```

Sin esos datos no se puede ingresar en produccion. El boton de prueba local
no funciona en produccion.

## 7. Arrancar el servicio

Crear el enlace que usa el servicio:

```bash
sudo ln -sT /opt/planificador/app /opt/planificador/current
```

Si dice que `current` ya existe, comprobarlo:

```bash
readlink -f /opt/planificador/current
```

Debe mostrar `/opt/planificador/app`. Si muestra otra ruta, detenerse y revisar
la instalacion anterior antes de continuar.

```bash
sudo cp /opt/planificador/app/deploy/planificador.service /etc/systemd/system/planificador.service
sudo systemctl daemon-reload
sudo systemctl enable --now planificador
sudo systemctl status planificador --no-pager
curl -fsS http://127.0.0.1:3000/health/ready
```

Debe aparecer `active (running)` y una respuesta con `ready`. Si falla:

```bash
sudo journalctl -u planificador -n 50 --no-pager
```

Las tablas y la actualizacion de horarios se preparan automaticamente.

## 8. Configurar dominio y HTTPS

El dominio `planificador.frh.utn.edu.ar` debe apuntar a la IP del servidor.
Permitir 80 y 443 en los firewalls del servidor y del proveedor; conservar el
puerto SSH real. Si hay registro AAAA, IPv6 tambien debe funcionar.
No abrir 3000 ni 5432. Revisar si ya hay otro sitio Nginx con el mismo dominio.

Nginx recibe HTTPS y reenvia todas las rutas, incluido `/auth/callback`, a
`http://127.0.0.1:3000`. No configurar `root` ni `try_files` para servir el HTML.

### 8.1. Comprobar el backend

```bash
curl -fsS http://127.0.0.1:3000/health/ready
sudo nano /etc/planificador/production.env
```

El primer comando debe responder con `ready`. En el archivo deben figurar:

```dotenv
APP_ORIGIN=https://planificador.frh.utn.edu.ar
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=true
```

Si cambiaste el archivo, guardar y reiniciar:

```bash
sudo systemctl restart planificador
```

### 8.2. Habilitar HTTP y obtener el certificado

Habilitar primero el sitio HTTP para obtener el certificado:

```bash
sudo cp /opt/planificador/app/deploy/nginx-http.conf /etc/nginx/sites-available/planificador
sudo ln -sT /etc/nginx/sites-available/planificador /etc/nginx/sites-enabled/planificador
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --nginx -d planificador.frh.utn.edu.ar
```

Si el enlace de `sites-enabled` ya existe y apunta al mismo archivo, continuar.
Si `nginx -t` falla, corregirlo antes de recargar.
Certbot pide un correo de contacto y aceptar sus condiciones.
El sitio temporal devuelve 503 mientras se prepara HTTPS; es normal.
No volver a copiar el sitio temporal si HTTPS ya funciona.

### 8.3. Activar HTTPS

Cuando Certbot confirme que obtuvo el certificado, activar HTTPS:

```bash
sudo cp /opt/planificador/app/deploy/nginx.conf /etc/nginx/sites-available/planificador
sudo nginx -t
sudo systemctl reload nginx
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo install -m 755 /opt/planificador/app/deploy/reload-nginx.sh /etc/letsencrypt/renewal-hooks/deploy/planificador-nginx
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

### 8.4. Configuracion del sitio

El comando anterior copia una configuracion ya preparada. Para verla o editarla:

```bash
sudo nano /etc/nginx/sites-available/planificador
```

Una vez obtenido el certificado, este es el contenido completo esperado.
Reemplaza el contenido del archivo; no lo agregues al final de otro sitio:

```nginx
# Install inside the http context, for example sites-available/planificador.
# Do not log query strings: OAuth callback codes must not appear in access logs.
log_format planificador '$time_iso8601 "$request_method $uri $server_protocol" '
                        '$status $body_bytes_sent $request_time "$upstream_http_x_request_id"';

server {
    listen 80;
    listen [::]:80;
    server_name planificador.frh.utn.edu.ar;
    return 301 https://planificador.frh.utn.edu.ar$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name planificador.frh.utn.edu.ar;
    ssl_certificate /etc/letsencrypt/live/planificador.frh.utn.edu.ar/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/planificador.frh.utn.edu.ar/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    access_log /var/log/nginx/planificador-access.log planificador;
    error_log /var/log/nginx/planificador-error.log warn;
    client_max_body_size 1m;
    # Error logs can contain the full request URL, including authorization codes.
    location = /auth/callback {
        error_log /dev/null;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host planificador.frh.utn.edu.ar;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Connection "";
        proxy_read_timeout 30s;
        proxy_cache off;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host planificador.frh.utn.edu.ar;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Connection "";
        proxy_read_timeout 30s;
        proxy_connect_timeout 5s;
        proxy_cache off;
    }
}
```

El formato del log y el bloque especial de `/auth/callback` evitan registrar
codigos de autorizacion de Microsoft. La URI Web registrada en Entra debe ser
`https://planificador.frh.utn.edu.ar/auth/callback`.

Despues de cualquier cambio, validar antes de recargar:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 8.5. Comprobar el acceso

```bash
curl -I http://planificador.frh.utn.edu.ar/
curl -I https://planificador.frh.utn.edu.ar/login
```

El primero debe devolver `301` hacia HTTPS y el segundo `200`.

| Problema | Que revisar |
| --- | --- |
| Aparece la pagina inicial de Nginx | Revisar DNS, `server_name` y el enlace en `sites-enabled`. |
| Respuesta 502 | Revisar el servicio `planificador` y su respuesta local en el puerto 3000. |
| `conflicting server name` | Revisar si otro sitio habilitado tiene el mismo dominio antes de recargar. |
| No encuentra el certificado | Obtenerlo con Certbot antes de activar HTTPS; comprobar su ruta con `sudo certbot certificates`. |
| Microsoft rechaza el retorno | Comparar `APP_ORIGIN` y la URI Web registrada en Entra. |

Para revisar errores:

```bash
sudo tail -n 50 /var/log/nginx/planificador-error.log
sudo journalctl -u planificador -n 50 --no-pager
```

Si usas otro dominio, cambiarlo en el entorno, ambos archivos Nginx, las rutas
del certificado, Certbot y las direcciones registradas en Entra.

## 9. Probar

Abrir **https://planificador.frh.utn.edu.ar**, ingresar con una cuenta institucional,
seleccionar una carrera, guardar un cambio y recargar. Comprobar que persiste y
que cerrar sesion vuelve al login.

La respuesta `ready` no valida las credenciales contra Microsoft. Probar el ingreso
real y completar [acceptance.md](acceptance.md) antes de habilitar el uso general.
Esta guia no se ejecuto en tu servidor.

## 10. Activar backups diarios

```bash
sudo mkdir -p /usr/local/lib/planificador
sudo install -m 755 /opt/planificador/app/deploy/backup.sh /usr/local/lib/planificador/backup.sh
sudo cp /opt/planificador/app/deploy/planificador-backup.service /etc/systemd/system/planificador-backup.service
sudo cp /opt/planificador/app/deploy/planificador-backup.timer /etc/systemd/system/planificador-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now planificador-backup.timer
sudo systemctl start planificador-backup.service
sudo ls -lh /var/lib/planificador-backups
```

Debe aparecer un archivo `.backup`. Copiar los backups cifrados a otro equipo y
respaldar tambien la configuracion por un medio seguro. No se borran automaticamente.
Para restaurar, ver [la referencia avanzada](debian-avanzado.md).

## Actualizar mas adelante

Esto interrumpe brevemente el servicio. Ejecutar uno por uno; detenerse si falla
algun comando. El backup del paso 10 debe estar configurado.

```bash
sudo systemctl start planificador-backup.service
sudo git -C /opt/planificador/app status --short
sudo git -C /opt/planificador/app rev-parse HEAD
```

Si `status` muestra cambios, revisarlos antes de seguir. Guardar el identificador
del commit anterior para poder recuperar esa version si hace falta.

```bash
sudo systemctl stop planificador
sudo git -C /opt/planificador/app pull --ff-only origin main
cd /opt/planificador/app
sudo env PATH=/opt/node24/bin:/usr/bin:/bin /opt/node24/bin/npm ci --omit=dev
sudo systemctl start planificador
curl -fsS http://127.0.0.1:3000/health/ready
```

No sobrescribir `production.env`. Si cambian archivos de `deploy/`, revisar los
cambios antes de reinstalar servicios o Nginx. Para volver a una version anterior,
comprobar tambien que su esquema de base de datos sea compatible.

## Comandos utiles

Estado:

```bash
sudo systemctl status planificador --no-pager
```

Ultimos errores:

```bash
sudo journalctl -u planificador -n 50 --no-pager
```

Reiniciar despues de cambiar la configuracion:

```bash
sudo systemctl restart planificador
```

Referencias: [Node 24](https://nodejs.org/en/download/archive/v24),
[proxy de Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass) y
[Certbot con Nginx](https://eff-certbot.readthedocs.io/en/stable/using.html#nginx).
