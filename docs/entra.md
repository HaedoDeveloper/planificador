# Registro de Microsoft Entra ID

Estado: aun no se proporcionaron Tenant ID ni Client ID. Esta guia prepara los
pasos; no se registro ni modifico ninguna aplicacion del tenant.

## Aplicacion de desarrollo

1. Entrar al centro de administracion Entra con permisos de registro de apps.
2. En la descripcion general del directorio, obtener el Directory (tenant) ID.
3. En App registrations, crear `Planificador FRH - Desarrollo`.
4. Elegir cuentas de este directorio organizativo solamente (single tenant).
5. Agregar plataforma **Web**, no SPA, con la URI exacta
   `http://localhost:3000/auth/callback`.
6. Obtener Application (client) ID. Configurar ambos IDs en `.env`.
7. En Token configuration, agregar el claim opcional **acct** al **ID token**.
   No se requiere email para autorizar. Si acct falta se rechaza el acceso.
8. En Certificates & secrets, crear una credencial de duracion corta acorde a la
   politica institucional y guardar su **valor** en el gestor de secretos o
   `.env` local. No es el identificador del secreto; no compartirlo por chat.
9. En la Enterprise application, verificar que el acceso permita a los miembros
   sin exigir asignaciones individuales, segun lo acordado. Los invitados se
   rechazan ademas desde el backend mediante acct.
10. Verificar las politicas institucionales de consentimiento y MFA. No agregar
    permisos de Microsoft Graph: el portal solo requiere `openid` y `profile`.
    MSAL puede agregar scopes OIDC propios; no se almacenan refresh tokens.

No habilitar implicit grant, flujos de contrasena ni clientes publicos. En esta
implementacion no hay cuenta local de alumno ni formulario de contrasena.

## Aplicacion de produccion

Crear un registro separado `Planificador FRH - Produccion`, con las mismas
restricciones y claim acct. Plataforma Web:

```text
https://planificador.frh.utn.edu.ar/auth/callback
```

Registrar tambien `https://planificador.frh.utn.edu.ar/login` como URI de retorno
Web si se necesita el cierre de sesion de Microsoft con retorno al portal.
Desarrollo puede registrar `http://localhost:3000/login` con el mismo fin.
No usar comodines ni URI proporcionadas por el navegador.

El cierre de sesion del portal invalida la sesion local. El boton de cierre
tambien en Microsoft agrega la redireccion al endpoint oficial de logout; otras
aplicaciones pueden conservar sus propias sesiones. Front-channel logout recibido
desde otras aplicaciones no esta implementado; se mantiene el limite local y la
revalidacion. Si se requiere, debe disenarse y probarse expresamente.

## Gestion de credenciales

En produccion usar `/etc/planificador/production.env`, propiedad root, grupo del
servicio y permiso 0640. No colocar secretos en HTML, argumentos de procesos,
documentacion, backups sin cifrar ni repositorio. Rotar la credencial antes de
su vencimiento: crear otra, actualizar el archivo, reiniciar, probar login y
retirar la anterior. Rotar SESSION_SECRET invalida todas las sesiones y logins
pendientes; registrar el cambio sin escribir el valor en logs.

La version actual usa un client secret. Autenticacion mediante certificado es
una mejora opcional futura; no esta implementada. Una identidad administrada de
Azure no se asume disponible en un servidor Debian propio.

## Diagnosticar un login rechazado

El mensaje del navegador es generico. Despues de intentar ingresar, consultar:

```bash
sudo journalctl -u planificador --since '5 minutes ago' --no-pager | grep auth_
```

El evento `auth_rejected` contiene una etiqueta fija en `reason`, sin tokens,
secretos ni mensajes completos de Microsoft:

| reason | Que revisar |
| --- | --- |
| `token_claim_acct` o `missing_acct` | Agregar `acct` como claim opcional del ID token en el registro de la app. |
| `not_tenant_member` | La cuenta debe ser miembro del tenant; se rechazan invitados. |
| `invalid_client_secret` o `invalid_client` | Usar el valor del client secret, no su identificador; comprobar la app correspondiente. |
| `expired_client_secret` | Crear un secreto vigente, actualizar el entorno y reiniciar el servicio. |
| `application_not_found` | Comprobar tenant ID y client ID. |
| `redirect_uri_mismatch` | Comparar la URI Web registrada con APP_ORIGIN seguido de `/auth/callback`. |
| `token_claim_iss`, `token_claim_aud` o `tenant_mismatch` | Comprobar tenant y aplicacion configurados. |
| `ERR_JWT_EXPIRED` | Comprobar fecha y sincronizacion horaria del servidor. |
| `ERR_JWKS_TIMEOUT`, `network_error` o `post_request_failed` | Revisar salida HTTPS y DNS hacia Microsoft. |
| `invalid_transaction` o `nonce_mismatch` | Reintentar desde el dominio HTTPS correcto sin reutilizar un callback anterior. En versiones anteriores al arreglo del nonce, actualizar el codigo y reiniciar. |
| `blocked` | La cuenta esta bloqueada en la base local. |
| `session_persistence` | Revisar la base de datos y el almacenamiento de la sesion. |
| `identity_validation` | Error no clasificado; esta etiqueta por si sola no confirma que la cuenta sea invitada. |

Las versiones anteriores registran solo `identity_validation` para varias de
estas causas. Actualizar el codigo y reiniciar el servicio para ver las nuevas
etiquetas. No compartir `production.env`, tokens ni URLs completas de callback.

La version MSAL 7 instalada exige recibir el nonce esperado tambien en
`acquireTokenByCode`. El backend lo toma de la misma transaccion usada al generar
la URL de login. Las primeras versiones lo enviaban solo al iniciar el flujo,
lo que MSAL rechazaba antes de la validacion JWT propia; en esos casos el log
antiguo mostraba `identity_validation`. La prueba de integracion reproduce ese
rechazo con respuestas sinteticas y comprueba tanto el login corregido como el
rechazo de un nonce diferente. No verifica credenciales reales del tenant.

## Referencias oficiales

- [Authorization Code + PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Claims opcionales y acct](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference)
- [Validacion de identidad](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation)
- [Revocacion y sesiones de aplicaciones](https://learn.microsoft.com/en-us/entra/identity/users/users-revoke-access)
- [MSAL Node](https://github.com/AzureAD/microsoft-authentication-library-for-js/tree/dev/lib/msal-node)
