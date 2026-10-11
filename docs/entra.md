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

## Referencias oficiales

- [Authorization Code + PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Claims opcionales y acct](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference)
- [Validacion de identidad](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation)
- [Revocacion y sesiones de aplicaciones](https://learn.microsoft.com/en-us/entra/identity/users/users-revoke-access)
- [MSAL Node](https://github.com/AzureAD/microsoft-authentication-library-for-js/tree/dev/lib/msal-node)
