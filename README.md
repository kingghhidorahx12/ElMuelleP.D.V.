# El Muelle POS

Punto de venta local para El Muelle Marisquería.

## Uso local

```bash
npm install
npm start
```

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

## Datos

El catálogo vive en `data/products.json`.

Las ventas (`data/sales.json`) y cortes (`data/cash-shifts.json`) no se suben al repositorio porque son registros reales del negocio.
