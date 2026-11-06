# El Muelle PDV Android

Fuentes de la revisión `1.0.10-android-prueba` (versionCode 11), aplicación `mx.elmuelle.pdv`.
La aplicación Android funciona de forma autónoma; Windows conserva su implementación independiente.

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
  fotografías, exclusión de claves y SHA-256 del archivo generado.

## Archivos privados que no están en GitHub

- Catálogo preparado del cliente y fotografías originales de la entrega.
  `prepare-assets.cjs` resuelve su ubicación mediante `.dev/em003-final-delivery.json`,
  propiedad `privatePreparation`, y su subcarpeta `compilacion`.
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

Se acreditaron 49 pruebas Java de lectura, detección, latencia, errores y reconexiones,
además de pruebas de interfaz y permisos. El propietario confirmó lectura real con
1.0.9 y aportó video el 6 de noviembre de 2026; reportó una demora de varios segundos.
La mejora de latencia de 1.0.10 sigue pendiente de probar en la tablet. No se acredita
compatibilidad física con todas las básculas ni exactitud contra un patrón de peso.
