# Entrega local de El Muelle POS

## Decisión de despliegue

El PDV se entrega como una aplicación web **local instalada** para una sola
computadora. No se publica en Internet ni se instala como servicio de red. El
instalador incluye el runtime necesario y abre Microsoft Edge o Google Chrome
en modo aplicación en `http://127.0.0.1:3000`.

Esta modalidad conserva el acceso a la báscula RHINO BAR-9 por Web Serial,
reduce la superficie de ataque y no exige instalar Node.js en la computadora
del negocio.

## Generar e instalar

En la computadora de desarrollo, después de validar los cambios:

```powershell
npm run build:installer
```

Se generará `dist/installer/ElMuellePOS-Setup.exe`. Copia ese archivo a la
computadora del negocio y ejecútalo. La instalación se hará por usuario en una
ruta local de Windows; no uses una carpeta sincronizada por nube ni una memoria
USB como ubicación de trabajo.

Al abrir El Muelle POS por primera vez desde el acceso directo:

1. La aplicación muestra la pantalla para crear la cuenta y PIN del dueño.
2. No se crea un empleado; se agrega después desde Configuración si hace falta.
3. Se crea el archivo privado `data\.secrets.json` con una clave de cifrado única.
4. Se crea la base `data\el-muelle-pos.sqlite` y su respaldo diario.
5. Se abre el PDV en Edge o Chrome.

El usuario debe conservar el archivo `.secrets.json` junto con la base de datos. Si se
pierde la clave `DATA_ENCRYPTION_KEY`, no será posible descifrar solicitudes
fiscales existentes.

Para cerrar el servidor local al final del día, usa el acceso `Cerrar servidor
El Muelle POS` del menú Inicio. Cerrar sólo la ventana del navegador no borra
datos; el servidor conserva exclusivamente la información local del negocio.

## Respaldo y restauración

Después de cada cambio confirmado, el sistema actualiza el respaldo del día en
`data\backups\el-muelle-pos-AAAA-MM-DD.sqlite`. Adicionalmente, al cierre de
cada día copia esa carpeta de respaldos y el archivo `.secrets.json` a una USB
cifrada guardada fuera del local.

Para probar una restauración sin arriesgar la operación:

1. Cierra el PDV con el acceso `Cerrar servidor El Muelle POS`.
2. Copia un archivo de `data\backups` a una carpeta de prueba fuera de
   `data`.
3. Abre la copia con una herramienta SQLite o colócala en una instalación de
   prueba con su mismo `.secrets.json`.
4. Verifica una venta reciente, sus existencias y su corte de caja.

Para una recuperación real, conserva primero una copia de la base actual,
reemplaza `data\el-muelle-pos.sqlite` por el respaldo elegido y abre el
PDV. Nunca restaure una base de otro equipo junto con un `.secrets.json` distinto.

## Prueba en la computadora definitiva

La prueba de báscula se hace sólo en el equipo del local, con Edge o Chrome:

1. Conecta la RHINO BAR-9 por USB o serie y confirma el puerto COM asignado.
2. Abre un producto vendido por kilogramo y selecciona la báscula.
3. Autoriza el puerto correcto y verifica una lectura estable a 9600, 8N1.
4. Haz una venta de prueba, una corrección manual autorizada y una cancelación.
5. Comprueba que existencias, caja y bitácora reflejan cada acción.
6. Reinicia el PDV y verifica que los datos sigan presentes.

Antes de la entrega final, también valida impresora, apertura y cierre de caja,
efectivo/tarjeta/transferencia, solicitud de factura, cancelación y el respaldo
del día.

## Consulta desde celular en el futuro

No se habilita acceso remoto en esta entrega. Cuando el dueño necesite revisar
la tienda desde el celular, debe añadirse una vista de solo lectura con cuentas
individuales y acceso por una VPN privada; no se debe abrir el puerto 3000 ni
hacer redirección de puertos en el módem. Esa fase requiere su propia prueba de
seguridad y de conectividad.
