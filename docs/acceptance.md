# Aceptacion antes de produccion

## Automatizada

Ejecutar `npm test` y `npm run test:browser` en el release. Revisar `npm audit
--omit=dev`. El resultado local no sustituye pruebas institucionales ni Linux real.
El emisor usado en tests es simulado mediante inyeccion de dependencias; el servidor
normal nunca expone ese acceso. Los tokens de pruebas se firman con claves efimeras.

## Institucional: obligatoria

- Login de miembro del tenant real con claim acct presente y MFA aplicable.
- Rechazo de invitado del mismo tenant, cuenta personal y cuenta de otro tenant.
- Cuenta nueva crea un perfil y una planificacion vacia; no hereda datos antiguos.
- Deshabilitar una cuenta de pruebas con sesion abierta y medir propagacion hasta
  que Entra rechace la nueva autorizacion. Verificar que el backend no sirve datos
  mientras no haya revalidacion correcta.
- Inactividad a los 30 minutos, sin actividad artificial de los polls; actividad
  humana mantiene la sesion sin superar ocho horas. Revalidacion cada 15 minutos.
- Revalidacion rota cookie y preserva antiguedad; no puede cambiar de identidad.
- Bloqueo local y revocacion mediante CLI afectan la siguiente peticion; desbloquear
  no revive cookies viejas. Un administrador del tenant no lee planes ajenos.
- Logout local; logout tambien en Microsoft; retorno a login; boton atras y otra
  pestana no pueden recuperar datos del usuario anterior.
- Comprobar expiracion/rotacion del secreto de Entra y del SESSION_SECRET.

## Funcional y operativa: obligatoria

- Seis carreras, correlativas, excepciones, notas y regimen de cursada.
- Importacion de Autogestion y horarios; optimizador y deteccion de choques.
- Agenda, calendario, mapa, simulador y avance; exportacion PNG, ICS y JSON.
- Guardado y recarga por cuenta/carrera; dos dispositivos con conflicto explicito.
- Cambiar de carrera durante un guardado no mezcla ni pierde estados.
- Cambiar de cuenta en otra pestana no carga ni sube datos de la anterior.
- Caida de red bloquea consulta/edicion; exportar cambios pendientes y recuperar
  online. Reiniciar sin red no abre el portal. No registrar service workers.
- Ninguna ruta estatica alternativa evita autenticacion; no-store en HTML y API.
- HTTPS real, cookies seguras, CSP sin errores, callback sin codigos en logs.
- Reinicio systemd conserva planes, respeta sesiones vigentes y vuelve a estar sano.
- Backup diario, copia externa cifrada, restauracion en base aparte y ensayo de
  rollback a un release compatible. Revocar sesiones despues de una restauracion.

## Carga: obligatoria antes de afirmar capacidad

Desde otra maquina y contra un entorno de pruebas separado, utilizar 100, 500 y
1000 identidades/sesiones sinteticas. No usar datos reales ni automatizar 1000
logins contra Entra de produccion. Preparar sesiones de prueba solo mediante un
harness separado, nunca habilitando un bypass en el portal.

Modelar lecturas cada 20-25 segundos con dispersion, ediciones y guardados de
planes de tamanos representativos. Incluir conflictos, una reconexion masiva y
vencimientos de sesion; medir CPU, memoria, disco, conexiones PostgreSQL y latencia.
Objetivos iniciales propuestos: p95 de API menor a 500 ms y errores inesperados
menores al 1%, sin agotamiento de memoria ni perdida de datos. Ajustar objetivos
con mediciones institucionales; aun no se ejecuto esta prueba.

## Reversion

Mantener release anterior, configuracion compatible y backup probado. No eliminar
la referencia Firebase `legacy/index.html` hasta verificar Entra real y recuperacion
administrativa. No habilitarla como ruta publica del nuevo portal.
