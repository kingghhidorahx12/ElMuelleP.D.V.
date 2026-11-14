# EM-003: continuidad para la prueba Android

Actualización: 14 de noviembre de 2026, America/Mexico_City.

## Primera entrega oficial aceptada: fuentes 1.0.22 / código 23

El propietario informó la aceptación de la primera entrega en uso y autorizó
publicar sus fuentes estables en GitHub. Esta revisión conserva la versión
Android `1.0.22-android-prueba` y versionCode 23; la aceptación comercial no cambia
el identificador del binario ni acredita nuevas pruebas físicas.

El propietario informó funcionamiento USB en el local. No se convierte esa
respuesta en una nueva lectura de báscula, impresión o medición de FPS.
Esta publicación no incluye el controlador DPC/Device Owner en preparación,
APK privadas, catálogos/fotografías privados de entrega, bases, respaldos,
diagnósticos reales, PIN, tokens ni claves de firma. Clonar las fuentes no
recupera los archivos privados necesarios para compilar la entrega del cliente.
No activar restricciones ni cambiar cuentas o instalaciones desde esta revisión.
Ver `docs/PRIMERA_ENTREGA_OFICIAL.md` para el alcance y las huellas de referencia.

## Entrega anterior: conexión simple para dueño y empleados e IP persistente

El propietario informa que la impresora LAN cambió de IP y perdió conexión; no se
leyó la versión instalada ni se aportó diagnóstico nativo. Pide lista de equipos,
elección inicial, reconexión automática y acceso de empleados a impresora/báscula
sin formularios técnicos. La captura adjunta muestra El Oeste, no El Muelle; no
usar su dirección como IP de impresora/router ni modificar ese otro sistema.
Router todavía no identificado; el propietario respondió «No lo sé» al pedir
marca/modelo. Usar la puerta de enlace mostrada por Equipos/PowerShell y la
administración del router; no repetir la pregunta como bloqueo ni asumir fabricante.

Se revisa el flujo ya existente: detección nativa acotada y selección recordada,
pero panel/operaciones de periféricos sólo administrativos y búsqueda LAN manual.
Se prepara acceso rápido Equipos para sesiones activas, con permiso restringido
para buscar/elegir/reconectar, no para cambiar protocolos, comandos, formato, claves,
respaldos o permisos. No se van a adivinar comandos para fijar IP en la impresora.
Para persistencia de dirección se requiere reserva DHCP por MAC en el router del
local, con guía específica cuando se conozca modelo. Un puerto 9100 abierto no
identifica por sí solo la misma impresora; candidatos nuevos exigen selección.
Preservar UI general aprobada, checks corregidos, Windows, datos y firma.

Fuentes **1.0.22/código 23**: acceso Equipos en la barra para sesiones activas;
abre búsqueda sin formularios, marca selección guardada y permite reconectar.
Sólo una fachada nativa de estado/búsqueda/selección/reconexión se abre a empleados;
descarta campos extra, admite únicamente id de candidato y mantiene credenciales,
formatos, perfiles técnicos, respaldos y diagnósticos en sus permisos anteriores.
Bluetooth permite el permiso/emparejamiento Android a usuarios con sesión; Shell.devices
abre este acceso rápido, no el menú administrativo de respaldos.
Si falla LAN, búsqueda nativa automática con límite de dos minutos por red/perfil,
máximo /24 real, ocho trabajadores, 350 ms por socket y plazo de 15 s; sin payload.
Se muestra IPv4 de tablet/gateway para guiar reserva DHCP, no se cambia el router
ni se deduce identidad de la impresora por un puerto. Ninguna IP candidata se adopta sola.
El lector BAR-9, protocolos y comprobaciones de peso permanecen intactos.

Pruebas dirigidas: 11 TAP de rutas/permisos aprobadas; navegador del contenedor
verificó dueño/empleado sin módulo Settings, selección de IP nueva sin teclear,
búsqueda al abrir, escape de nombres como texto, estados/guardado de preferencia,
ausencia de sondeo UI cerrado y descarte tras logout; 3 tamaños sin desbordamientos.
Capturas privadas inspeccionadas. Fallos iniciales fueron del fixture (faltaba
recargar empleados; GET settings público no es administrativo); se corrigieron
las expectativas, no se cambiaron esos servicios. CSS final añade track de switch
explícito y las pruebas de interfaz pasaron otra vez sobre ese paquete final.
Build release **10m53s** y **16/16** pruebas de PeripheralPolicy (1m43s) aprobados.
APK real: firma original, versión, alineación, dependencias y todos los hashes,
28 productos/fotos, sin usuarios/operaciones/claves privadas comprobados.
Entrega local verificada: **1.0.22-android-prueba / código 23**,
`C:/Users/nexar/Downloads/ElMuellePDV-Android-Equipos-Simples-20261113-7d251433/ElMuellePDV-Android.apk`.
Tamaño **135096935 bytes**, SHA-256:
`9C7A11D7EC92AF7129FF022B4822492FF0A3CF67F8D7127A2AF79308CBA60EC6`.
Manifiesto de fuentes:
`1D7E73209DE1DC858D98ABEE907329E52BF6C8545262FB78EFAF78B27F0E5BF9`.
Publicación completa del código 23, 1031 bloques de 128 KiB, mismo Worker/canal
privado y sin rotación de claves ni cambios de plan. El 22 se conserva hasta
verificar descarga íntegra. Prueba de internet desde el bundle original 1.0.21
(huella de fuentes `7CE5E65058AE885258926C47425F599AD8444B55C23BEE4033B6A03040AC65B6`)
**aprobada**: 135096935 bytes y SHA-256 idénticos a la entrega firmada, sin Buzón,
alta ni códigos; permiso sólo de descarga y descarga anónima rechazada. No cambió
la actividad comercial del host aislado. No es el código nuevo simulando una versión
antigua. JNI/SQLite siguen siendo dobles del host. Retención final aprobada: se
retiró código 22 después de validar su copia local por hash/manifiesto y quedó
**sólo código 23 publicado**. Metadatos de Descargas finalizados y leídos de vuelta,
sin alterar la APK. No hubo commit/push ni cambio de plan, claves o datos del negocio.
Pendiente físico: instalar sin desinstalar, probar búsqueda/conexión/impresión y
reconexión en la tablet real; la IP aún no se ha reservado en el router. El dueño
debe entrar a su administración y reservar MAC/IP una vez, sin resetear ni adivinar
IPs, comandos o credenciales. La guía local contiene pasos y consulta PowerShell.
Resultados finales: `.dev/em003-direct-update-internet-result.json`,
`.dev/em003-direct-update-server-final.json` y manifiesto de la entrega. Helpers
ahora fijan código 23; adaptar coherentemente antes de publicar otra versión.
Equipos y red del host son dobles, no una conexión física ni una medición de FPS.
No se modificaron instalaciones, Windows, datos comerciales o claves originales.
Evidencias: `.dev/em003-quick-devices-{build,policy,routes}.log`,
`.dev/em003-quick-devices-browser-release.log`, `.dev/em003-peripherals-browser-result.json`
y capturas privadas `quick-devices-GbjRNT`. Los metadatos anteriores se guardan con -22.

## Entrega anterior: revertir cambio equivocado y corregir checks de permisos

El propietario aclara con captura que se refería a los checks de acciones de
Configuración → Usuarios y PIN → Permisos, no a los paneles de impresora/periféricos.
Pide revertir su cambio de presentación/ubicación, que ya estaba bien. No se leyó
la versión instalada. La 1.0.20/código 21 anterior sí se publicó, descargó por
internet desde el bundle original 1.0.19 en host aislado y quedó sola en servidor;
su resultado no acredita instalación física ni satisfacción visual del propietario.
APK anterior: `C:/Users/nexar/Downloads/ElMuellePDV-Android-Controles-Ordenados-20261113-3b102e63/ElMuellePDV-Android.apk`,
SHA-256 `F8AA50C14E080F7F2472A258AED9D8608347B8A765A0B3764B70F31C770DAF65`.

Se restauran printer.js, peripherals.js y updates.js desde el bundle verificado
1.0.19 y se retira settings-layout.js y sus reglas añadidas, sin revertir el
actualizador sin códigos, firma o funciones comerciales. La única adaptación
nueva será CSS Android del checklist de acciones, manteniendo sus handlers y
permisos de servidor. En reproducción aislada los checks heredaban 182 × 42 px;
ahora 18 × 18 con separación de 9 px al texto y fila táctil de 40 px. Pasaron los
tres tamaños del contenedor (1366×768, 1280×800, 1024×600), límites del texto/caja,
toque de etiqueta, teclado, guardado/recuperación, estado parcial/bloqueado y
restauración de los otros paneles. Capturas privadas inspeccionadas. También pasó
el flujo de actualización con instalador simulado después de la reversión.
JavaScript Android comparado contra el bundle 1.0.19 sin diferencias salvo finales
de línea; los tres scripts restaurados coinciden con sus segmentos originales.
Build de **1.0.21/código 22** terminado en **2m31s**. Firma original, alineación,
applicationId, versión, dependencias y todos los hashes del paquete verificados.
Conserva 28 productos/fotos, cero stock inicial administrativo, sin usuarios ni
operaciones predefinidas. Windows y servicios de equipos/comercio no cambian.
Contra bundle 1.0.19 cambian sólo app.js (finales de línea) y android-tablet.css.
APK local copiada y verificada:
`C:/Users/nexar/Downloads/ElMuellePDV-Android-Permisos-Corregidos-20261113-41592170/ElMuellePDV-Android.apk`.
Tamaño **135093507 bytes**, SHA-256:
`7ABC8F3F381C284F5A5EF5D1EF99597CC5743468119845889AAAECEC186F811F`.
Manifiesto de fuentes:
`7CE5E65058AE885258926C47425F599AD8444B55C23BEE4033B6A03040AC65B6`.
Publicación completa del código 22: 1031 bloques de 128 KiB, mismo Worker/canal
privado y sin cambiar claves ni plan. El 21 se conservó durante la verificación.
La comprobación usa el bundle original de 1.0.20/código 21 con huella de fuentes
`10E8AF7CF66420A031E3E8686DD02AE33574E4E02E23825E24B5C646C27F3BEA`,
conservado antes de la nueva preparación; no el código nuevo simulando uno antiguo.
JNI/SQLite siguen siendo dobles del host. **Descarga real íntegra aprobada** desde
ese bundle: 135093507 bytes y SHA-256 idénticos a la APK firmada, sin Buzón/alta,
permiso sólo de descarga, rechazo de descarga anónima y datos comerciales del host
aislado intactos. Después se retiró el código 21 del servidor con copia local por
hash y manifiesto preservados; consulta final: **sólo código 22 publicado**.
Manifiesto/verificación de Descargas finalizados con descarga y retención aprobadas,
sin modificar la APK firmada. No se borraron bases ni instalaciones, no hubo
commit/push, cambio de plan/facturación o rotación de claves.
No se instaló en tablet ni se repitió lectura física de báscula. Pendiente del
propietario: instalar sobre la app existente, sin desinstalar, confirmar apertura
y disposición de los checks. No convertir las pruebas del host en pruebas físicas.
Metadatos/evidencias anteriores guardados con
sufijo -21; pruebas nuevas: `.dev/em003-permission-layout-{baseline,fixed}.json`,
capturas privadas `permission-layout-NkwNA1`, build/verificación y prueba de botón.
Resultado de internet y retención final en `.dev/em003-direct-update-internet-result.json`
y `.dev/em003-direct-update-server-final.json`. Helpers privados fijan código 22;
adaptarlos y verificar metadatos antes de una entrega posterior.
Preservar datos, catálogo, permisos, conexión y firma; no repetir pruebas de báscula.

## Histórico: cierre 1.0.19 antes de publicar 1.0.20

La entonces vigente **1.0.19 / código 20** se publicó y se descargó íntegra por
internet desde las rutas de un POS aislado, con **Buzón desactivado**, sin códigos
ni alta de instalación. Los **135093083 bytes** y SHA-256 coinciden con la APK
firmada de entrega. La prueba verificó permiso sólo de lectura, rechazo de descarga
anónima y de acceso administrativo, y ausencia de cambios comerciales en el host.
El host usó el código actual y simuló una versión instalada 19 para descargar 20;
no es una prueba del binario antiguo ni una instalación física Android.

Tras esa comprobación se retiró el código 19 del servidor. Consulta administrativa
de ese momento: **una única publicación, código 20**. Los códigos 14, 15 y 19 se retiraron
con autorización del propietario; se conservan sus APK locales por SHA-256 y sus
manifiestos en `.dev/em003-direct-update-retention-archive.json`. No se eliminaron
instalaciones, bases, ventas ni informes. No recomendar 1.0.18, cuya descarga falló.

El primer intento del cierre se rechazó por límite de uso del revisor automático;
esa acción no se ejecutó. El propietario pidió continuar y el 13/11 se completaron
la retirada y los metadatos finales, sin eludir aprobaciones. La copia de Descargas
incluye manifiesto/verificación actualizados, leídos de vuelta, con publicación,
descarga íntegra y retención confirmadas. Su APK conserva la huella indicada abajo.

Evidencias privadas conservadas de esa entrega: copias
`.dev/em003-direct-update-internet-result-20.json`,
`.dev/em003-direct-update-published-20.json` y
`.dev/em003-direct-update-delivery-20.json`, además de registros de prueba.
Los nombres sin sufijo y helpers se adaptaron después a publicaciones posteriores;
consultar siempre el cierre actual de arriba, no ejecutar helpers como si fijaran 20.
No hubo commit/push, instalación física ni cambio del plan/facturación. Pendiente:
instalar esta APK una vez sobre la existente, sin desinstalar, para reemplazar el
bloqueo del actualizador antiguo; después usar el botón de Configuración. La firma,
integridad y autorización normal del instalador Android continúan siendo obligatorias.
Lectura nueva de báscula, reconexión de periféricos e instalación física no se
acreditan con la prueba del host. Usar el diagnóstico existente ante un fallo.

## Corrección de transferencia 1.0.19: publicación y descarga verificadas

La 1.0.18/código 19 sí terminó de subir y publicarse tras reanudar desde 214/258
bloques; antes hubo HTTP 503 HTML y un fallo de conexión. La prueba de descarga
real sin Buzón empezó, pero se detuvo al 6 % con «El receptor no confirmó la
operación». El diagnóstico posterior de publicación mostró «Worker exceeded
resource limits», no un PIN incorrecto. Cloudflare documenta ese error para CPU/
memoria, con límite CPU de 10 ms en plan gratuito. No se midió CPU ni se activó pago.
No considerar 1.0.18 entregada/apta: la publicación no acreditó descarga íntegra.

Se preparó **1.0.19-android-prueba / código 20**, misma applicationId y firma:
`C:/Users/nexar/Downloads/ElMuellePDV-Android-Actualizar-Sin-Codigos-20261112-115afb61/ElMuellePDV-Android.apk`.
Tamaño **135093083 bytes**, SHA-256:
`3DFEA81066D0C8E627F93C0E94750FD15FB22CFC381019F31685516710D513C2`.
Manifiesto de fuentes:
`F502F2DD5921628BA8762052D0201D02A653ED1CB813A0009C1ACDB790BABBD0`.

Cliente/servidor admiten bloques 128/512 KiB; publicación nueva usa **128 KiB**,
1031 bloques, para reducir trabajo por petición. Descarga tiene cinco reintentos
acotados y ritmo mínimo 150 ms/bloque. Publicador usa tres conexiones, con salida
global separada por 180 ms y reanudación por índices. No se cambió el plan ni se
alteraron claves originales. Worker nuevo: `569b34a9-3ce4-48db-a83d-ee663945a6cb`.
Al cancelar el permiso Android se limpia la intención pendiente en onResume, para
no iniciar una instalación al autorizar esa fuente en otra visita posterior.

Seis pruebas unitarias de actualización (incluye bloques pequeños completos/último
parcial/reintento) y Worker local 128/512 KiB aprobaron. UI de botón único y sus
reglas no cambió desde la prueba aprobada de 1.0.18; no se repitió. Build 2m05s y APK
real verificada con firma, alineación, hashes, canal privado y catálogo original.
Se retiró código 15 del servidor, con copia local verificada, para dar capacidad
a la corrección. Código 19 se conservó hasta publicar y descargar íntegramente
el 20; después se retiró, como consta en el cierre superior. La publicación secuencial del 20 se detuvo sólo para acelerar su
continuación con tres conexiones; había 233/1031 bloques guardados. No se perdieron.
Publicación, descarga real y retención finales quedaron verificadas.
Los resultados fallidos del 19 se conservaron en los archivos privados *-19.json.

## Transición preparada: Android 1.0.18 sin códigos

APK **1.0.18-android-prueba / código 19**, misma applicationId y firma original:
`C:/Users/nexar/Downloads/ElMuellePDV-Android-Actualizar-Sin-Codigos-20261112-29adc398/ElMuellePDV-Android.apk`.
Tamaño **135093027 bytes**. SHA-256:
`3899FE919A17B62ACF0F6E2A340DFC9975D4176917DA725531A0D2FDBBA0C9F2`.
Huella del manifiesto de fuentes:
`C195DE86A44D74BE87E8760E850F01D2509B6A9BB9AFBC1AEC2F13232490C37B`.

El propietario autorizó eliminar la activación manual del actualizador y publicar,
y pidió que en servidor quede sólo la reciente. El flujo nuevo usa un permiso
automático privado de lectura, separado de Buzón/publicación. Se inyecta desde
`.dev/em003-android-update-channel/channel.json` al bundle generado, ambos ignorados
por Git y no al código público. Puede extraerse de la APK privada (no es DRM);
sólo permite descargar versiones, no consultar informes, enviar ventas ni publicar.
No se cambiaron MAILBOX_DATA_KEY, MAILBOX_ADMIN_TOKEN ni la firma original.
El secreto nuevo de Worker es ANDROID_UPDATE_READ_TOKEN. Worker desplegado:
`3133e508-fc11-4c82-8012-335ea75b2017`. No requiere migración de base.

Un botón busca/descarga/verifica/solicita instalación; conserva bloqueo al iniciar
o aparecer una venta pendiente, evita instalación tardía tras logout y retoma al
volver del permiso normal de Android. Se retiraron los diálogos propios redundantes;
la confirmación del instalador Android no se omite. No hay acceso PIN/Buzón para
actualizar. Las APK antiguas que bloquean antes de HTTP necesitan esta instalación
de transición una vez, sobre la existente y sin desinstalar.

Pruebas observadas: cinco unitarias de actualizador; dos de transporte (lectura
automática y HMAC individual previo de Buzón); Worker local con lectura sin alta,
denegación de acceso administrativo/publicación, descifrado íntegro, retirada
confirmada y rechazo a retirar la última versión; navegador con búsqueda sin Buzón,
un solo botón, bloqueo de venta inicial/durante descarga, logout y cero mutaciones
comerciales. Instalador en navegador simulado; no instalación física. Vista del panel
inspeccionada. Build final 2m04s; APK real pasó firma, alineación, hashes, dependencias,
canal de lectura, 28 productos/fotos y ausencia de usuarios/operaciones/claves
administrativas/de firma. Se mantienen comercio, báscula, periféricos y marca.

Se acreditaron por API las publicaciones antiguas códigos 14 y 15. Antes de retirar,
se comprobaron las copias locales originales por SHA-256 y se archivaron manifiestos
en `.dev/em003-direct-update-retention-archive.json`. Se retiró código 14 por capacidad;
15 se conserva mientras termina la publicación y la prueba íntegra real del 19.
El resultado final de internet/retención debe completarse antes de declarar terminado.
No se hizo commit/push ni instalación en tablet. Helpers privados de esta entrega
fijan código 19: no reutilizarlos para otra versión sin adaptar y verificar metadatos.

## Solicitud vigente: actualizar sin activación manual y publicar en servidor

El propietario pide eliminar el paso de activación de Buzón para actualizar y
publicar la nueva APK en el servidor. Se separará el permiso automático de descarga
del acceso a Buzón, conservando firma original, integridad, privacidad del catálogo
y confirmación del instalador Android. La versión instalada bloquea la consulta
antes de contactar internet; no puede corregirse ese código antiguo sólo desde el
servidor. Se prepara una primera instalación por enlace directo y luego flujo simple.
El propietario respondió «Que sólo esté la versión reciente»: autoriza retirar las
APK antiguas del servidor, conservando copias locales verificadas. Retirar primero
la más antigua sólo para liberar capacidad, conservar la anterior hasta publicar/
verificar la nueva y luego dejar únicamente la reciente. No eliminar datos comerciales
ni cambiar claves originales de Buzón/firma. El nuevo canal incluirá sólo un permiso
privado de lectura de APK; nunca una clave de publicación o administración de Buzón.

## Consulta posterior: aviso de enlace privado al buscar actualizaciones

El propietario informa el aviso «Activa primero el enlace privado en Buzón con el
código del propietario». En `android/runtime/updates.cjs`, `cfg()` lo produce antes
de consultar internet si falta active/clientId/secret/endpoint en la configuración
local. No prueba fallo del PIN ni de los datos comerciales. No se inspeccionó la
configuración de la tablet ni su versión instalada. El código solicitado es una
invitación temporal de enlace (un uso, diez minutos), no el PIN administrativo.
La APK 1.0.17 se entregó manualmente; no se publicó para descarga dentro de la app.
La última publicación acreditada aquí sigue siendo código 15; no se consultó el
estado remoto en esta revisión. Activar el enlace no publica una APK. No se emitió
código, cambió configuración, publicó APK ni eliminó versiones al responder la consulta.

## Entrega local de periféricos Android 1.0.17

**1.0.17-android-prueba / código 18**, misma applicationId `mx.elmuelle.pdv`
y firma original. APK verificada y copia final con manifiesto leída de vuelta:
`C:/Users/nexar/Downloads/ElMuellePDV-Android-Perifericos-Automaticos-20261112-33e20288/ElMuellePDV-Android.apk`.
Tamaño **135092659 bytes**. SHA-256:
`112B244BDCBBE8D5D493C5724D9A357A421D562E7E29D73423273D033E9EFAC4`.
Huella del manifiesto de fuentes:
`75564D000E5444F075327911E9A41D600C2FB5F9C9CDDA4D31C1136740CB817C`.

- Panel administrativo Configuración → Periféricos → Periféricos · detectar y
  reconectar. Enumera USB y Bluetooth ya emparejado; búsqueda LAN sin escribir IP.
  Exige confirmar un nuevo candidato de impresora. Báscula conserva perfil aprobado.
- Prepara la impresora USB guardada, renueva deviceId y recuerda serial cuando se
  dispone de permiso. Duplicados sin identidad suficiente exigen elección; un ID
  Android antiguo nunca basta al iniciar otra sesión de conexión. No hay diálogos
  USB repetidos en bucle tras negar acceso; una elección explícita permite reintentar.
- LAN recordada: sondeo TCP vacío cada 30 s con app en primer plano y subred actual.
  Búsqueda solicitada: IPv4 privado Wi-Fi/Ethernet, no VPN/celular, máximo /24 dentro
  de subred real, ocho trabajadores, 350 ms por conexión y plazo total 15 s.
  Excluye tablet, gateway y red/broadcast. No imprime, no adivina modelo ni cambia
  silenciosamente a otra IP. Los candidatos caducan a 120 s y se invalidan por red.
  Para IP cambiante sin identidad verificable, confirmar candidato o reservar DHCP.
- Bluetooth mantiene dirección emparejada, permiso Android y conexión al imprimir;
  no escanea dispositivos sin emparejar ni solicita ubicación. Preparación automática
  de impresora desactivable. No hay reimpresión automática de trabajos inciertos.
- Sondeo de interfaz sólo mientras el panel es visible en Configuración. Al volver
  al POS o salir de sesión se detiene; nombres se limpian y respuestas tardías se
  descartan. El servidor exige administrador para inventario, búsqueda y selección.
  El lector preexistente no cambia: el propietario confirmó sólo impresora/báscula.
- Incluye recursos circulares/splash y Pescadería de 1.0.16. Sus tres PNG empaquetados
  son idénticos por hash a esa APK verificada; no se repitieron pruebas de geometría.

Pruebas nuevas/afectadas: **20 Java** aprobadas (15 de selección/subred/caducidad/
sondeo sin payload y cinco de transporte LAN); **11 resultados TAP** de rutas y
permisos; navegador real en host aislado verificó búsqueda sin IP manual, confirmación,
preferencia, nombres como texto contra inyección, cero sondeos del panel durante
seis segundos en POS y limpieza al salir. Nativos/red fueron dobles: no acreditan
reconexión física ni impresión. El primer intento de rutas encontró EACCES a localhost
por el entorno restringido; se repitió con acceso local autorizado y pasó completo.
La compilación final terminó en 3m47s. Firma original, alineación, dependencias,
hashes, 28 productos/fotos y ausencia de claves/usuarios/operaciones comprobados.
Comparación contra 1.0.16: sólo app.js Android, android-tablet.css y rutas nativas del
bundle cambiaron; servidor comercial, lector, reglas de peso y demás assets intactos.
El código USB de báscula no cambió ni se enviaron solicitudes físicas desde esta PC.

Evidencia privada: `.dev/em003-peripherals-release.log`, informes XML Gradle,
`.dev/em003-peripherals-routes.log`, `.dev/em003-peripherals-browser-result.json`,
`.dev/em003-peripherals-apk-verification.log` y `.dev/em003-peripherals-delivery.json`.
No se instaló ni publicó remotamente, no se alteró red/datos reales y no hubo commit/
push. Entrega manual sobre la app existente, sin desinstalar, con respaldo previo.
Pendiente físico: apertura de actualización, icono/splash, selección LAN, impresión,
reconexión USB/Bluetooth/LAN y nueva lectura de báscula. Usar diagnóstico automático
si falla, sin comandos desconocidos ni calibración. Guía: `docs/RED_Y_RESPALDOS_ANDROID.md`.

## Solicitud vigente: periféricos con menos configuración manual

El propietario pide detección y conexión automática, no sólo para impresora sino
también para otros periféricos. Después confirmó «sólo esos por ahora»: impresora
y báscula. El trabajo se acota a USB, Bluetooth emparejado y búsqueda LAN para esos
equipos; se retiró del nuevo panel la habilitación de lectores antes de entregar.
El escáner preexistente no cambió. No asumir compatibilidad universal,
no enviar pruebas de impresión automáticamente ni comandos USB desconocidos.
La báscula conserva el perfil aprobado y el bloqueo de peso inválido/vencido.

## Marca circular 1.0.16 preparada localmente

APK **1.0.16-android-prueba / código 17**, misma applicationId y firma original:
`C:/Users/nexar/Downloads/ElMuellePDV-Android-Marca-Circular-20261112-a304a16c/ElMuellePDV-Android.apk`.
Tamaño: **135080809 bytes**. SHA-256:
`0CCFA7B201FA405A67FB60FA6CA2C86EFC5255EF9493D41A698722030F0A6629`.
Manifiesto de fuentes:
`1192CCFB52C4EA244C88005E18B1B230CE6BC6D6581570E3E419221A1712485B`.

La compilación release terminó y se comprobaron firma, alineación, dependencias,
todos los hashes, 28 productos/fotos y ausencia de usuarios/operaciones/claves.
El aro original medía 955 × 989; se normalizó a círculo con margen transparente.
El splash nativo ajusta proporcionalmente y el lateral dice Pescadería (etiqueta
HTML compartida; PNG originales de public/assets/brand y lógica Windows intactos).
Pruebas de marca: 360 ángulos por imagen, 25 ajustes, 4 tamaños inválidos y recursos
reales de APK. La comparación de bundles contra 1.0.15 sólo cambió index.html;
JS comercial, LAN, animaciones y USB son idénticos. No se repitieron esas regresiones.
Un primer helper de entrega comparó mal el Count de propiedades PowerShell; falló
antes de copiar, se corrigió y la entrega final con manifiesto/hash pasó.
Evidencia privada: `.dev/em003-brand-tests/result.json`, build/verificación/delivery.
No se instaló ni publicó esta APK, no hubo commit/push, ni confirmación física del
launcher/splash. El usuario añadió la automatización antes del mensaje final de entrega.
Guía consultiva añadida: `docs/RED_Y_RESPALDOS_ANDROID.md`; no se cambió la red ni se
configuró respaldo remoto automático.

## Solicitud posterior: proporción de marca y nombre

El propietario informa que el icono Android y el splash se ven ovalados y pide
conservar una marca circular. También solicita que el lateral diga El Muelle
Pescadería, en lugar de Marisquería. Se revisarán los recursos y su geometría;
no se cambia el dibujo original del puente ni el catálogo. Consulta además si una
laptop con PowerShell permite identificar el router del negocio; su modelo no se
conoce. No se ha cambiado la red del cliente ni se ha configurado respaldo remoto.

## Resultado comunicado tras la 1.0.15

El propietario respondió «Genial, ya funcionó» después de la entrega corregida
y de los pasos de conexión LAN. Se conserva como confirmación informada de
funcionamiento, sin convertirla en una medición de FPS ni atribuirle una nueva
lectura física de báscula. No se aportó otro video ni se precisaron aquí las
comprobaciones concretas en papel. Ahora solicita un método para localizar/fijar
la IP en la red del negocio y proteger la información ante desinstalación o pérdida.

## Corrección dirigida LAN y fluidez Android 1.0.15

**1.0.15-android-prueba / código 16**, misma applicationId `mx.elmuelle.pdv`
y certificado original. Entrega privada verificada:
`C:/Users/nexar/Downloads/ElMuellePDV-Android-LAN-Fluidez-20261112-bcee61e4/ElMuellePDV-Android.apk`.
Tamaño: **135413349 bytes**. SHA-256:
`3A1E0BC1C0CA12CA0C8BD9224EA51531DCB9DAE8D81FA433F7A0BCA441E1EDA6`.
Huella del manifiesto de fuentes empaquetadas:
`2841FE7CC2F3FA7992C26A028AA8AE7648E9C4CB6BF645F36751DE227F3ABACD`.

- LAN sí se seleccionaba, pero los eventos repetidos de sesión recuperaban el
  perfil Bluetooth guardado y pisaban el formulario. Se preservan los cambios
  pendientes de conexión, IP y formato, con guardas contra respuestas de otra
  sesión y limpieza al salir. Abrir el panel permite recuperar el perfil sin
  borrar campos ya editados.
- La copia Android emite el evento de sesión sólo al cambiar identidad/estado/
  permisos. Abrir/cerrar Venta actual ya no recarga comercio, impresora y actualizador.
  Windows conserva su fuente y comportamiento; no se modificó la secuencia USB.
- Las animaciones dejan de medir/mover el catálogo completo y de clonar el ticket.
  Se anima el mismo panel de venta, con cancelación segura al alternar rápidamente
  y movimiento reducido conservado. El cierre directo y el toggle comparten una
  transición, sin ejecutar animaciones anidadas.

Pruebas nuevas: **5/5** unitarias de animación; navegador real con la fuente
Android empaquetada verificó LAN ante un perfil Bluetooth simulado, eventos
repetidos, guardado, sondeo TCP simulado, formato pendiente y limpieza al salir.
En **16 alternancias**, con CPU del navegador ralentizada 4x, se observaron cero
eventos de sesión, cero consultas API adicionales, cero consultas de estado de
impresora y cero clones de ticket. No son mediciones de FPS de la tablet.
También pasaron los flujos afectados de permisos por acción, costos privados,
teclado al tocar, editor/reversión del ticket y coincidencia vista/envío. No se
registraron operaciones en bases definitivas ni se conectó una impresora de verdad.

Hubo fallos de preparación en el intento inicial (salud del host, espera de
finalización del alta y visibilidad del panel). Se corrigió la espera del alta y
se ejecutó la prueba dirigida sobre la fuente corregida. La reproducción temprana
de la fuente anterior mostró LAN ocultándose antes de escribir la IP. Un intento
de medición comparativa anterior no tuvo host disponible; no hay una comparación
cuantitativa acreditada de FPS antes/después. Evidencia privada en
`.dev/em003-lan-motion-fixed.json`, `.dev/em003-actions-browser-result.json` y
`.dev/em003-ticket-browser-result.json`.

Gradle release terminó; la APK real pasó firma original, alineación, versionCode,
applicationId, todas las huellas internas y dependencias autocontenidas. Conserva
28 productos/fotos, cero administrativo, sin usuarios/operaciones ni claves
privadas. Copia final, manifiesto y texto de verificación comprobados.
No se hizo commit/push, instalación ni publicación remota de la versión 16.
Actualizar manualmente sobre la existente, sin desinstalar. El receptor sigue
con versiones 14 y 15 y requiere revisar capacidad antes de publicar otra APK;
no eliminar versiones en silencio. Pendiente físico de la 1.0.15: apertura de la
actualización, selección LAN/impresión, fluidez de paneles y nueva lectura de báscula.

## Resultado posterior: selector LAN y fluidez (12 de noviembre)

El propietario informa que no puede conservar LAN y que abrir/cerrar el menú o
Venta actual provoca tirones y ocasionales bloqueos. El video privado
`WhatsApp Video 2026-11-12 at 5.38.13 PM.mp4` muestra la interfaz indicando
1.0.14: LAN llega a seleccionarse y aparecen sus campos, pero vuelve a
USB/Bluetooth. El video acredita apertura de esa interfaz 1.0.14 y un fallo de
la selección; todavía
no acredita impresión física LAN ni un fallo del transporte TCP.
En esta PC, una consulta TCP sin datos encontró un candidato en el puerto de
impresión; el modelo no se identificó por su panel web. No se envió papel.
La corrección y entrega 1.0.15 se documentan arriba. No se atribuyen
mediciones de FPS de esta PC al rendimiento de la tablet.

## Lote de comodidad, permisos y ticket Android 1.0.14

El propietario autorizó aplicar conjuntamente los acuerdos posteriores a la 1.0.13.
La conformidad «Excelente, ya quedó» sobre esa entrega sigue siendo informada,
no una certificación nueva de báscula ni del instalador nativo.

**1.0.14-android-prueba / código 15**, misma applicationId y certificado original.
APK privada físicamente verificada: `C:/Users/nexar/Downloads/ElMuellePDV-Android-Comodidad-Permisos-Ticket-20261112-72ccdd85/ElMuellePDV-Android.apk`.
Tamaño: **135413045 bytes**. SHA-256:
`35C8D27C88F984163E06D042DFBE8B4C741DE96728BAD60A0C444292AB099718`.
Huella de fuentes locales empaquetadas: `BF5214DAF98F2D8EBF9D4355795D2F9E4C81F75F5A0BC7090EE62900130CA457`.

- Teclado sólo al tocar el campo; el foco de cantidad y otros focos programáticos
  no piden IME. Hardware y escáner conservan entrada de teclado.
- Motivos de inventario por lista, Otro explicado, sin reescribir historial.
- Permisos por acción anidados en el acceso general: recibir no permite reducir,
  merma, cambiar precios ni administrar permisos. Se revocan en el servidor.
  Los mínimos se modifican sin registrar un movimiento ficticio; activar un producto
  no exige editar sus campos comerciales heredados. Costos y márgenes siguen privados.
- Editor administrativo del ticket: imagen validada, textos, alineación, tamaño,
  negritas y separación, vista real, guardado con revisión y recuperación anterior.
  Las filas contienen producto, precio unitario cobrado, cantidad e importe.
  Los importes se conservan calculados por la venta; no se editan en el diseño.
  Los nombres largos se ajustan de tamaño y, si hace falta, se abrevian sólo en papel.
- Impresión LAN opcional por IP privada/puerto, con sondeo TCP sin enviar papel
  y envío acotado; conserva USB y Bluetooth. No se expone el POS a internet.

Pruebas acreditadas: regresiones afectadas de inventario/comercio/recuperación,
permisos generales y por acción, esquema/reversión del ticket, rutas nativas y
cinco casos Java LAN. Navegador real verificó editor, filas, mismo raster enviado,
IME solicitado sólo al tocar (texto y número), Otro condicional y entrada por empleado
sin reducir stock ni recibir costos previos. JNI/SQLite/impresora y LAN se simularon
en el host; no se atribuye al hardware el resultado. El testigo del código Windows
se actualizó tras comparar bloques USB idénticos contra HEAD: P sin terminador,
9600 8N1 y lectura antes de solicitud; se aceptan los testigos previos guardados.

Hubo fallos en la preparación de pruebas (rutas preparadas, importación fs,
comandos finales legítimos ESC/POS, espera del acceso y normalización de font).
Se corrigieron las pruebas y se repitieron sólo los casos afectados. La prueba de
acciones detectó además comparación incorrecta de campos heredados, ya corregida.

Verificación del APK: firma, alineación, todas las huellas internas, dependencias
autocontenidas, 28 productos/fotos, cero administrativo, sin usuarios/operaciones
predefinidos ni claves privadas. Arranque, venta y recuperación sólo en host aislado.
No se modificaron instalaciones ni datos reales, ni se hizo commit/push.

**Versión 15 publicada privadamente** el 12/11/2026: 259 bloques cifrados,
135413045 bytes y la huella indicada. La descarga real desde un POS aislado terminó
con la misma huella y tamaño. Se rechazó consulta anónima, se usó una credencial
individual y no cambiaron las operaciones comerciales. No se invocó instalación
nativa en la tablet. Evidencia privada: `.dev/em003-comfort-internet.log` y
`.dev/em003-updates-internet-result.json`. El equipo simulado declara código 14
para comprobar la actualización a 15; no acredita una instalación Android física.
El receptor conserva códigos 14 y 15: 270810601 bytes originales de 300 MiB permitidos.
Una próxima APK requiere revisar retención/capacidad; no borrar versiones en silencio.
Pendiente físico: teclado Android, nuevo ticket/corte, LAN BISOFICE, actualización
nativa y lectura de báscula en esta revisión. No desinstalar para actualizar.

## Lote autorizado: ticket térmico y actualizaciones Android 1.0.13

El propietario autorizó el actualizador remoto y la corrección del ticket, y declaró
una **BISOFICE POS-8330, USB/LAN, 80 mm, con cortador**. Las fotografías mostraron
texto pegado, ancho desaprovechado, falta de logo y salida insuficiente de papel.
La apertura e impresión confirmadas anteriormente corresponden a la entrega 1.0.12;
el formato nuevo aún necesita comprobación física. No se implementó transporte LAN.

La revisión **1.0.13-android-prueba / código 14** conserva applicationId y firma.
APK privada existente y verificada:
`C:/Users/nexar/Downloads/ElMuellePDV-Android-Ticket-Actualizaciones-20261112-249297b1/ElMuellePDV-Android.apk`.
Tamaño: **135397556 bytes**. SHA-256:
`2CF2F1B0EFDE8FAA97C0FA75BB57DBD7F93D8CAE42FE239B1E838C85917AC6B6`.
Huella de fuentes empaquetadas:
`7365F6309B59C2FB4C6202462F95FF7D33C384BFE7F347924A2D1F429AB2B8B7`.

- El ticket se dibuja una vez y se transmite como imagen ESC/POS: logo original
  monocromo, 576 puntos en 80 mm, textos centrados y etiquetas con separación.
  No repite EL MUELLE/Pescadería debajo del logo. El pie solicitado (nombre con
  mayúsculas/minúsculas, dirección y Tel.) está exclusivamente en el archivo privado
  `.dev/em003-ticket-business.json`, que se incorpora al APK, no al repositorio.
  La vista de prueba usa una venta de ejemplo y nunca llama a venta/caja/inventario.
  Se añaden 8 líneas de salida antes del corte. Los perfiles antiguos sin ese campo
  adoptan la impresora confirmada; una selección nueva de 58 mm sigue disponible.
- Configuración permite buscar, descargar y pedir instalación de una APK por HTTPS.
  Se valida cada bloque y la huella final; Android verifica otra vez paquete, versión
  y firma original y solicita confirmación. No es una instalación silenciosa.
  El enlace privado se activa por instalación mediante el mecanismo de Buzón ya
  existente; no hay credenciales compartidas en el APK. La primera APK con esta
  función se instala manualmente sobre la actual, sin desinstalar.
- El Worker existente añade tablas separadas para versiones/bloques cifrados,
  publicación íntegra e inmutable y reanudación de subidas. La APK no es pública.
  No se cambiaron MAILBOX_DATA_KEY ni MAILBOX_ADMIN_TOKEN. Sus copias locales
  antiguas no están en esta PC; no recrearlas ni rotarlas para eludir esa ausencia.
  Se creó ANDROID_RELEASE_TOKEN con acceso limitado a publicación y emisión de
  códigos de activación; no puede leer la bandeja. Su ubicación privada está en
  `.dev/em003-update-publisher-location.json`; nunca subirla ni copiarla al APK.

Pruebas acreditadas: **13 unitarias JS** de impresión/descarga, **5 Java** de política
de actualización, **2** flujos de arranque/recuperación del paquete y navegador real
con igualdad de píxeles vista/envío y sin operaciones comerciales. La interfaz de
descarga/confirmación se simuló; la prueba de internet es independiente. Las pruebas
afectadas del Worker pasaron mediante ejecuciones dirigidas, incluidas autenticación,
cifrado, exclusión de la bandeja e integridad de publicación. Hubo errores transitorios
de conexiones locales y una preparación antigua sin public/pricing; se corrigió la
copia aislada y se repitieron únicamente esos casos. No ocultar esos resultados.

La primera subida remota se interrumpió después de 147 bloques; se añadió consulta
autenticada del progreso y reanudación. Se completaron **259 bloques**, y la versión
14 quedó publicada por HTTPS. Worker final:
`abacdd6e-17c6-4310-8942-8a2feef6d49a`, servicio
`https://elmuellepdv-buzon.nexar-israel.workers.dev`.
**Descarga real aprobada desde las rutas del POS aislado**: activación individual,
búsqueda de versión, descarga íntegra, comprobación de huella y preparación autenticada
de instalación. Solicitudes anónimas rechazadas; 28 productos a cero, sin ventas ni
entradas. El archivo descargado tiene los mismos 135397556 bytes y SHA-256 que la
entrega. No se invocó el instalador Android ni la impresora física en esta prueba.
Evidencia privada: `.dev/em003-updates-published.json`,
`.dev/em003-updates-internet-result.json` y `.dev/em003-updates-internet-test.log`.
En Windows, os.tmpdir eligió TEMP pese a TMPDIR: la descarga de esta prueba quedó
en Temp/apk-updates con nombre aleatorio; se verificó su hash y protegió su ACL.
El helper quedó preparado para usar también TEMP/TMP aislados en ejecuciones futuras;
no se repitió una descarga ya acreditada por ese ajuste del entorno de pruebas.

La copia de entrega incluye `Vista-ticket.png`, `version-manifest.json` y
`verificacion-apk.txt`, con las verificaciones leídas de vuelta. Preparación/publicación
de esta PC: `.dev/em003-build-ticket-update.ps1`,
`.dev/em003-ticket-update-build-context.json`, `.dev/em003-deliver-ticket-update.ps1`
y `.dev/em003-publish-android-update.cjs`. Los helpers de esta entrega fijan versión
14: para una corrección futura incrementar versión Gradle y metadatos coherentemente;
una versión publicada es inmutable, no sustituir su APK ni su huella.
El esquema y receptor reutilizables están en `services/mailbox-worker/`.
El enlace de la tablet debe estar activado en Buzón antes de buscar/descargar;
la credencial limitada de publicación puede emitir códigos mediante
`POST /admin/api/android/enrollments`. No poner esas credenciales dentro de la APK.

**Pendientes físicos:** instalar 1.0.13 como actualización, confirmar el nuevo ticket
en la POS-8330 y la confirmación del instalador nativo para una versión posterior.
La clave Android original, Windows y las instalaciones existentes no se modificaron.
No se hizo commit/push ni se instaló esta revisión en la tablet.

## Resultado comunicado por el propietario tras la entrega 1.0.12

El propietario confirmó: «Ya abrió y ya logramos imprimir». Esto acredita apertura
e impresión física informadas por el propietario después de la entrega corregida;
Codex no leyó la versión instalada ni observó el dispositivo. No se informó el modelo
de impresora, su transporte ni una nueva prueba de báscula. No extender este resultado
a compatibilidad universal, exactitud de impresión o latencia USB no comprobadas.
El propietario consulta si pueden enviarse actualizaciones de la APK remotamente;
esta consulta no acredita que exista un actualizador integrado o un servidor de distribución.

## Fallo real de apertura informado y corrección 1.0.12

El propietario informa que, al abrir después de la entrega 1.0.11, aparece
`MODULE_NOT_FOUND` y luego se cierra. La captura acredita ese código; no muestra
la versión de la app ni el nombre del módulo. Se revisó el artefacto entregado
y su resolución de dependencias. Las pruebas anteriores del host no
acreditan por sí solas que el paquete resuelva módulos sin ayuda del repositorio.
No recomendar desinstalar, borrar datos ni volver a introducir el catálogo.
La entrega 1.0.11 no debe considerarse apta tras este resultado físico.

Reproducción sobre los archivos del APK entregado: `MODULE_NOT_FOUND`, módulo
`iconv-lite`, requerido por `runtime/printer.cjs`. La biblioteca está empaquetada
en `app/node_modules`, pero runtime es su hermano, no su descendiente. En la PC
se resolvía por accidente desde el node_modules del repositorio. Se corrigió su
carga con `createRequire` del contexto de app. El verificador ahora rechaza toda
resolución fuera del bundle y el host inicia el bootstrap empaquetado, no el fuente.
La revisión **1.0.12-android-prueba / código 13** quedó compilada y verificada.
Entrega privada existente en esta PC:
`C:/Users/nexar/Downloads/ElMuellePDV-Android-Arranque-20261112-c1c0d83b/ElMuellePDV-Android.apk`.
Tamaño: **135386480 bytes**. SHA-256 real:
`12173FF08E0B8E91CB1E9764092CF06B9B1D6514434A4BC552BA8720B87B057B`.
Conserva `mx.elmuelle.pdv` y el certificado original
`66347436ba4bb5ec9b991b89f0a068680cdbd6020075e7f7d78e7cf6a16effd5`.
Actualizar sobre la instalación actual, sin desinstalar ni borrar datos.

Comprobaciones nuevas, sin repetir la auditoría ni las regresiones no afectadas:

- **9/9** pruebas dirigidas de impresión y aislamiento de resolución de módulos.
- **2/2** pruebas con el bootstrap empaquetado: arranque y flujos de stock, caja,
  venta, idempotencia, permisos, respaldo cifrado, recuperación y rechazo de catálogo
  alterado. JNI/SQLite fueron sustituidos por dobles del host; no es una prueba física.
- Verificación del APK real: firma original, alineación, hashes, orientación,
  28 productos/fotos, saldo inicial cero administrativo, sin usuarios, claves privadas
  ni operaciones predefinidas. Dependencias comprobadas desde sus propios assets,
  prohibiendo resolver módulos fuera del bundle, incluidas codificaciones de impresora.
- `version-manifest.json` y `verificacion-apk.txt` leídos de vuelta junto a la APK;
  copia final y hash comprobados. Huella de fuentes incluidas en el manifiesto:
  `ECB6272CBF117A6404D6D2A2E1E59486101C6F164E18E7C9B4C61FDA347FB22B`.

La preparación privada anterior ya no existía en su ruta AppData. Se recuperaron
exclusivamente el catálogo inicial y las 28 fotos de la APK 1.0.11 cuyo hash figura
más abajo, verificando sus hashes; no se copiaron bases operativas, usuarios ni claves.
La fuente local actual queda registrada en `.dev/em003-startup-catalog-source.json`;
se suministra a la compilación mediante `MUELLE_ANDROID_CATALOG_SOURCE`, que apunta
a la carpeta `compilacion`. No suponer que esos archivos privados estarán en otra PC.

**Pendiente físico:** báscula y galería/regreso en la nueva revisión; apertura e impresión
ya fueron confirmadas por el propietario en el apartado superior. No se instaló esta
revisión desde Codex ni se modificaron
instalaciones o datos existentes de Windows/Android. La lectura física acreditada
de báscula sigue siendo 1.0.9. No se hizo commit/push de esta corrección.

## Referencia: lote comercial Android 1.0.11 (10 de noviembre)

El propietario autorizó implementar el lote completo tras la prueba del cliente.
Reglas confirmadas: precio particular por cliente/producto, mayoreo por cantidad
acumulada de cada producto y aplicación del menor precio autorizado, sin sumar
ambos descuentos. El umbral y precio se editan en cada producto: **Mayoreo desde**.

Implementado en las fuentes locales y la APK:

- Clientes y precios particulares en Productos; selector de cliente en Venta actual.
  El servidor resuelve precios, valida la cotización y conserva la operación idempotente.
- Caducidad y código por lote recibido; avisos próximos/caducados, salida por fecha
  más próxima y bloqueo de venta del stock caducado. Cancelar restaura sus lotes.
  Los saldos previos sin fecha se identifican como apertura administrativa; no se
  inventan conteos físicos ni fechas de caducidad.
- Costo al proveedor / Precio al público, ganancia estimada por unidad en alta/edición
  y panel administrativo de ganancia realizada por producto y periodo.
- Gastos del negocio separados de compras de inventario y retiros del propietario;
  el resultado después de gastos sólo descuenta gastos expresamente registrados.
- Administrador sin vencimiento automático por defecto; opción 30/60/120 minutos.
  Se corrige renovación de cookie y cierre de sesión ante 401. Se conservan los
  permisos y vencimiento de empleados. Borradores comerciales cifrados por usuario,
  sin PIN ni foto provisional; una foto no guardada debe seleccionarse otra vez.
- Selector Android con lectura de URI validada en caché privada y regreso al POS;
  conserva la elección de hasta dos capturas opcionales del buzón, con sus límites.
- Peso reconocido visible aunque cambie; `displayKg` nunca autoriza venta. `kg`,
  estabilidad, vigencia y autorización nativa continúan validándose por separado.
  La secuencia USB Windows permanece idéntica: P sin terminador, 800/200 ms.
- Perfil ESC/POS 58/80 mm, columnas, codificación/acentos y cortador optativo;
  prueba sin venta, trabajos de impresión con identidad y resultados inciertos
  sin reenvío automático. USB/Bluetooth Classic con plazos limitados.

Entrega privada verificada en Descargas de esta PC:
`ElMuellePDV-Android-Clientes-Mayoreo-20261110-bc5b2f0b/ElMuellePDV-Android.apk`.
Tamaño: **135386372 bytes**. Versión **1.0.11-android-prueba**, código **12**.
SHA-256:
`E92B94045839029D885CB5CDF37DF772FF26CBE57A9AC72284542FFF91E97A5D`.
Mismo `mx.elmuelle.pdv` y certificado
`66347436ba4bb5ec9b991b89f0a068680cdbd6020075e7f7d78e7cf6a16effd5`.
Actualizar sin desinstalar. No se instaló en equipos ni se alteraron instalaciones
Windows. El paquete conserva 28 productos/fotos originales, saldo inicial cero
administrativo, sin usuarios, PIN, claves privadas ni operaciones predefinidas.
Una base existente se conserva; no se vuelve a importar el catálogo de arranque.

Evidencia de esta ejecución:

- **48 resultados TAP** afectados: comercio, permisos, rutas nativas, impresión,
  peso visible y contrato serial Windows; todos aprobados.
- **59 Java** de báscula/latencia y geometría, todos aprobados. La compilación final
  release también terminó correctamente después del ajuste de selección múltiple.
- **5 pruebas de fotos Windows** con decodificación real JPEG/PNG/WebP, rechazo de
  MIME falso, límites y PNG truncado; aprobadas. Se corrigió el relanzamiento de Edge
  que dejaba vacía su salida y la limpieza bloqueada de su perfil auxiliar.
- **6 flujos de navegador** aprobados: cliente/precio, foto/mayoreo/margen, borrador
  tras recarga, cantidades/precios, panel de ganancia y sesión configurable.
  Se usó el adaptador fotográfico Android real con JNI sustituido por un decodificador
  real de píxeles del host; esto no certifica la galería de una tablet física.
- **4 pruebas del paquete Android**: inicialización aislada, stock, caja, venta,
  idempotencia, permisos, respaldo cifrado y restauración con 28 fotos, contraseña
  errónea, cancelación y controles USB. SQLite/JNI fueron dobles del host.
- Firma original, alineación, horizontal, manifiesto, hashes del bundle y archivo
  final comprobados; `version-manifest.json` y `verificacion-apk.txt` junto a la APK.

Pendiente físico trasladado a la revisión corregida 1.0.12: BAR-9, galería/regreso e impresora real
(modelo no informado). La lectura física acreditada sigue siendo la de 1.0.9;
no afirmar latencia física ni compatibilidad universal con esta revisión.
No repetir auditorías ni capturas manuales de 20 s; ante un fallo usar el diagnóstico
automático del mismo intento y confirmar versión/huella. Los registros de prueba y
preparación permanecen privados en `.dev/`. No se hizo commit/push de este lote.

Base Git al iniciar: `5f5dbd272b238598063662357b3fc77d3b80475d`.
Huella de fuentes empaquetadas locales:
`9790ABD37C87816E85B38CE139639148E20BE8239014678496808EAFCA4C4EE6`.
No confundir HEAD con la revisión local nueva ni suponer que otra PC tenga la APK,
catálogo privado, claves de firma o estos cambios sin sincronizarlos.

## Resultado nuevo: lectura física y demora (6 de noviembre)

El propietario confirmó que la APK 1.0.9 **ya lee la báscula real**. El video
aportado muestra peso positivo aplicado en el panel de pesaje. No muestra una
comparación simultánea con el indicador físico: no se certificó exactitud ni
todos los ciclos de reconexión. El pendiente actual es reducir el retraso de
varios segundos que informa el propietario, conservando la estabilidad y vigencia.

Entregada: revisión 1.0.10, código 11. Conserva la detección inicial a 800 ms
y, después de reconocer respuestas de peso, consulta a 200 ms con una sola
solicitud pendiente y plazo de respuesta de 800 ms. Conserva tres muestras iguales
cuando no hay indicador ST/US. El panel activo de pesaje se consulta cada 150 ms
y no se repinta por valores idénticos. No se modifica Windows ni el comando P.
La mejora de latencia en hardware queda pendiente de probar con la nueva APK.

Entrega privada en Descargas de la PC de preparación:
`ElMuellePDV-Android-BAR9-Rapida-20261106-4116a048/ElMuellePDV-Android.apk`.
Tamaño: `135365728` bytes. SHA-256 verificado:
`C027682EC871CF3B7847AE17DEF39C0CCBB9FB6CAD808C4CA743524650579F90`.
Se conserva applicationId y certificado de firma; instalar como actualización,
sin desinstalar. Se verificaron 28 productos y 28 fotografías originales.

Pruebas de esta mejora: **49 Java** (18 ScaleAutoSessionTest y las 31 anteriores)
y **10 Node** de interfaz y referencia Windows. La simulación de tres respuestas
completas a 25 ms de cada solicitud valida estabilidad a los 425 ms; no es una
medición de latencia física. Se probaron respuestas lentas/fragmentadas sin
solicitudes acumuladas, pesos cambiantes/inestables, vencimiento, cambio de modo,
refresco a 150 ms y ausencia de repintados por valores idénticos. Las pruebas de
permisos de rutas nativas se reutilizan: ese código no cambió y coincide con la APK base.

El resto de esta nota conserva la referencia y evidencia de entrega de 1.0.9;
la anterior marca de prueba física pendiente queda sustituida por este resultado.

Referencia de código de la APK base 1.0.9: `4470f6a431ceac2e04afea31fa334616f154d30a`.
La entrega vigente y el pendiente de prueba de 1.0.10 están en la actualización superior.

## Actividad inmediata

El propietario ya acreditó lectura con 1.0.9 y ahora probará la velocidad de 1.0.10
con la báscula física. La nueva sesión debe acompañar esa prueba y, si falla, continuar
desde la evidencia nueva sin reiniciar el diagnóstico ni repetir intentos antiguos.

**Estado pendiente:** mejora de latencia física de 1.0.10. La lectura de 1.0.9 ya
fue confirmada por el propietario; no repetir el diagnóstico de ausencia total de RX.

## APK base 1.0.9 que ya leyó la báscula

| Dato | Valor verificado |
| --- | --- |
| Versión | `1.0.9-android-prueba` |
| versionCode | `10` |
| applicationId | `mx.elmuelle.pdv` |
| Archivo | `ElMuellePDV-Android.apk` |
| Tamaño | `135365292` bytes |
| SHA-256 | `030D16B0B9B634974A29DAB9D2F759FF96F1F46D44D94B34F54B0F54FCC35503` |
| Certificado de firma SHA-256 | `66347436ba4bb5ec9b991b89f0a068680cdbd6020075e7f7d78e7cf6a16effd5` |
| Actualización | Misma firma de las APK anteriores; instalar sobre la existente, sin desinstalar |

En la PC de preparación está bajo Descargas, en la carpeta
`ElMuellePDV-Android-BAR9-Auto-20261105-860c1b12`.
Esa ubicación **no implica** que el archivo exista en la nueva computadora.
El propietario debe llevar esa APK por una vía privada y verificar su huella allí.
La APK no se publicó en GitHub: contiene el catálogo y las fotografías del cliente.

El paquete fue verificado con 28 productos y 28 fotografías originales, saldo
administrativo inicial cero, sin usuarios ni operaciones históricas predefinidas.
La actualización debe preservar la base existente, sus usuarios y sus claves.

## Equipo y evidencia que ya existen

- El propietario identificó físicamente la báscula como **RHINO BAR-9**.
- USB observado: CH340/CH341, VID `6790 / 0x1A86`, PID `29987 / 0x7523`.
  Ese chip por sí solo no identifica el modelo de una báscula cualquiera.
- Según los videos y JSON informados por el propietario, Android otorgó permiso,
  abrió el puerto a 9600 8N1 y, en **Sólo escuchar**, recibió `NO_DATA`, cero bytes.
- El propietario informó que su implementación Windows original sí leyó el peso
  de esta báscula. Se inspeccionó y ejecutó su secuencia JS con un puerto simulado:
  abre 9600 8N1 sin flujo, inicia el lector y después escribe `P` (`0x50`), sin
  CR/LF; repite cada 800 ms. No se solicitó ni leyó configuración comercial privada.
- La documentación de conexión Rhino consultada confirma CH340 y 9600 8N1,
  sin flujo, para BAR-9. La documentación pública encontrada sobre `P` correspondía
  a BAR-8RS; no se presentó como confirmación del manual BAR-9.
  La autorización posterior del propietario fue **reproducir el código Windows
  aprobado y que había funcionado**, verificado antes de habilitar la transmisión.
- El catálogo Rhino identifica CAUS-1 como cable de comunicación USB tipo A de
  2 metros. No se acreditó que el cable instalado sea ese modelo ni su pinout.
- La tablet estuvo conectada únicamente a la báscula por OTG y después se
  desconectó. No hay una conexión de depuración acreditada hacia esta PC.
  Un teléfono Honor usado antes tenía bloqueada la depuración USB.
  No suponer que ADB estará disponible ni pedir el mismo acceso reiteradamente.

## Intentos anteriores y cambio de enfoque

| Intento o hallazgo | Resultado y consecuencia |
| --- | --- |
| Perfil RHINO supuesto / formato no reconocido | El código confundía puerto abierto con lectura inválida y error de conexión. Se separaron los estados en 1.0.8. |
| Conexión nativa CH340 | El controlador incluido reconoce `1A86:7523`; permiso y apertura fueron acreditados por el propietario. No volver a diagnosticar un controlador ausente sólo porque haya cero bytes. |
| Sólo escuchar en 1.0.8 | `NO_DATA`, cero bytes, según evidencia del propietario. Repetir capturas pasivas de 20 s no resolvería la ausencia de una solicitud. |
| Búsqueda del comando en manuales | No se extrapoló el manual BAR-8RS como prueba del BAR-9. La evidencia nueva fue el código Windows aprobado y el funcionamiento físico informado por el propietario. |
| 1.0.9: lectura + P automática | Lectura real confirmada por el propietario y visible en el video; presentó retraso. |
| 1.0.10: consultas adaptativas y refresco de pesaje | Entregada, con 49 pruebas Java y 10 Node aprobadas; velocidad en tablet pendiente. |

La diferencia de software corregida es que Android estaba escuchando de forma
pasiva mientras Windows solicitaba el peso. No afirmar que eso prueba por sí solo
la causa de cualquier fallo físico posterior de cable, alimentación o equipo.

## Qué implementa la 1.0.9

1. Descubre el transporte aprobado y pide el permiso USB de Android.
2. Inicia el lector nativo antes de la primera solicitud inmediata `P`.
3. Mantiene 9600, 8 bits, sin paridad, 1 parada, sin flujo; solicita cada 800 ms.
4. Si no recibe bytes, prueba un máximo de seis configuraciones de transporte:
   valores predeterminados del controlador; DTR/RTS apagados; ambos encendidos;
   sólo DTR; sólo RTS; ambos encendidos con un tiempo de lectura de 250 ms.
   Las otras variantes usan 1000 ms. Son aperturas acotadas de unos 4 s por intento,
   además del tiempo que tarde el controlador. No cambia baudios, tara ni calibración.
5. Cuando recibe bytes, deja de variar señales para intentar arreglar un formato.
   Espera una trama reconocida y un peso estable, con un plazo de detección acotado.
6. Reconoce tramas completas ST/US o peso con unidad explícita kg/g/lb, incluyendo
   fragmentación y STX/ETX compatibles. Para peso sin indicador de estabilidad exige
   tres tramas iguales consecutivas de la misma unidad. No interpreta números
   desnudos, columnas de precio ni texto desconocido como peso.
7. Convierte unidades explícitas a kg, rechaza pesos negativos, fuera del límite
   configurado BAR-9 de 40 kg, inestables o vencidos. Vigencia: 1500 ms.
8. Guarda en preferencias privadas la configuración validada para reconectar.
9. Si agota la detección, detiene la búsqueda y guarda un único informe técnico
   automático, limitado y privado. No se envía a internet; los contenidos desconocidos
   se ocultan para no registrar información ajena al peso.
10. Mantiene la autorización administrativa de peso manual y el bloqueo de venta
    cuando no hay lectura nativa válida, estable, positiva y reciente.

## Si falla la prueba que está por realizarse

Primero confirmar la versión y huella efectivamente probadas contra la entrega
vigente superior (actualmente **1.0.11 / código 12**),
y consultar **el diagnóstico automático de ese mismo intento**. No empezar por
recompilar, desinstalar, cambiar protocolos a ciegas o repetir capturas de 20 s.

El informe está dentro de la app en `usb-diagnostics/last-failure.json` del
almacenamiento privado. No suponer que el sistema de archivos de Android sea
accesible desde Windows. Desde el administrador de la app puede abrirse
**Dispositivos y respaldos → Diagnóstico técnico USB → Guardar diagnóstico técnico JSON**.
También se puede acceder al menú nativo desde **Configurar USB**.
Si la nueva sesión no dispone de ese informe, pedir una sola exportación del ya
generado; no iniciar nuevas capturas. No publicar JSON reales en este repositorio.

Campos útiles: `failureCode`, `failureOperation`, `autoPhase`, `events`,
`transmittedRequests`, `transmittedBytes`, `receivedBytes`, `receivedChunks`,
`completedFrames`, `frames`, `profile`, `exceptionClass`, `diagnosticWriteError` y
`lastAutomaticFailure`. El último fallo guardado puede pertenecer a un intento
anterior: contrastar versión, contadores y eventos con el intento que se analiza.

| Resultado | Siguiente investigación dirigida |
| --- | --- |
| Permiso denegado o pendiente | Resolver el permiso normal de Android; no atribuirlo al formato ni enviar comandos sin permiso. |
| `USB_OPEN_FAILED`, `SERIAL_CONFIG_FAILED`, `CONTROL_LINES_FAILED`, `USB_READ_FAILED` o `USB_WRITE_FAILED` | Identificar etapa y clase de excepción en los eventos. Comprobar el ciclo y la reconexión de ese enlace; no reabrir otros módulos. |
| `NO_DATA_AFTER_WINDOWS_P` con TX cero | Revisar si se llegó a iniciar lector/transmisión. No afirmar que P se envió sólo porque aparezca configurado. |
| `NO_DATA_AFTER_WINDOWS_P` con TX `50` y RX cero | La solicitud salió según el controlador, pero no hubo respuesta. Revisar cable/enlace y la secuencia concreta; no es un error del parser. No repetir el barrido idéntico sin evidencia nueva ni enviar otros comandos. |
| RX positivo, `FORMAT_UNKNOWN` o `INCOMPLETE_FRAME` | Revisar tramas, delimitadores y formato real. Añadir un formato sólo con evidencia suficiente de peso, unidad y estabilidad; no extraer cualquier número. |
| `UNSTABLE_WEIGHT` o `WAITING_STABILITY` | El equipo envía datos, pero no se acreditó estabilidad. Mantener bloqueo y contrastar con el indicador físico de la báscula. |
| `WEIGHT_OR_UNIT_RANGE` | Revisar la unidad explícita y el límite; no eliminar validaciones para aceptar la lectura. |
| `STALE_WEIGHT` | Analizar continuidad de RX y solicitudes. Separadores vacíos no renuevan la edad del peso. |
| Peso disponible y coincidente con la báscula real | Registrar que la prueba física pasó, incluyendo versión y comportamiento de desconexión/reconexión observado. No inventar comprobaciones no realizadas. |

Una lectura real de cero puede validar la conexión/perfil, pero no autoriza una
venta de peso cero. Durante la comprobación no registrar ventas, inventario,
cortes ni movimientos ficticios en la base definitiva.

## Código y pruebas ya acreditados

| Área | Archivos principales |
| --- | --- |
| Autoconfiguración y USB nativo | `android/app/src/main/java/mx/elmuelle/pdv/Bar9AutoHost.java`, `ScaleAutoSession.java`, `UsbScaleHost.java` |
| Tramas, comandos y trazas | `ScaleDecoder.java`, `ScaleSerialPolicy.java`, `ScaleTrace.java` del mismo directorio |
| Diálogo y puente nativo | `MainActivity.java`, `NativeRuntime.java` del mismo directorio |
| Estados y bloqueo de venta | `android/web/scale.js`, `android/runtime/routes.cjs` |
| Adaptación del código Windows al paquete Android | `android/prepare-assets.cjs` |

- **45 pruebas Java aprobadas:** ScaleDecoderTest 12, ScaleUsbRegressionTest 12,
  ScaleSerialPolicyTest 4, ScaleTraceTest 3 y ScaleAutoSessionTest 14.
- **6 pruebas Node aprobadas:** referencia Windows e interfaz de estados de báscula.
- **8 resultados TAP aprobados** en rutas nativas, incluyendo el contenedor de
  pruebas: permisos, diagnósticos administrativos, pesos inválidos/vencidos,
  vinculación de autorizaciones, impresión y respaldos.
- Compilación release, firma original, alineación, manifiesto, contenido y SHA-256
  fueron verificados. Los recursos del bundle ajenos al cambio USB se compararon
  con la APK anterior; no hubo cambios ajenos a app.js, index.html y su manifiesto.
- Las fuentes Windows se comprobaron intactas respecto de la referencia aprobada.
- En la sincronización posterior también pasaron 12 pruebas aisladas del buzón.
  Esto no equivale a repetir una comprobación física de periféricos o de internet.

Los logs completos y las herramientas locales de esas ejecuciones están en `.dev/`
de la PC de preparación y **no están en GitHub**. En otra PC estos resultados son
evidencia previa documentada, no pruebas que la nueva sesión haya ejecutado allí.
Ejecutar sólo las regresiones afectadas si se modifica el código.

## Límites y recursos para corregir en otra PC

Mantener Glass Atelier, icono original, transiciones, KPI, carruseles, permisos y
demás funciones aprobadas. No hacer otra auditoría general ni tocar Windows.
No afirmar compatibilidad universal con básculas ni impresoras físicas.

Para compilar una nueva APK se requieren herramientas, runtime y catálogo privado
de preparación, además de la firma original. Consultar `android/README.md`.
Esos recursos no viajan por clonar GitHub. La contraseña DPAPI de la PC original
no se descifra automáticamente en otra computadora. No crear una firma nueva
como sustitución silenciosa ni recomendar desinstalar para que entre una APK así.

Si hacen falta archivos privados para compilar, conservar el trabajo de código y
gestionar su transferencia segura; no pedir contraseñas por chat, subir secretos
ni declarar una APK compilada o firmada que no exista y no haya sido verificada.

## Mensaje para iniciar la nueva sesión

> Lee AGENTS.md, CONTINUIDAD_EM003.md y android/README.md. Continuamos EM-003.
> Voy a probar la velocidad de la APK 1.0.10 (versionCode 11) con RHINO BAR-9 por OTG.
> La 1.0.9 ya leyó la báscula real, pero con demora. Si falla, utiliza el único
> diagnóstico automático del intento y el historial documentado para corregir
> únicamente la báscula. No repitas capturas de 20 segundos ni auditorías generales.

Actualizar este archivo cuando llegue el resultado físico, conservando la
distinción entre hechos, hipótesis y pendientes. Esta nota no reproduce el
historial completo ni el texto formal de EM-012; conserva las restricciones
operativas explícitas del propietario para esta tarea.
