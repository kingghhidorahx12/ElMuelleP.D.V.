# Red local y protección de datos de El Muelle PDV Android

## Actualizaciones desde 1.0.19

La APK de transición se instala una vez sobre la existente, sin desinstalar y con
un respaldo previo. Después, como administrador, abre Configuración → Actualizaciones
de El Muelle PDV y pulsa Buscar y actualizar (o Actualizar a la versión disponible).
No actives Buzón ni escribas un código o PIN para descargar. El botón completa la
descarga verificada y abre el instalador si no hay una venta pendiente. Si empezaste
una venta mientras descargaba, termina primero y pulsa Instalar actualización.

Android conserva su autorización de fuente de instalación y su confirmación final;
no se instala silenciosamente. La app continúa al volver del permiso de Android.
Usa la 1.0.19 o posterior: la 1.0.18 tuvo fallos de transferencia en el servidor.
La descarga no envía ventas, fotografías operativas ni respaldos. Buzón sigue siendo
un servicio separado y una actualización no sustituye el respaldo del negocio.

## Conexión rápida (fuentes 1.0.22; ver entrega en continuidad)

El dueño y los empleados con sesión activa pueden abrir **Equipos** en la barra
superior, sin permiso de acceso a toda Configuración. Al abrir se buscan equipos
automáticamente. Elige **Elegir impresora** o **Conectar báscula**; no se escriben
IP, puertos ni baudios en este recorrido. Una impresora guardada se marca como
seleccionada y se reutiliza al imprimir. Reconectar guardados comprueba su conexión.
El botón Bluetooth solicita el permiso normal de Android o abre sus emparejamientos.

Los empleados no reciben por esto permisos de respaldos, diagnóstico técnico,
formato del ticket, parámetros de báscula, ni administración de usuarios. El dueño
conserva las opciones avanzadas. No se modifica el control de peso válido para vender.

La báscula RHINO mantiene su autoconfiguración USB aprobada. No se configuran
otras básculas adivinando protocolos ni se alteran tara o calibración. La impresora
USB recordada se prepara al conectar/abrir la app y puede recuperarse aunque cambie
el identificador USB de Android. Cuando existe un número de serie se utiliza para
distinguir equipos. Si hay varios iguales sin identidad suficiente, debes elegir.
Una denegación de permiso no causa diálogos repetidos; puedes elegir el equipo
otra vez para volver a solicitarlo. Android siempre conserva la decisión final.

La conexión Bluetooth conserva la dirección emparejada y se abre al imprimir;
Android debe tener Bluetooth encendido. La LAN recordada se comprueba en segundo
plano (sólo con la app abierta), sin enviar datos de impresión. Al imprimir se abre
la conexión al equipo guardado. No se reimprimen automáticamente trabajos fallidos
o de resultado incierto. La preparación automática de impresora es desactivable.
Si falla la dirección LAN guardada se buscan candidatos en segundo plano, como
máximo una búsqueda automática por red/perfil cada dos minutos. Sólo se hace con
la app abierta; no se imprime ni se cambia a otra IP sin que el operador la elija.
La interfaz deja de consultar estado al cerrar Equipos o cerrar sesión.

Límites de LAN: sólo Wi-Fi/Ethernet privado, sin VPN, IPv4 y puerto 9100 para la
búsqueda. Se revisan como máximo los hosts del /24 de la tablet dentro de su subred
real, excluyendo tablet, puerta de enlace y direcciones de red/broadcast. No se
busca en internet. Candidatos con otro puerto o en otro segmento pueden configurarse
por el formulario manual existente. La búsqueda tiene plazo máximo, no bloquea el
hilo del POS y sus candidatos vencen o se invalidan al cambiar de red.

Un puerto abierto no acredita marca, modelo ni propiedad del equipo. Por eso un
nuevo candidato pide confirmación y la app no cambia a otra IP sólo porque tenga
el puerto abierto. Para resistir cambios DHCP, sigue siendo recomendable reservar
la IP de la impresora en el router. No se promete localizarla automáticamente
después de cualquier cambio de IP ni compatibilidad universal. La revisión está
centrada en impresora y báscula; otros periféricos se revisarán cuando se incorporen.

## 1. Identificar el módem con una laptop

Conecta la laptop al mismo router que la tablet y la impresora. Evita la red de
invitados: puede impedir que los equipos se vean aunque tengan internet.
Abre PowerShell y ejecuta este comando de consulta, sin cambiar la configuración:

```powershell
Get-NetIPConfiguration |
  Where-Object IPv4DefaultGateway |
  Select-Object InterfaceAlias,
    @{Name='IP_laptop';Expression={$_.IPv4Address.IPAddress}},
    @{Name='IP_modem';Expression={$_.IPv4DefaultGateway.NextHop}}
```

Busca el adaptador Wi-Fi o Ethernet que estás usando. Abre en el navegador la
dirección que aparezca como `IP_modem`, por ejemplo `http://192.168.1.1`.
El número es sólo un ejemplo: no presupongas que será el mismo en otro local.

La página de acceso o la etiqueta física suelen indicar marca y modelo.
PowerShell permite obtener la puerta de enlace, pero no garantiza identificar
el modelo exacto. No restablezcas el router ni pruebes contraseñas al azar.
No compartas contraseñas, PIN ni capturas que las muestren.

## 2. Encontrar y comprobar la impresora

En la administración del router, busca Dispositivos conectados, Clientes LAN o
Concesiones DHCP. Compara la dirección MAC con la etiqueta o la hoja de
configuración de red de la impresora. El nombre en la lista puede ser genérico.
Si la impresora tiene IP fija, podría no aparecer entre las concesiones DHCP;
en ese caso consulta su hoja de configuración o la herramienta de su fabricante.

Con una IP candidata, prueba únicamente la conexión TCP, sin mandar un ticket:

```powershell
$ipImpresora = Read-Host 'Escribe la IP local de la impresora'
Test-NetConnection -ComputerName $ipImpresora -Port 9100
```

`TcpTestSucceeded: True` indica que ese puerto acepta conexiones. No demuestra
por sí solo el modelo ni que se haya impreso papel. Un resultado negativo tampoco
prueba que esté averiada: revisa dirección, cable, segmento de red y puerto.
No abras ni redirijas el puerto 9100 hacia internet.

## 3. Evitar que cambie la dirección

Si la impresora obtiene su dirección por DHCP, crea una **reserva DHCP** para su
MAC en el router. Después comprueba que la impresora recibe esa dirección.
La ubicación del ajuste depende de la marca y modelo del router.

Si la impresora ya usa una IP estática, una reserva DHCP no cambia su configuración.
La dirección debe pertenecer a la misma subred, no estar duplicada y quedar fuera
del rango asignable del router o excluida de éste. No cambies estos valores sin
conocer la configuración actual. Cambiar de router, de subred o restablecerlo
puede requerir configurar la conexión de nuevo.

Pasos generales en el router (el nombre del menú varía):

1. Abre Equipos → Que la impresora no cambie de IP y consulta la dirección Router.
   También puedes obtener la puerta de enlace con PowerShell, como se indica arriba.
2. Entra como propietario en la administración de ese router y abre Clientes DHCP
   o Dispositivos conectados. Identifica la impresora por su MAC, no por una IP supuesta.
3. Busca Reserva DHCP / Reserva de direcciones. Reserva para esa MAC su IP actual,
   comprueba que no haya duplicados y guarda. No restablezcas el router.
4. Sin trabajos de impresión pendientes, reinicia sólo la impresora y comprueba
   que conserva la dirección. En Equipos vuelve a buscar y elígela si hace falta.

El patrón está documentado, por ejemplo, en la [guía oficial de reserva DHCP de
TP-Link](https://www.tp-link.com/us/support/faq/1101/); no presupone que tu router
sea de esa marca. La app no conoce su contraseña ni puede cambiarlo unilateralmente.
Si no existe acceso del propietario al router o la impresora no usa DHCP, primero
hay que identificar el equipo y su configuración. No enviar comandos de red a ciegas.

Como administrador, los valores excepcionales (otro puerto/segmento y papel)
siguen en Formato y configuración avanzada. La vista previa/venta de ejemplo
permite comprobar el papel sin registrar una operación comercial.

La conexión guardada se conserva al reiniciar y al actualizar la misma app.
No se garantiza que continúe funcionando si la dirección real cambia.

## 4. Qué pasa con los datos

Las ventas y los cambios del negocio se guardan localmente en la tablet. La base
Android está cifrada con SQLCipher y la clave se protege con Android Keystore.
Esto ayuda frente a la extracción del almacenamiento, pero no reemplaza un
respaldo, un PIN privado ni el bloqueo de pantalla.

Desinstalar la app o usar Borrar almacenamiento elimina sus datos internos.
La pérdida de la tablet, una falla o un restablecimiento también pueden impedir
recuperarlos. La app declara `allowBackup=false`: no dependas de una restauración
automática de Google. La APK y el actualizador privado no son respaldos de ventas.
Instala las actualizaciones con el mismo identificador y firma, sobre la app
existente; **no desinstales para actualizar**.

## 5. Crear y verificar un respaldo existente

1. Inicia sesión como administrador. Pulsa Atrás de Android hasta que aparezca
   el diálogo de cierre; si hay un panel o diálogo abierto, puede cerrarse primero.
2. Elige Equipos y respaldos → Crear respaldo cifrado.
3. Crea una contraseña larga y única, distinta del PIN de acceso. Consérvala en
   un lugar seguro separado del archivo. Sin ella no se puede recuperar la copia.
4. Guarda el archivo `.emandroid` mediante el selector de archivos de Android.
5. Copia el archivo también a una computadora, memoria externa o almacenamiento
   privado en la nube. No lo subas al repositorio público ni compartas su contraseña.
6. En Equipos y respaldos → Verificar recuperación aislada, selecciona ese archivo
   y escribe su contraseña. Esto valida la recuperación en otra carpeta sin
   reemplazar los datos activos.

El respaldo incluye la base y las fotografías, con validación de integridad.
Usa cifrado AES-256-GCM y una clave derivada de la contraseña. Actualmente no
incluye el perfil nativo de conexión de impresora/báscula: anota IP, puerto, papel
y equipo para volver a conectarlos si recuperas en otra instalación.

Para una recuperación real utiliza Recuperar sin sobrescribir datos. Primero se
valida una copia aislada; sólo se activa después de confirmar Activar copia.
Se conserva la carpeta anterior de esa instalación. No actives un respaldo viejo
como prueba sobre un negocio que sigue operando: perderías de la vista activa las
operaciones posteriores a la fecha del respaldo.

Rutina recomendada: respaldo al cerrar el día y antes de actualizar; conservar
varias fechas, una copia fuera de la tablet y verificar periódicamente su lectura.
Un archivo en Descargas suele sobrevivir a una desinstalación normal, pero sigue
estando en el mismo equipo y no protege contra pérdida o restablecimiento.
No hay un respaldo remoto automático configurado en esta revisión.

## Referencias

- [Android: eliminación de archivos propios al desinstalar](https://developer.android.com/training/data-storage/app-specific).
- [Android: configuración y límites de Auto Backup](https://developer.android.com/identity/data/autobackup).
- [Ejemplo oficial de reserva DHCP en TP-Link](https://www.tp-link.com/us/support/faq/1101/).

Los pasos de respaldo y los nombres de la interfaz corresponden al código local
Android vigente; las referencias de router son orientativas hasta identificar
el equipo del establecimiento. No se modificó la red ni se probó recuperación con
datos reales del propietario al preparar esta guía.
