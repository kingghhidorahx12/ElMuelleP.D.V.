# Continuidad de El Muelle PDV

Antes de trabajar en EM-003, leer `CONTINUIDAD_EM003.md` y `android/README.md`.
Esos archivos conservan el estado técnico entre computadoras; no suponer que la
nueva sesión recibió el historial de conversación ni los archivos privados.

El propietario confirmó lectura física de la APK Android 1.0.9 con una
RHINO BAR-9 por USB OTG (video del 6 de noviembre de 2026). El lote local 1.0.11
añade precios por cliente/mayoreo, caducidades y peso visible mientras se estabiliza.
El propietario informó fallo de apertura; 1.0.12 corrige `MODULE_NOT_FOUND` de impresión
y pasó el arranque aislado sin dependencias externas. Tras la entrega 1.0.12, el propietario
confirmó apertura e impresión; no una nueva lectura de báscula. Ver APK, huella y límites
de las pruebas en la continuidad. No recomendar 1.0.11.
La revisión 1.0.13 añadió ticket raster 80 mm y actualizador privado; se publicó y
descargó íntegra por internet desde POS aislado. Ahora está retirada del servidor.
Falta prueba física del nuevo papel/instalador. Leer APK/huella en la continuidad.
La 1.0.14 (código 15) implementa teclado al tocar, motivos de inventario, permisos
por acción, editor de ticket y LAN opcional. Se publicó y descargó íntegra por internet en POS aislado;
consultar la continuidad para APK, huella, descarga y pruebas físicas pendientes.
La 1.0.15 corrige LAN y recargas de paneles; el propietario respondió «ya funcionó»,
sin nueva lectura de báscula ni medición de FPS. La 1.0.17 (código 18) incorpora
marca circular y detección/reconexión de impresora y báscula, únicos equipos actuales.
La 1.0.21/código 22 corrigió sólo los checks de Usuarios y PIN y revirtió el acomodo
equivocado de otros paneles. La vigente es **1.0.22/código 23**: Equipos para dueño y
empleados, búsqueda al abrir sin formularios, selección recordada y búsqueda LAN
automática acotada si la IP no responde. Empleados sólo buscan/eligen/reconectan;
no reciben permisos técnicos, de formato, respaldo o administración. IPs nuevas no
se adoptan sin elección; se necesita reserva DHCP por MAC en el router para fijarlas.
Propietario desconoce modelo del router; no asumirlo ni usar la IP de su captura de
El Oeste. APK firmada y descargada íntegra desde bundle original 1.0.21 en host aislado,
sin Buzón/códigos, hash coincidente; no acredita instalación/reconexión física.
Servidor sólo código 23; código 22 retirado con copia local verificada. Anteriores
APK archivadas localmente por petición; ver continuidad para huella y límites.
En el local el propietario respondió «ya funcionó» tras la guía USB; es confirmación
informada sin versión leída ni nueva lectura de báscula. Ahora consulta Device Owner:
la APK aún no contiene DPC/DeviceAdminReceiver; no inventar su componente, resetear,
quitar cuentas ni activar políticas sin respaldo verificado y autorización específica.
No recomendar 1.0.18: falló su descarga. Hace falta instalar la transición una vez
sobre la app antigua, sin desinstalar; después actualiza con un botón. Firma/permisos
Android se conservan. Ver huella y límites físicos en continuidad; no adivinar protocolos.
Si el propietario aporta un resultado posterior, actualizar primero ese estado.

- Mantener separados hechos observados, resultados informados por el propietario,
  pruebas simuladas y verificaciones físicas pendientes.
- No repetir auditorías generales ni pedir capturas manuales de 20 segundos.
  Ante un fallo, usar primero el diagnóstico automático existente de esa prueba.
- Preservar Windows, las instalaciones existentes, datos y claves originales,
  catálogo, fotografías y diseño aprobado. No registrar operaciones ficticias en
  bases definitivas ni desinstalar para resolver una actualización Android.
- No enviar comandos USB desconocidos ni modificar tara o calibración.
  La solicitud autorizada es `P` sin terminador: detección inicial a 800 ms y,
  tras reconocer respuestas de peso, consultas a 200 ms sin acumular solicitudes.
  Nunca permitir venta con peso inválido, inestable o vencido.
- El repositorio es público: no subir bases, catálogos privados de entrega,
  fotografías privadas, PIN, secretos, claves de firma, respaldos, diagnósticos
  reales ni APK que contengan el catálogo del cliente.
- Antes de generar una actualización Android, conservar applicationId y firma
  original; leer los requisitos privados y de herramientas en `android/README.md`.
- No repetir pruebas ya acreditadas para fuentes idénticas. Ejecutar las
  regresiones afectadas por cambios reales y verificar archivos/hashes de entrega.
- Las instrucciones actuales del propietario prevalecen sobre estas notas.
  Mantener este archivo breve y actualizar la continuidad con resultados nuevos
  comprobados, sin convertir suposiciones en hechos ni inventar autorizaciones.
