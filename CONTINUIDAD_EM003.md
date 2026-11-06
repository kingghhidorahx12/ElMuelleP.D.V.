# EM-003: continuidad para la prueba Android

Actualización: 6 de noviembre de 2026, America/Mexico_City.
Referencia de código publicada: `4470f6a431ceac2e04afea31fa334616f154d30a` en `main`.
Esta transferencia agrega contexto; no cambia ni recompila la APK identificada abajo.

## Actividad inmediata

El propietario llevará otra computadora y probará la APK más reciente con la
báscula física. La nueva sesión debe acompañar esa prueba y, si falla, continuar
desde la evidencia nueva sin reiniciar el diagnóstico ni repetir intentos antiguos.

**Estado pendiente:** todavía no se ha confirmado una lectura física con la APK
1.0.9. No declarar que la báscula ya funciona por haber aprobado pruebas simuladas.

## APK exacta que se va a probar

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
| 1.0.9: lectura + P automática | Implementada, compilada, firmada y probada con simulaciones. **Prueba física aún pendiente.** |

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

Primero confirmar que se probó **1.0.9 / código 10**, mediante versión o huella,
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
> Voy a probar la APK 1.0.9 (versionCode 10) con la RHINO BAR-9 por USB OTG.
> La lectura física de esa revisión está pendiente. Si falla, utiliza el único
> diagnóstico automático del intento y el historial documentado para corregir
> únicamente la báscula. No repitas capturas de 20 segundos ni auditorías generales.

Actualizar este archivo cuando llegue el resultado físico, conservando la
distinción entre hechos, hipótesis y pendientes. Esta nota no reproduce el
historial completo ni el texto formal de EM-012; conserva las restricciones
operativas explícitas del propietario para esta tarea.
