# Inventario Willy

Sistema de inventario y ventas para tienda física, con API pública como requisito central. Interfaz en español (Colombia), moneda COP sin decimales, zona horaria America/Bogota. La experiencia de uso sigue los patrones del panel de Shopify (Polaris): navegación estable, tablas como centro de la interfaz y acciones que dejan claro qué va a cambiar.

Producción: **https://inventariowilly.botyventas.com** · Documentación API: **/api/docs**

## Arquitectura

Monorepo pnpm:

| Paquete | Stack | Descripción |
| --- | --- | --- |
| `apps/api` | Node 20+, Fastify 5, Prisma 6, PostgreSQL 16 | API REST `/api/v1`, OpenAPI 3.1 generada desde Zod (Scalar en `/api/docs`), sesiones httpOnly + API keys, webhooks firmados |
| `apps/web` | React 18, Vite, TypeScript estricto, Tailwind, shadcn/ui (Radix), TanStack Query/Table, React Hook Form + Zod, Recharts, cmdk, sonner | Panel de administración. Consume la misma API pública (dogfooding) |
| `packages/shared` | Zod | Esquemas, enums, permisos, scopes, etiquetas y utilidades de formato compartidas (una sola fuente de verdad) |

### Modelo de inventario

Por variante y ubicación se manejan:

- **Disponible**: lo que se puede vender.
- **Comprometido**: reservado por órdenes abiertas sin entregar.
- **No disponible**: físicamente presente pero apartado (dañado, en revisión…), con motivo.
- **En existencia** = Disponible + Comprometido + No disponible.
- **Entrante**: en camino (órdenes de compra, transferencias); no es stock físico.

Todo cambio pasa por `applyMovements` (`apps/api/src/services/inventory.ts`), que bloquea las filas de nivel con `SELECT … FOR UPDATE` en orden determinista, valida que ningún bucket quede negativo (salvo Disponible si la política lo permite) y escribe en el **libro mayor inmutable** `InventoryMovement` con el saldo resultante. `POST /settings/reconcile` comprueba que cada nivel coincide con la suma de sus movimientos.

Los ajustes distinguen `mode: "delta"` (sumar/quitar) de `mode: "set"` (cantidad final) y exigen motivo. La UI muestra la vista previa "Disponible: 24 → 19" antes de guardar.

### Flujos

- **Ventas (POS/API)**: descuenta Disponible (`SALE`); con `hold: true` compromete (`RESERVATION`) hasta entregar. Pagos combinables (efectivo con cambio, tarjeta, transferencia, Nequi, Daviplata…). IVA 0/5/19 % por producto, precios con IVA incluido (configurable).
- **Devoluciones / anulaciones**: reingresan stock (`RETURN` / `CANCELLATION`) como disponible o no disponible, y reembolsan.
- **Transferencias**: despachar descuenta el origen y marca Entrante en destino; recibir (parcial o total) pasa Entrante → Disponible.
- **Órdenes de compra**: pedir alimenta Entrante; recibir pasa a Disponible y actualiza el costo promedio ponderado.
- **Conteos físicos**: esperado vs contado; aplicar hace ajustes `set` con tipo `COUNT`.
- **Caja**: apertura con base, entradas/salidas, cierre con arqueo (esperado vs contado).

## Instalación local

Requisitos: Node ≥ 20, pnpm 10 (`corepack enable`), PostgreSQL ≥ 14.

```bash
git clone https://github.com/santequera1/inventarioBase.git inventariowilly
cd inventariowilly
pnpm install
cp .env.example .env            # edita DATABASE_URL, SESSION_SECRET…
createdb inventariowilly && createdb inventariowilly_test   # o con psql
pnpm --filter @inventario/api exec prisma migrate deploy
pnpm db:seed                    # roles, ubicación, métodos de pago, motivos y admin (imprime la contraseña)
pnpm dev                        # API en :3300, web en :5173 (proxy /api)
```

Datos de demostración (tienda colombiana), **nunca por defecto**:

```bash
DEMO_SEED=1 pnpm db:seed:demo
```

Tests (usan `TEST_DATABASE_URL`):

```bash
pnpm --filter @inventario/api test
pnpm build && pnpm typecheck
```

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `NODE_ENV` | `production` / `development` / `test` |
| `PORT`, `HOST` | Puerto y host de la API (por defecto 3300 / 127.0.0.1) |
| `PUBLIC_URL` | URL pública (OpenAPI, tipos de error RFC 7807) |
| `DATABASE_URL` | Conexión PostgreSQL |
| `TEST_DATABASE_URL` | Base de datos para Vitest |
| `SESSION_SECRET` | ≥ 32 caracteres; firma las cookies de sesión |
| `CORS_ORIGINS` | Orígenes permitidos separados por coma, o `*` |
| `UPLOADS_DIR` | Carpeta de imágenes (servida en `/uploads`) |
| `LOG_LEVEL` | Nivel de pino (`info`, `warn`, `debug`) |
| `API_RATE_LIMIT` | Peticiones por minuto por API key (600) |
| `TZ` | `America/Bogota` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Opcionales para `pnpm db:seed` |

## Despliegue (este servidor)

- nginx: `/etc/nginx/sites-available/inventariowilly.botyventas.com` sirve `apps/web/dist`, proxy `/api` → `127.0.0.1:3300`, `/uploads` desde `uploads/`. SSL con certbot (renovación automática por `certbot.timer`).
- PM2: `ecosystem.config.cjs` → proceso `inventariowilly-api` (arranque al boot con `pm2 startup`/`pm2 save`).
- Despliegue: `./deploy.sh` (pull → install → `prisma migrate deploy` → build → `pm2 reload` sin downtime → healthcheck).
- Backups: `scripts/backup.sh` (cron diario 02:30, `pg_dump` + uploads, rotación 14 días) en `backups/`. Restaurar con `scripts/restore.sh <dump>`.
- Logs: `logs/api.out.log`, `logs/api.err.log` (pino JSON), `logs/backup.log`. Healthcheck: `GET /api/health`.

## API pública

Base: `https://inventariowilly.botyventas.com/api/v1`. Referencia interactiva con ejemplos: `/api/docs`. Especificación: `/api/openapi.json`.

### Autenticación

API keys con scopes (`read:products`, `write:inventory`, `write:orders`…), creadas en Configuración → API keys. Se muestran una sola vez, se guardan con hash SHA-256, son revocables y registran último uso.

```bash
curl https://inventariowilly.botyventas.com/api/v1/inventory-levels?sku=CAM-M-BLA \
  -H "Authorization: Bearer iw_live_XXXXXXXX.YYYYYYYY"
```

### Convenciones

- Paginación por cursor: `?limit=50&cursor=…` → `meta.next_cursor`, `meta.has_more`.
- Filtros comunes: `updated_since`, `sku`, `location_id`, `status`, `q`; ordenamiento `sort=campo:asc|desc`; `expand=…`.
- Idempotencia: header `Idempotency-Key` en los `POST` que crean órdenes, ajustes, transferencias, conteos y compras. Misma clave + mismo cuerpo → respuesta original con `Idempotent-Replayed: true`; mismo cuerpo distinto → `422`.
- Errores RFC 7807 (`application/problem+json`) con `type`, `title`, `status`, `detail` y `errors[]` por campo.
- Rate limit por API key (600/min) con cabeceras `X-RateLimit-*`.

### Ejemplos

Ajuste de stock (delta vs set):

```bash
curl -X POST $BASE/api/v1/inventory-adjustments \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"variantId":"…","locationId":"…","mode":"delta","quantity":-3,"reason":"Venta marketplace"}'
```

Venta:

```bash
curl -X POST $BASE/api/v1/orders \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: pedido-web-10492" \
  -d '{"locationId":"…","externalRef":"WEB-10492","items":[{"variantId":"…","quantity":2}],"payments":[{"methodCode":"transfer","amount":90000,"reference":"TRX-889"}]}'
```

Upsert masivo por SKU: `POST /api/v1/products/bulk`. Ajuste masivo: `POST /api/v1/inventory-adjustments/bulk`.

### Webhooks

Eventos: `inventory.updated`, `inventory.low_stock`, `product.created|updated|deleted`, `order.created|paid|cancelled|returned`, `transfer.received`, `purchase_order.received`. Reintentos con backoff exponencial (1 m, 5 m, 30 m, 2 h, 12 h), registro de entregas y reenvío manual desde Configuración → Webhooks.

Cabeceras: `X-Webhook-Id`, `X-Webhook-Event`, `X-Webhook-Timestamp` (unix) y `X-Webhook-Signature: sha256=<hex>`. Firma = HMAC-SHA256(secreto, `"{timestamp}.{cuerpo}"`).

```js
import { createHmac, timingSafeEqual } from "node:crypto";
export function verifyWebhook(rawBody, headers, secret) {
  const ts = headers["x-webhook-timestamp"];
  const sig = (headers["x-webhook-signature"] || "").replace("sha256=", "");
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return expected.length === sig.length && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
}
```

## Roles y permisos

Roles del sistema: `ADMIN` (todo), `INVENTARIO`, `VENDEDOR`; se pueden crear roles con permisos granulares (`inventory.adjust`, `orders.refund`, `cash.manage`…). Sesión con cookie httpOnly firmada, contraseñas con argon2id. Toda acción relevante queda en Auditoría.
