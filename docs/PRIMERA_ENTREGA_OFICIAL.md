# Primera entrega oficial de El Muelle PDV

Fuentes estables aceptadas por el propietario y autorizadas para publicación
el 14 de noviembre de 2026 (America/Mexico_City).

## Versión de referencia

- Android: `1.0.22-android-prueba`, versionCode **23**.
- Application ID: `mx.elmuelle.pdv`; firma original conservada.
- SHA-256 de la APK privada verificada:
  `9C7A11D7EC92AF7129FF022B4822492FF0A3CF67F8D7127A2AF79308CBA60EC6`.
- SHA-256 de su manifiesto de fuentes empaquetadas:
  `1D7E73209DE1DC858D98ABEE907329E52BF6C8545262FB78EFAF78B27F0E5BF9`.

La APK no se adjunta al repositorio: contiene el catálogo privado de la entrega.
La aceptación como primera entrega no renombra ni vuelve a compilar ese binario.

## Alcance

POS local autónomo en Android; ventas, caja, inventario, precios por cliente y
mayoreo, caducidades, permisos por acción, reportes y ticket editable. Impresión
USB/Bluetooth/LAN y acceso Equipos para dueño y empleados, con selección guardada
y reconexión sin formularios técnicos. Actualización privada sin activar Buzón
ni introducir códigos; se mantienen las comprobaciones de firma y de integridad.
Windows conserva su implementación independiente.

Las IP nuevas requieren elección; fijar la dirección exige una reserva DHCP por
MAC en el router. La búsqueda de puertos no demuestra identidad ni compatibilidad
de una impresora. No se modifican la calibración ni los comandos autorizados de
la báscula RHINO BAR-9.

## Verificación y límites

La continuidad registra pruebas de rutas/permisos, interfaz en host aislado,
políticas nativas, compilación release, firma, dependencias y descarga íntegra
desde el canal privado. Las pruebas con dispositivos simulados no acreditan
una conexión física. El propietario informó funcionamiento USB y aceptación;
no se añaden resultados de báscula o FPS que no haya confirmado.

## Qué no se publica

No se incluyen datos operativos, claves, PIN, respaldos, diagnósticos reales,
catálogo ni fotografías privados de entrega, herramientas locales ni APK del
cliente. Los archivos públicos preexistentes del proyecto no son el catálogo
privado de entrega. Consultar `android/README.md` para las entradas privadas de
compilación y transferencia de la firma original.

El controlador DPC/Device Owner sigue siendo un desarrollo separado e inactivo;
no forma parte de estas fuentes estables ni se activan políticas en la tablet.
