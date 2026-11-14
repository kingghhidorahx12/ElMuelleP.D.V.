# El Muelle PDV Android

Fuentes locales de la revisión `1.0.22-android-prueba` (versionCode 23), aplicación `mx.elmuelle.pdv`.
La aplicación Android funciona de forma autónoma; Windows conserva su implementación independiente.

## Equipos sin formularios para todas las sesiones: 1.0.22

- Botón Equipos en la barra: abre búsqueda de USB/Bluetooth emparejado/LAN, lista
  candidatos y conserva la selección. Reconectar guardados no pide IP ni baudios.
- La fachada de estado/búsqueda/selección/reconexión exige sesión activa y pasa
  sólo op/id al nativo. Formatos, perfiles técnicos, diagnósticos, preferencias
  globales, respaldos y actualizaciones conservan sus autorizaciones anteriores.
- Si la IP LAN no responde, búsqueda sin payload, acotada a /24 privado y cada dos
  minutos como máximo por red/perfil. Candidatos nuevos siempre requieren elección;
  no se identifica una impresora sólo por tener abierto 9100.
- El diálogo muestra puerta de enlace y guía de reserva DHCP por MAC. No cambia
  unilateralmente el router ni envía comandos de red/USB desconocidos.
- Pruebas del contenedor y permisos son aisladas/con nativos simulados. No confundir
  esto con reconexión física acreditada. Ver el cierre de entrega en continuidad.
- APK firmada/verificada, publicada y descargada íntegra desde bundle original
  1.0.21 en host aislado, sin Buzón/códigos y con hash idéntico. Servidor sólo código
  23; anterior archivada localmente. Instalación/reconexión física y reserva en el
  router todavía pendientes del propietario. No se cambió el router desde la app.

## Corrección dirigida de checks de permisos: 1.0.21

El propietario aclaró con captura que se refería a Usuarios y PIN → Permisos,
no al acomodo de impresora/periféricos/actualizaciones que se modificó en 1.0.20.
Esos tres scripts y sus ubicaciones se restauran desde el bundle original 1.0.19;
se retira el adaptador settings-layout y sus reglas. Se conserva el actualizador
sin códigos, la marca, equipos, permisos y firma originales.

El cambio nuevo es sólo CSS Android acotado a `#permissionModules`: checks de
18 × 18 px junto al texto, filas táctiles de 40 px y tarjetas sin estirar contenido.
`test-permission-layout-browser.cjs` verifica 1366×768, 1280×800 y 1024×600 en el
contenedor Android, límites de texto, toque de etiqueta, teclado, guardado/recarga,
estado parcial/bloqueado y reversión del resto de paneles. No son pruebas físicas.
APK firmada/verificada, publicada y descargada íntegra desde el bundle original
1.0.20 en host aislado, sin Buzón/códigos y con hash de entrega coincidente. Servidor
sólo código 22; anterior archivada localmente. Instalación física pendiente.
Ver continuidad para APK y límites; no confundir el host con la tablet.

## Actualizar sin códigos: 1.0.19

La 1.0.18 alcanzó a publicarse, pero falló su descarga real por límites de recursos
del Worker con bloques de 512 KiB. No recomendarla. La 1.0.19 usa bloques de 128 KiB,
cinco intentos acotados y ritmo máximo de descarga para respetar cuotas. Cliente y
servidor aceptan 128/512 KiB para compatibilidad, pero publicar nuevas APK con 128 KiB.
La cancelación del permiso de instalación limpia la intención pendiente al volver,
evitando que se abra el instalador en una visita posterior no solicitada.
La 1.0.19 quedó publicada y se descargó íntegra desde un POS aislado con Buzón
desactivado y la misma huella de entrega; después se usó su bundle original para
comprobar la descarga íntegra de 1.0.20. Las APK anteriores se conservan localmente.
Ver el cierre actual en la continuidad para la versión del servidor. No se instaló
en la tablet desde Codex.

- Actualizaciones ya no depende de Buzón, su activación ni el PIN. La APK privada
  lleva un permiso automático de sólo lectura de versiones/bloques. No contiene
  claves administrativas, de publicación, de firma ni de cifrado del servidor.
  Buzón conserva su activación individual y consentimiento para enviar reportes.
- Un botón busca, descarga, verifica y solicita el instalador. Bloquea con venta
  pendiente, vuelve a comprobar al terminar la descarga y no abre el instalador tras
  cerrar sesión. No hay diálogos propios redundantes antes de la confirmación Android.
  Si Android exige autorizar esta fuente, se abre su ajuste y se retoma al volver.
- Las APK anteriores sin Buzón activo rechazan la búsqueda antes de contactar al
  servidor. Necesitan esta instalación de transición una vez, sobre la existente,
  sin desinstalar. Después no se necesitan códigos para actualizar.
- El permiso de descarga se conserva privadamente en
  `.dev/em003-android-update-channel/channel.json`, con `endpoint` y `downloadToken`.
  Preparación exige ese archivo (o MUELLE_ANDROID_UPDATE_CHANNEL_SOURCE) y lo copia
  al bundle generado ignorado por Git. Transferirlo privadamente al cambiar de PC;
  no recrearlo/rotarlo sin considerar las APK existentes. No es una protección DRM:
  quien recibe la APK privada puede extraer ese permiso, que sólo autoriza descargas.
- El servidor usa ANDROID_UPDATE_READ_TOKEN para ese alcance, separado de
  ANDROID_RELEASE_TOKEN y de las claves originales de Buzón. Rechaza descargas
  anónimas y el permiso de lectura no autoriza informes, administración ni publicación.
- El propietario pidió conservar sólo la última versión en el servidor. Las retiradas
  requieren copia local verificada, confirmación de hash/versión y una versión nueva
  publicada. El procedimiento mantiene la anterior hasta verificar la descarga real
  de la nueva; no borra datos comerciales ni cambia instalaciones.
- Firma original, SHA-256 de cada bloque/archivo, applicationId y versión superior
  siguen comprobándose. Ver huella, publicación y prueba real en la continuidad.

## Periféricos de la 1.0.17

- El propietario acotó los equipos actuales a impresora y báscula. Configuración
  incorpora inventario USB/Bluetooth emparejado, búsqueda LAN acotada y selección
  inicial sin escribir la IP. Los candidatos no se consideran modelos verificados.
- Impresora USB recordada: reconexión al cambiar deviceId, número de serie cuando
  Android lo permite, selección explícita ante duplicados y permiso sin bucle de
  diálogos. La conexión se abre al imprimir; no hay impresión automática de prueba.
- LAN recordada: sondeo TCP sin payload en segundo plano cada 30 s como máximo,
  con la app en primer plano y dentro de su subred actual. Búsqueda de nuevas IP
  sólo al solicitarla, máximo /24, ocho trabajadores, conexión 350 ms y plazo 15 s.
  Se excluyen VPN/celular/internet, self/gateway/broadcast y candidatos vencidos o
  de otra red. Se requiere confirmar nuevos candidatos; conservar reserva DHCP.
- Bluetooth sigue usando el emparejamiento de Android y la MAC guardada al imprimir.
  Sólo se pide BLUETOOTH_CONNECT, no acceso a ubicación ni escaneo de no emparejados.
- La báscula conserva su autoconfiguración aprobada; protocolos, comandos y
  validación del peso no cambian. No se configuran otros dispositivos USB a ciegas.
- Preparación de impresora desactivable. El panel sólo consulta mientras es visible
  en Configuración; salir al POS o cerrar sesión detiene su sondeo y limpia nombres.
  Detección/selección/automatización son administrativas también en el servidor.
- `build-private.ps1 -PeripheralTests` ejecuta las políticas de selección/red y
  transporte LAN. `test-peripherals-browser.cjs` verifica UI con nativos simulados;
  no acredita conexiones físicas. Ver entrega y resultados en la continuidad.

## Marca circular de la 1.0.16

- El recurso original tenía un aro de 955 × 989 píxeles. La preparación Android
  normaliza esa geometría a un círculo, con transparencia y margen seguro para
  el icono y el splash, sin redibujar el puente ni modificar los PNG originales.
- La pantalla nativa de arranque ajusta el recurso proporcionalmente, sin estirarlo.
- El subtítulo del lateral ahora dice Pescadería. Se conservan el catálogo y el diseño.
- `./android/test-brand-assets.ps1` verifica 360 ángulos por recurso, área segura,
  centrado, 25 casos de ajuste y rechazo de geometría inválida. No sustituye la
  observación del launcher/splash de la tablet física.
- Guía de red y protección de datos: `docs/RED_Y_RESPALDOS_ANDROID.md`.
  La entrega, huellas y pendientes se registran en `CONTINUIDAD_EM003.md`.

## Corrección LAN y fluidez de la 1.0.15

- El video del propietario muestra que LAN se seleccionaba y después volvía a
  USB/Bluetooth. La actualización de sesión recargaba el perfil nativo guardado.
  El formulario conserva ahora conexión, IP y formato mientras se editan, ignora
  respuestas de una sesión anterior y limpia la conexión al cerrar sesión.
- Abrir/cerrar los paneles ya no vuelve a anunciar una sesión idéntica. Se evitan
  recargas de datos comerciales, impresora y actualizador durante esos gestos.
- Las animaciones actúan sobre sidebar/ticket; no sobre todo el catálogo. El cierre
  anima el mismo panel, sin duplicar la venta. Los cambios rápidos cancelan la
  transición anterior y se conserva la preferencia de movimiento reducido.
- Cinco pruebas de animación y los flujos aislados de navegador aprobaron selección
  LAN, formato pendiente, cierre de sesión, permisos, teclado y ticket. En 16
  alternancias se observaron cero eventos de sesión, API adicional y clones.
  Las mediciones se hicieron en PC; no acreditan FPS ni impresión LAN de la tablet.
- La entrega y su huella se registran en `CONTINUIDAD_EM003.md`. No se cambió USB,
  la firma original, applicationId, instalaciones ni datos reales.

## Comodidad, permisos y ticket de la 1.0.14

- El teclado táctil se solicita sólo al tocar un campo editable. El foco programático
  conserva navegación y lectores de códigos sin pedir el teclado. Se verificaron
  texto y número en navegador con puente nativo simulado; falta comprobar el IME físico.
- Inventario usa motivos habituales y Otro con explicación obligatoria. No cambia
  los motivos históricos. Los mínimos pueden cambiar sin inventar movimientos.
- Permisos conserva el acceso general y añade acciones por empleado, con validación
  en el servidor: recibir, aumentar, reducir, merma, conteo, precios y otras operaciones.
  Recibir no concede disminuir existencias. Costos previos y márgenes siguen privados.
- El administrador dispone de un editor del ticket con imagen, textos, alineación,
  tamaño, negritas, separación y recuperación del diseño anterior. La vista y el papel
  comparten los mismos píxeles. Productos usa una fila con precio de venta unitario,
  cantidad e importe; nunca el costo al proveedor. Imprimir un ejemplo no registra venta.
- LAN ESC/POS es opcional junto a USB/Bluetooth: IP privada, puerto configurable,
  prueba TCP sin impresión y envío con plazo máximo. Tablet e impresora deben estar
  en la misma red. No se abren puertos hacia internet. Cinco pruebas Java aprobaron
  política de red, bytes, sondeo vacío y errores; no acreditan la BISOFICE física por LAN.
- La base inicial mantiene 28 productos, 28 fotografías y cero administrativo,
  sin usuarios ni operaciones. La actualización conserva applicationId y firma original.
  No se modifican instalaciones Windows ni se desinstala Android.
- La versión 15 está publicada privadamente y se descargó íntegra por internet
  desde un POS aislado, con la misma huella del archivo de entrega. No se instaló
  en la tablet. Ver CONTINUIDAD_EM003.md para APK, huella y evidencias.

## Lote comercial vigente

La 1.0.11 incorpora precios por cliente y mayoreo configurable por producto,
caducidades por lote, desglose de ganancia/gastos, sesión administrativa y borradores,
selector fotográfico nativo y perfiles de impresión. El peso en movimiento se muestra
sin convertirlo en cantidad autorizada: la venta exige captura estable, válida y reciente.
Ver `CONTINUIDAD_EM003.md` para la APK privada, huella, pruebas y límites físicos.
Instalar como actualización con la firma original, sin desinstalar ni reemplazar datos.
La 1.0.12 corrige el arranque `MODULE_NOT_FOUND` de la 1.0.11: impresión carga
`iconv-lite` desde las dependencias empaquetadas de app. Preparación y verificación
rechazan dependencias prestadas por el repositorio de la PC. El arranque aislado
pasó; tras la entrega, el propietario confirmó apertura e impresión física. Después
identificó una BISOFICE POS-8330 de 80 mm, USB/LAN y con cortador. La nueva lectura
física de báscula sigue pendiente.

## Ticket y actualizaciones de la 1.0.13

Referencia histórica: la activación de Buzón descrita abajo sólo aplica al actualizador
antiguo. Desde 1.0.18 la descarga se autoriza automáticamente y por separado.

- Vista y papel comparten la misma imagen monocroma del ticket, con logo original,
  centrado, ancho 80 mm/576 puntos, separación de etiquetas y salida antes del corte.
  La prueba representa una venta de ejemplo sin registrarla. También admite 58 mm.
- El pie comercial del cliente está en `.dev/em003-ticket-business.json`, privado;
  la compilación lo exige y lo incluye sólo en el APK. No subirlo al repositorio.
- El actualizador usa el enlace privado por instalación del Buzón. Busca versiones,
  descarga bloques por HTTPS y verifica hashes; el instalador nativo comprueba firma,
  applicationId y versión. La confirmación y el permiso de instalación corresponden
  al usuario en Android. No modifica Windows ni sincroniza bases entre equipos.
- El receptor Cloudflare ya existente añade `android-releases.mjs` y su esquema SQL.
  La publicación requiere una credencial propia ANDROID_RELEASE_TOKEN, fuera del
  código y del APK. No reemplazar las claves originales del buzón ni de firma.
- Ver la continuidad para evidencia de publicación/descarga real y pendientes físicos.
  Una prueba del host o de interfaz simulada no acredita instalación física Android.
  La versión 14 se publicó privadamente y se descargó íntegra desde un POS aislado
  por internet, con la misma huella del archivo de entrega. Sigue pendiente comprobar
  el nuevo formato de papel y la instalación nativa en el dispositivo del propietario.
- Las instalaciones deben activar su enlace privado en Buzón. La primera actualización
  que incorpora este sistema requiere instalar la APK manualmente sobre la existente.
  Las siguientes pueden buscarse y descargarse en Configuración, con confirmación
  Android. Publicar siempre una versión mayor con la misma firma; no sustituir una
  versión publicada. La cuota gratuita del receptor reserva hasta 300 MiB de APK
  originales; al agotarla se requiere revisar versiones, no se borra ninguna en silencio.

## Continuar desde otra computadora

1. Clonar este repositorio e instalar las dependencias de la raíz con `npm ci`.
2. Trabajar sobre `android/app/src/main/`, `android/runtime/` y `android/web/`.
3. Para compilar, preparar localmente las herramientas y los archivos privados descritos abajo.
   Clonar el repositorio no recupera datos operativos ni la clave de firma.

La referencia Windows de la báscula se verifica contra `public/app.js`, con finales LF
preservados mediante `.gitattributes`. No actualizar su huella para ocultar diferencias funcionales.

## Herramientas de compilación actuales

- JDK 21, Gradle 8.13 y Android Gradle Plugin 8.13.2.
- Android SDK 36; build-tools 35.0.0; NDK 27.2.12479018; CMake 3.22.1.
- Runtime nativo `fogtape/nodejs-mobile` 24.22.1-0, con sus cabeceras y bibliotecas
  para arm64-v8a, armeabi-v7a y x86_64.
- Los scripts actuales localizan herramientas bajo `.dev/android-tools/` y el SDK
  mediante `android/local.properties`. Ambos son locales y quedan fuera de Git.
- `android/build-private.ps1 -ScaleTests` prepara los recursos, compila la APK
  release y ejecuta las pruebas Java afectadas de báscula.
- `android/verify-package.ps1 -Apk RUTA_APK` verifica firma, alineación, catálogo,
  fotografías, exclusión de claves, dependencias autocontenidas y SHA-256 del archivo.
- `android/tools/check-apk-dependencies.ps1 -Apk RUTA_APK` carga los módulos del APK
  extraídos en una carpeta privada, sin catálogo ni fotos y sin acceso a dependencias
  externas al bundle. El host también inicia el bootstrap empaquetado con ese límite.

## Archivos privados que no están en GitHub

- Catálogo preparado del cliente y fotografías originales de la entrega.
  `prepare-assets.cjs` resuelve su ubicación mediante `.dev/em003-final-delivery.json`,
  propiedad `privatePreparation`, y su subcarpeta `compilacion`.
  Si esa preparación ya no está disponible, admite `MUELLE_ANDROID_CATALOG_SOURCE`
  apuntando a una carpeta `compilacion` privada previamente verificada. La corrección
  1.0.12 recuperó únicamente el catálogo/fotos iniciales de la APK entregada, comprobando
  su SHA-256 y los hashes de cada recurso; ver la continuidad. No usar datos ficticios
  ni una base operativa como sustitución silenciosa.
- Clave original de firma Android y su contraseña. El archivo de contraseña del
  script actual usa DPAPI y pertenece al usuario de Windows que lo creó: copiar
  únicamente el archivo DPAPI a otra PC no permite descifrarlo.
- SQLite, respaldos, usuarios, PIN, claves de cifrado y credenciales del buzón.
- SDK, JDK, Gradle, cachés, recursos generados y APK compiladas.

Para publicar actualizaciones compatibles desde otra computadora se necesita la
clave de firma original mediante una transferencia privada y una configuración
local apropiada. Una firma nueva no actualiza las APK existentes. No compartir
contraseñas ni subir los archivos anteriores al repositorio público.

## Báscula y evidencia de esta revisión

El perfil autorizado es RHINO BAR-9 con el transporte CH340 `1A86:7523`.
No se deduce el modelo de cualquier adaptador CH340.

La secuencia reproduce el código Windows aprobado: 9600 8N1, sin flujo,
lector iniciado antes de enviar `P` (`0x50`, sin terminador), inicialmente cada 800 ms.
Después de reconocer respuestas de peso, consulta a 200 ms conservando una única
solicitud pendiente y un plazo de respuesta de 800 ms. El panel activo se actualiza
cada 150 ms y no se repinta por lecturas idénticas. Las tres observaciones iguales
para formatos sin indicador de estabilidad y la vigencia de 1500 ms se conservan.
La configuración automática tiene reintentos limitados y conserva una
configuración sólo tras validar peso, unidad, estabilidad y vigencia.
Un fallo guarda un único diagnóstico técnico en almacenamiento privado de la app;
no se envía por internet. La venta permanece bloqueada si el peso no es válido.

Se acreditaron 59 pruebas Java de báscula y geometría de pantalla, además de las
regresiones de comercio, interfaz y permisos descritas en la continuidad.
El propietario confirmó lectura real con
1.0.9 y aportó video el 6 de noviembre de 2026; reportó una demora de varios segundos.
La lectura en movimiento de la revisión corregida 1.0.12 sigue pendiente en la tablet. No se acredita
compatibilidad física con todas las básculas ni exactitud contra un patrón de peso.
