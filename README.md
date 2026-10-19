# El Muelle POS

Punto de venta local para El Muelle Marisquería.

## Derechos de uso

Este repositorio es **software propietario**. Su publicación en GitHub no autoriza
la copia, modificación, distribución ni uso comercial del código o de los recursos
originales. Consulta [LICENSE.md](LICENSE.md).

## Uso local

```bash
npm install
npm start
```

En el primer arranque la aplicación muestra una pantalla para crear la cuenta
del dueño y su PIN de 6 a 12 dígitos. No se crea ningún empleado de forma
predeterminada: se podrán agregar desde Configuración cuando el negocio lo
necesite. La clave local para cifrar los datos fiscales se genera en
`data/.secrets.json`; respáldala junto con la base de datos y nunca la subas a
GitHub.

Abre la app en:

```text
http://localhost:3000
```

## Báscula RHINO BAR-9

La app se conecta desde Chrome o Edge usando Web Serial.

- Velocidad: 9600 BPS
- Datos: 8 bits
- Paridad: ninguna
- Stop bit: 1
- Flujo: ninguno
- Comando de peso: `P`

Para vender con control de caja, primero abre caja en `Corte de Caja`. Si la caja del día está cerrada, el sistema bloquea el cobro.

## Datos y respaldos

En el primer arranque, el catálogo y los datos JSON anteriores se importan a
`data/el-muelle-pos.sqlite`. Las operaciones posteriores usan transacciones
SQLite y se genera un respaldo diario en `data/backups/`.

Las ventas, cortes, bitácora y solicitudes fiscales no se suben al repositorio.
Los datos fiscales nuevos se guardan cifrados; conserva de forma segura la
clave `DATA_ENCRYPTION_KEY`, porque se necesita para leerlos.

## Despliegue

Por defecto la app sólo escucha en `127.0.0.1`. Para una instalación de red,
colócala detrás de HTTPS, configura explícitamente `HOST` y activa
`REQUIRE_HTTPS=true`. No expongas directamente el puerto de Node a Internet.

## Instalador Windows para la computadora del local

La modalidad recomendada es un **instalador local de Windows**. Conserva la
interfaz web sólo dentro de `127.0.0.1`, instala los componentes necesarios por
usuario y abre Edge o Chrome en modo aplicación. No publica el PDV en Internet
y mantiene compatibilidad con la báscula vía Web Serial.

Desde la computadora de desarrollo, genera el paquete con:

```powershell
npm run build:installer
```

El resultado es `dist/installer/ElMuellePOS-Setup.exe`. Ejecútalo en la
computadora del local; el primer inicio abre la pantalla para crear la cuenta
del dueño. Consulta el procedimiento de entrega, respaldo, restauración y
validación de báscula en [docs/ENTREGA_LOCAL.md](docs/ENTREGA_LOCAL.md).
