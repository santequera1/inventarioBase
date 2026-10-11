import * as React from "react";
import { Link } from "react-router-dom";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { API_SCOPES, scopeLabels, WebhookEvent, webhookEventLabels } from "@inventario/shared";
import { Page, PageHeader, Card } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BASE = typeof window !== "undefined" ? window.location.origin : "https://inventariowilly.botyventas.com";

function Code({ children, lang = "bash" }: { children: string; lang?: string }) {
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-md border border-border bg-[#1a1a1a] p-4 text-[12.5px] leading-relaxed text-[#e8e8e8] scrollbar-thin"><code data-lang={lang}>{children}</code></pre>
      <button type="button" onClick={() => { navigator.clipboard.writeText(children); toast.success("Copiado"); }} className="absolute right-2 top-2 hidden rounded-md bg-white/10 p-1.5 text-white hover:bg-white/20 group-hover:block" aria-label="Copiar"><Copy className="h-4 w-4" /></button>
    </div>
  );
}

export default function DevelopersPage() {
  return (
    <Page>
      <PageHeader title="Desarrolladores" subtitle="Guía rápida para integrar otros sistemas con la API pública." primaryAction={<Button asChild variant="primary"><a href="/api/docs" target="_blank" rel="noreferrer">Referencia OpenAPI <ExternalLink /></a></Button>} secondaryActions={<Button asChild variant="secondary"><Link to="/configuracion/api-keys">Administrar API keys</Link></Button>} />
      <div className="flex flex-col gap-4">
        <Card title="1. Autenticación" description="Crea una API key en Configuración → API keys con los scopes mínimos necesarios. El token se muestra una sola vez.">
          <Code>{`curl ${BASE}/api/v1/products?limit=5 \\
  -H "Authorization: Bearer iw_live_XXXXXXXX.YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY"`}</Code>
          <div className="mt-3 flex flex-wrap gap-1.5">{API_SCOPES.map((s) => <Badge key={s} tone="outline" title={scopeLabels[s]}>{s}</Badge>)}</div>
          <p className="mt-3 text-sm text-muted-foreground">Base URL: <code className="rounded bg-muted px-1 py-0.5 tabular">{BASE}/api/v1</code>. Límite por defecto: 600 peticiones/min por API key (cabeceras <code>X-RateLimit-*</code>). Los errores siguen RFC 7807 (<code>application/problem+json</code>).</p>
        </Card>

        <Card title="2. Consultar inventario" description="Niveles por variante y ubicación. Filtra por sku, location_id, stock_state o updated_since para sincronizaciones incrementales.">
          <Code>{`curl "${BASE}/api/v1/inventory-levels?sku=CAM-M-BLA&expand=variant" \\
  -H "Authorization: Bearer $API_KEY"

# Paginación por cursor
curl "${BASE}/api/v1/inventory-levels?limit=100&updated_since=2026-10-01T00:00:00-05:00" \\
  -H "Authorization: Bearer $API_KEY"
# → { "data": [...], "meta": { "next_cursor": "...", "has_more": true } }`}</Code>
          <p className="mt-3 text-sm text-muted-foreground">Cada nivel trae <code>available</code>, <code>committed</code>, <code>unavailable</code>, <code>onHand</code> (= available + committed + unavailable) e <code>incoming</code>.</p>
        </Card>

        <Card title="3. Ajustar stock (delta vs. set)" description="mode: delta suma o resta; mode: set fija la cantidad final. El motivo es obligatorio. Envía Idempotency-Key para reintentar sin duplicar.">
          <Code>{`curl -X POST ${BASE}/api/v1/inventory-adjustments \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "variantId": "VARIANT_ID",
    "locationId": "LOCATION_ID",
    "mode": "delta",
    "quantity": -3,
    "reason": "Venta en marketplace"
  }'

# Ajuste masivo (hasta 500) en una sola transacción
curl -X POST ${BASE}/api/v1/inventory-adjustments/bulk \\
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \\
  -H "Idempotency-Key: sync-2026-10-11-01" \\
  -d '{ "adjustments": [ { "variantId": "...", "locationId": "...", "mode": "set", "quantity": 40, "reason": "Sincronización ERP" } ] }'`}</Code>
        </Card>

        <Card title="4. Crear una venta" description="Descuenta stock y registra pagos. Si repites la misma Idempotency-Key con el mismo cuerpo recibirás la orden original con Idempotent-Replayed: true.">
          <Code>{`curl -X POST ${BASE}/api/v1/orders \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pedido-web-10492" \\
  -d '{
    "locationId": "LOCATION_ID",
    "externalRef": "WEB-10492",
    "items": [ { "variantId": "VARIANT_ID", "quantity": 2 } ],
    "payments": [ { "methodCode": "transfer", "amount": 90000, "reference": "TRX-889" } ]
  }'`}</Code>
        </Card>

        <Card title="5. Upsert de productos por SKU" description="Para sincronizar catálogos: si el SKU existe se actualiza el producto, si no se crea.">
          <Code>{`curl -X POST ${BASE}/api/v1/products/bulk \\
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \\
  -d '{ "products": [ { "title": "Camiseta básica", "taxRate": 19,
        "options": [ { "name": "Talla", "values": ["S","M"] } ],
        "variants": [ { "sku": "CAM-S", "price": 45000, "cost": 21000, "optionValues": { "Talla": "S" } },
                      { "sku": "CAM-M", "price": 45000, "cost": 21000, "optionValues": { "Talla": "M" } } ] } ] }'`}</Code>
        </Card>

        <Card title="6. Webhooks salientes" description="Suscríbete a eventos en Configuración → Webhooks. Cada entrega va firmada con HMAC-SHA256; reintentos con backoff exponencial (1 m, 5 m, 30 m, 2 h, 12 h).">
          <div className="mb-3 flex flex-wrap gap-1.5">{WebhookEvent.options.map((e) => <Badge key={e} tone="outline" title={webhookEventLabels[e]}>{e}</Badge>)}</div>
          <p className="mb-2 text-sm text-muted-foreground">Cabeceras: <code>X-Webhook-Id</code>, <code>X-Webhook-Event</code>, <code>X-Webhook-Timestamp</code> (unix) y <code>X-Webhook-Signature: sha256=&lt;hex&gt;</code>. La firma se calcula sobre <code>{"{timestamp}.{cuerpo_crudo}"}</code>.</p>
          <Code lang="js">{`// Node.js — verificación de firma
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhook(rawBody, headers, secret) {
  const ts = headers["x-webhook-timestamp"];
  const sig = (headers["x-webhook-signature"] || "").replace("sha256=", "");
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // 5 min de tolerancia
  const expected = createHmac("sha256", secret).update(\`\${ts}.\${rawBody}\`).digest("hex");
  return expected.length === sig.length && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
}`}</Code>
          <Code lang="json">{`{
  "id": "evt_...",
  "event": "inventory.updated",
  "created_at": "2026-10-11T20:00:00.000Z",
  "data": { "variant_id": "...", "sku": "CAM-M-BLA", "location_id": "...", "available": 17, "committed": 0, "unavailable": 1, "on_hand": 18, "incoming": 0, "source": "order" }
}`}</Code>
        </Card>
      </div>
    </Page>
  );
}
