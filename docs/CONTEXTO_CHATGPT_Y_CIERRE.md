# El Muelle POS: contexto del proyecto y plan de cierre

Documento preparado el 16 de octubre de 2026 a partir de la conversación y del código local. Está pensado para adjuntarlo o pegarlo en un proyecto de ChatGPT. Distingue lo implementado de lo que todavía necesita validación; no es una certificación de que el producto esté listo para operar.

## 1. Objetivo y situación del negocio

Estoy desarrollando **El Muelle POS**, un punto de venta para una pescadería/marisquería que vende productos por kilogramo y por pieza. Necesito terminarlo como un producto coherente, seguro, práctico y entregable, conservando la identidad visual de El Muelle.

La solicitud original fue revisar UI, UX, vulnerabilidades, integridad de operaciones, preparación para entrega y protección de la propiedad del proyecto. Después se implementaron cambios funcionales, de seguridad, almacenamiento, instalación y diseño.

Al definir el alcance, el negocio sólo tenía al dueño y todavía no tenía empleados. La primera configuración debe crear únicamente al administrador. Los encargados se agregarán cuando haga falta.

La operación será en **una sola computadora Windows del local**. Existe el deseo de que, en una fase posterior, el dueño consulte la tienda desde su celular a distancia. Esa función remota no está implementada y no debe confundirse con el funcionamiento local actual.

## 2. Decisiones y preferencias que deben respetarse

- Estamos iterando directamente en el navegador. **No generar instaladores ni paquetes nuevos hasta que yo lo pida.**
- Usar Edge o Chrome por la integración de báscula mediante Web Serial.
- Mantener el estilo de la app: azul marino, blanco, dorado, logotipo y fotografías de producto.
- Conservar precio y disponibilidad visibles en las tarjetas. Nunca resolver problemas de espacio ocultando esos datos.
- El bloque superior del POS debe ocupar poca altura: título, categorías, filtros, búsqueda y paginación deben quedar juntos, con separación mínima y sin superponerse.
- Las fotos deben tener protagonismo y las tarjetas aprovechar el espacio recuperado arriba.
- Revisar la pantalla real antes de dar por terminado un ajuste visual. Comprobar sintaxis no prueba que el diseño funcione.
- No borrar datos ni credenciales nuevamente como parte de una revisión rutinaria. Ya se autorizó y ejecutó un reinicio puntual de los datos de desarrollo en el pasado.
- Excepción expresa del alcance de la auditoría: **no se pidió restringir que un empleado abra o cierre una caja iniciada por otra persona**. Esa política se dejó como estaba por decisión del usuario.

## 3. Arquitectura actual

Ruta del proyecto:

```text
C:\Users\nexar\Documents\Proyectos\ElMuellePDV
```

- Backend: Node.js, CommonJS, Express 5.2.1 y `cors` 2.8.6.
- Node declarado en `package.json`: versión 22.5.0 o superior. Se usa el módulo integrado `node:sqlite`.
- Frontend: HTML, CSS y JavaScript sin framework. No es un proyecto React, Next, Vue ni Electron.
- Persistencia: SQLite en `data/el-muelle-pos.sqlite`.
- La tabla `documents` guarda colecciones como documentos JSON dentro de SQLite. Hay otra tabla para la bitácora. No es un modelo de tablas de ventas/productos completamente normalizado.
- Se importan una sola vez los archivos JSON heredados al iniciar una base nueva.
- Se usan transacciones, WAL, sincronización FULL y respaldo SQLite mediante `VACUUM INTO`.
- El servidor escucha por defecto en `127.0.0.1`, no en toda la red.

Archivos principales:

| Archivo | Responsabilidad |
| --- | --- |
| `public/index.html` | Estructura de pantallas y formularios |
| `public/app.js` | Navegación, estado, ventas, báscula, administración y reportes |
| `public/styles.css` | Diseño global, layouts, transiciones y responsive |
| `src/server.js` | API, autenticación, validaciones y operaciones del negocio |
| `src/database.js` | SQLite, migración, transacciones, respaldos y bitácora |
| `scripts/security-smoke-test.js` | Prueba automática de seguridad y flujos básicos |
| `portable/` | Inicio/cierre local para Windows |
| `installer/ElMuellePOS.iss` | Configuración del instalador Inno Setup |
| `scripts/build-portable.ps1` | Construcción de la entrega portable |
| `scripts/build-installer.ps1` | Construcción del instalador |
| `docs/ENTREGA_LOCAL.md` | Procedimiento de entrega y pruebas en el equipo definitivo |
| `docs/PROPIEDAD_Y_PUBLICACION.md` | Pendientes de titularidad y publicación |

## 4. Cómo se ejecuta durante el desarrollo

En PowerShell:

```powershell
cd "C:\Users\nexar\Documents\Proyectos\ElMuellePDV"
npm run dev
```

Abrir:

```text
http://127.0.0.1:3001
```

El script `dev` actual es `set PORT=3001&& node src/server.js`, orientado a Windows. `npm start` continúa usando el puerto 3000.

Se separaron los puertos porque la versión instalada ya estaba usando el 3000. Durante una sesión anterior, al intentar iniciar otra copia sobre ese puerto, el comando volvía al prompt y mostraba un mensaje de arranque poco fiable. No asumir que ese comportamiento quedó corregido en el servidor: se evitó el choque usando el 3001; todavía conviene gestionar expresamente los errores de `listen`.

Los cambios de HTML/CSS/JavaScript del navegador se revisan recargando con `Ctrl + F5`. Los cambios del backend necesitan reiniciar el proceso Node. Cerrar una pestaña no equivale a detener el servidor.

La copia instalada y la de desarrollo tienen ubicaciones de datos distintas. No confundirlas ni sobrescribirlas entre sí.

## 5. Funciones implementadas en el código

### Acceso y primera configuración

- Pantalla inicial para nombre del dueño, PIN de administrador y confirmación.
- PIN de 6 a 12 dígitos.
- La creación inicial ocurre en la app, no en un formulario de CMD.
- No se crea un empleado por defecto.
- Inicio de sesión de administrador y empleados; administración de usuarios y PIN desde Configuración.
- Se eliminaron de la pantalla de inicio de sesión las tarjetas de estado de Servidor y Báscula, a petición del usuario.
- Para la entrega instalada se intentó conservar la primera ventana compacta y maximizar después de la configuración. El navegador puede limitar `moveTo`/`resizeTo`; el lanzador abre las siguientes ejecuciones con `--start-maximized`. Falta comprobar el flujo final completo en Windows.

### Punto de venta

- Catálogo con fotos y categorías: Todos, Pescados y mariscos, Carnes selectas, Para el antojo, Condimentos y salsas.
- Filtros Todos, Por kg y Por pieza; buscador y paginación.
- `PAGE_SIZE = 12`; diseño de referencia de escritorio de 4 columnas por 3 filas.
- Precio por unidad y cantidad disponible en la tarjeta.
- Selección por pieza o kilogramo, panel de pesaje y cantidad manual con autorización.
- Carrito/venta actual, total, cobro y vaciado de venta.
- Efectivo, tarjeta y transferencia; referencia obligatoria para tarjeta/transferencia en el backend.
- Cobro bloqueado si no hay caja abierta.
- Descuentos protegidos en el servidor: requieren administrador y motivo.
- Pregunta sobre solicitud de factura al cobrar.
- Animaciones de navegación, menú lateral y tarjetas; carga de imágenes con transición y fallback JPG/PNG.

### Ventas

- Historial con búsqueda por folio y filtros de periodo/estado.
- Detalle y comprobante de venta.
- Cancelación administrativa con motivo, reposición de inventario y bitácora.
- El backend limita al empleado la consulta a sus propias ventas.

### Productos e inventario

- Gestión de productos, unidad, precio, costo, existencias y mínimos.
- Entradas de inventario, producto existente o nuevo y proyecciones financieras.
- Ajustes de inventario con motivo y autorización administrativa.
- Resumen de valor invertido, venta y ganancia proyectadas y entradas.
- Indicadores de movimiento calculados sobre 30 días. Se cambió el diseño para destacar un solo campeón y un producto de menor rotación, en lugar de dos listas largas.
- Hay que terminar de comprobar el ajuste de esos paneles en pantallas bajas y con nombres largos.

### Caja

- Apertura con fondo inicial, estado de caja y resumen actual.
- Entradas y retiros manuales administrativos.
- Cierre con efectivo contado, esperado y diferencia.
- Calculadora opcional por denominaciones.
- Historial de cortes e impresión de resumen.
- Se conserva la excepción solicitada sobre quién puede abrir/cerrar una caja.

### Panel administrativo

- Total vendido, cantidad de ventas, ticket promedio, margen, ganancia y reinversión.
- Estado y efectivo esperado de la caja.
- Se movieron efectivo, tarjeta y transferencia a indicadores junto a los KPI principales.
- Gráfica de ventas y distribución de pagos, cada una con controles propios de periodo/fecha.
- Se intentó organizar Más vendidos/Menos vendidos en un par de columnas y Días con más ventas/Inventario bajo en otro par.
- Se hicieron ajustes para reducir espacio vacío y desbordamientos; todavía se requiere validar visualmente todo el panel.

### Reportes

- Menú Reportes con pestañas Generar reportes y Caja y cortes.
- Tipos: ventas, productos vendidos e inventario.
- Periodos: día, semana, mes, año, histórico y rango.
- Vista previa con indicadores y tabla, exportación CSV e impresión desde el navegador.
- Los reportes se calculan en el frontend a partir de las API existentes; no hay un servicio independiente de generación de informes.
- No se implementó generación directa de XLSX ni un generador PDF dedicado.

### Solicitudes de factura

- Registro de solicitud y datos fiscales ligados a una venta.
- Datos fiscales cifrados en el almacenamiento.
- **No hay timbrado CFDI ni emisión fiscal automática**: la pantalla es para registrar la solicitud y completar el proceso fuera de la app.

## 6. Seguridad y persistencia incorporadas

- Validación de permisos en backend para operaciones administrativas; no sólo ocultar botones.
- PIN con `scrypt` y salt; comparación de hashes en tiempo constante.
- Sesiones del servidor con identificadores aleatorios y cookie `HttpOnly`, `SameSite=Strict`; `Secure` al exigir HTTPS.
- Sesiones en memoria: al reiniciar el backend se requiere volver a autenticarse.
- Límite de intentos fallidos de autenticación y respuestas 429.
- Revisión de origen para operaciones de escritura y CORS configurable.
- Cabeceras de seguridad y CSP.
- Cálculo de nombres, precios y totales en el servidor a partir del catálogo, para evitar aceptar valores manipulados del cliente.
- Validaciones de descuentos, motivos y referencias de pago.
- Cifrado AES-256-GCM de datos fiscales; esto no significa que toda la base SQLite esté cifrada.
- Clave local generada en `data/.secrets.json`, o configuración por variable de entorno.
- Transacciones para cambios relacionados de venta, inventario y auditoría.
- Bitácora consultable de acciones sensibles.
- Respaldo en `data/backups/`; se actualiza la copia del día después de cambios confirmados. No equivale a un historial inmutable de cada operación ni a un respaldo externo.
- `.gitignore` excluye bases, archivos operativos, respaldos, secretos, `.env` y `dist`.

La base y `.secrets.json` deben conservarse juntos para recuperar los datos fiscales. Nunca adjuntar PIN, secretos o datos reales de clientes al proyecto de ChatGPT o al repositorio.

## 7. Báscula y periféricos

Báscula prevista: **RHINO BAR-9** mediante Web Serial en Edge/Chrome:

- 9600 BPS, 8 bits, sin paridad, 1 bit de parada, sin control de flujo.
- Comando de solicitud `P`.
- Configuración y lectura desde el navegador.

La prueba física se acordó para la computadora definitiva del local. No se ha acreditado en esta conversación una validación final con la báscula y la impresora reales. Hay que comprobar peso estable, unidades, conexión/reconexión, permiso del puerto, pérdida de conexión, venta completa, cantidad manual autorizada y comprobante impreso.

## 8. Instalación: trabajo hecho y estado actual

Ya se generaron versiones portable e instalador Windows con Inno Setup. Incluyen runtime Node, app local y apertura de Edge/Chrome en modo aplicación.

Se creó un icono compacto basado en el puente y las olas del logotipo, sin las iniciales anteriores:

- `public/assets/brand/el-muelle-app-icon.png`
- `public/assets/brand/el-muelle-app-icon.ico`

Se integró en favicon, instalador, accesos directos y desinstalador.

El arranque inicial dejaba una ventana CMD visible. Se añadieron lanzadores `.vbs` que invocan PowerShell oculto y se cambiaron los accesos del instalador para utilizarlos. Los `.cmd` quedan como compatibilidad.

Existe `dist/installer/ElMuellePOS-Setup.exe`, pero **no incorpora todos los cambios posteriores realizados en modo navegador**. No debe presentarse como la entrega final más reciente. No volver a construirlo hasta que el usuario lo autorice.

## 9. Diseño: dónde nos quedamos exactamente

La tarea activa inmediatamente anterior a este documento era ordenar la pantalla de Punto de Venta.

El usuario observó repetidamente demasiado espacio entre Selecciona el producto, categorías y la fila de filtros/buscador/paginación. Además, al intentar agrandar fotos, se cortaron nombres, precios o disponibilidad. Las capturas muestran problemas reales; no se deben dar por resueltos sólo porque se añadieron reglas CSS.

Se identificó un `padding-top: 14px !important` más específico que mantenía el hueco aunque otras reglas reducían el padding. Se intentó fijar tres filas en el catálogo para entregar todo el resto de altura a los productos.

El archivo `public/styles.css` supera las 13.000 líneas y acumula muchas reglas repetidas y `!important`. Algunos bloques posteriores vuelven a cambiar valores establecidos antes. La prioridad es inspeccionar estilos computados y consolidar el layout del POS; seguir agregando overrides puede reproducir el problema.

Último cambio tipográfico en el código:

- Antes: DM Sans para interfaz y Space Grotesk para títulos.
- Ahora: Manrope como `--font-ui` y Cinzel como `--font-display`, cargadas desde Google Fonts.
- El usuario pidió investigar en DaFont y cambiar la tipografía; se revisó una declaración del autor de Cinzel sobre uso comercial. No se ha documentado una revisión completa de licencias/redistribución de todos los archivos tipográficos.
- Sigue pendiente confirmar que esa pareja le guste al usuario. Algunas reglas antiguas aplican `--font-display` también a nombres o precios; hay que revisar ese alcance.
- Las fuentes siguen dependiendo de una descarga externa. Para la entrega local, queda pendiente valorar servirlas desde la app con sus licencias para conservar el diseño sin Internet.

Objetivo visual final: título discreto, categorías y controles juntos, fotos de tamaño generoso y nombre/precio/disponibilidad completos; todo debe caber sin superposición con la barra lateral expandida y contraída.

## 10. Validación actual y pendientes concretos encontrados

En revisiones anteriores pasó `npm test`, cuyo comando ejecuta `scripts/security-smoke-test.js`. Comprueba alta inicial del dueño, autenticación, permisos, migración de credenciales, manipulación de precios, descuentos, cancelación y devolución de stock, cifrado fiscal, bitácora, respaldo y límite de intentos. No es una batería completa de UI, rendimiento o periféricos.

Al preparar este contexto el **16/10/2026**, los chequeos de sintaxis de `public/app.js`, `src/server.js` y `src/database.js` pasaron, pero `npm test` **falló**:

```text
AssertionError: 401 !== 200
scripts/security-smoke-test.js:205
```

El fallo se produce en el login del administrador de prueba. El script copia el directorio `data` del proyecto a una carpeta temporal, incluida una SQLite ya configurada, y luego escribe credenciales de prueba en `settings.json`. SQLite tiene prioridad y la importación JSON no se repite. Esto apunta a un problema de aislamiento de los datos de prueba. Debe corregirse y volver a comprobarse antes de afirmar que la suite está en verde; no significa por sí solo que el PIN real del dueño esté mal.

Otros pendientes verificables en el código:

1. `printGeneratedReport()` imprime sólo `report.rows.slice(0, 60)`. Una impresión puede quedar incompleta sin avisar. Hay que definir paginación o impresión completa.
2. El reporte de inventario muestra existencias actuales, aunque conserva controles/caption de periodo. No implementa inventario histórico por fecha; debe aclararse o ajustarse.
3. El CSV entrecomilla valores, pero no tiene tratamiento específico de fórmulas al abrirlo en hojas de cálculo. Revisar campos de texto exportables.
4. La gráfica de pagos sin ventas dibuja un anillo verde completo por la construcción del gradiente. Debe mostrar un estado vacío que no sugiera que hubo transferencias.
5. Revisar permisos y alcance de los nuevos reportes con un usuario empleado; Reportes no está incluido en `ADMIN_VIEWS`, porque comparte módulo con Caja. No bloquear la caja del empleado al resolver permisos de reportes.
6. Manejar errores de arranque, especialmente puerto ocupado, con un mensaje correcto y sin anunciar éxito antes de comprobarlo.
7. Verificar actualización/reinstalación y restauración sin reemplazar datos operativos. Tener los archivos del instalador no acredita estas pruebas.
8. Revisar las métricas de ranking: inventario prioriza número de tickets; el panel ordena por ingreso. Confirmar que los nombres y explicaciones sean coherentes.

Estos puntos son pendientes del cierre, no cambios implementados al escribir este documento.

## 11. Propiedad, publicación y Git

El usuario indicó que su repositorio de GitHub era público y quería proteger la autoría y los derechos del proyecto. No se ha comprobado aquí su visibilidad actual.

Se añadió:

- `LICENSE.md` con licencia propietaria.
- `private: true` y `license: UNLICENSED` en `package.json`.
- Aviso de derechos en README.
- `docs/PROPIEDAD_Y_PUBLICACION.md`.

**Punto por resolver:** la licencia actual nombra a El Muelle Marisquería y a sus respectivos titulares, pero la intención expresada por el desarrollador fue proteger el proyecto como suyo. Hay que decidir y documentar correctamente quién es el titular del software, qué derechos recibe el negocio y quién puede reutilizarlo. No asumir que ese asunto quedó cerrado por haber creado un archivo LICENSE.

`private: true` evita publicación accidental en npm; no cambia la visibilidad en GitHub. La documentación dejó planteados revisar privacidad del repositorio, evidencia de autoría y posibles trámites formales; no consta que se hayan realizado. También hay que verificar licencias/procedencia de fuentes e imágenes.

El árbol de trabajo sigue con numerosos archivos modificados y otros sin seguimiento en Git, incluidos archivos funcionales relevantes como `src/database.js`, scripts y recursos. No asumir que GitHub ya contiene el estado local actual. Preparar una revisión y un commit deliberado al cerrar; no publicar ni subir datos operativos sin autorización.

## 12. Plan propuesto para terminar

1. Estabilizar el entorno de desarrollo y corregir el aislamiento de `npm test`.
2. Resolver visualmente el POS y confirmar tipografía. Revisar en 1366×768 y en el equipo objetivo, con zoom normal, barra lateral abierta/cerrada y navegador con sus barras visibles.
3. Revisar todas las demás pantallas con datos vacíos, normales y largos; corregir desbordes y espacios innecesarios.
4. Completar/verificar reportes, permisos, exportación, impresión y coherencia de indicadores.
5. Hacer una prueba integral: primera configuración, alta opcional de empleado, apertura, entrada de inventario, venta por pieza/kg, tres métodos de pago, cancelación, solicitud fiscal, corte, reinicio y recuperación de respaldo.
6. Probar báscula e impresora reales en la máquina definitiva, como se acordó.
7. Resolver titularidad, recursos de terceros y documentación de operación, actualización y restauración.
8. Con aprobación del usuario, generar una única entrega candidata a final, probar instalación/actualización y confirmar que coincide con el código validado.

La consulta remota desde celular queda para una fase posterior: panel de sólo lectura con acceso privado y autenticación. La propuesta previa fue una VPN privada; no se implementó ni se validó una solución. No abrir directamente el puerto de Node a Internet.

## 13. Instrucción para continuar en ChatGPT

Actúa como colaborador de producto, UI/UX y desarrollo para ayudarme a cerrar este proyecto. Usa este documento como contexto, diferencia hechos de propuestas y trabaja con prioridades concretas. No supongas que todo lo mencionado como implementado ya está validado. No propongas reconstruir la app desde cero como primer paso. Mi prioridad inmediata es terminar de acomodar el Punto de Venta y después cerrar los pendientes funcionales y de entrega. Quiero instrucciones claras, cambios revisables y comprobación de lo que realmente se ve y funciona.

Para revisar el código desde el proyecto de ChatGPT harán falta los archivos actuales: este documento describe el estado, pero no concede acceso a la carpeta local. Compartir primero `public/index.html`, `public/styles.css`, `public/app.js`, `src/server.js`, `src/database.js`, `package.json` y la prueba de seguridad, junto con capturas actuales. Excluir `.env`, `.secrets.json`, bases, respaldos, PIN y datos de clientes.
