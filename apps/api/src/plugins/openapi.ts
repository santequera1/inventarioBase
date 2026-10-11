import fp from "fastify-plugin";
import swagger from "@fastify/swagger";
import scalar from "@scalar/fastify-api-reference";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

export default fp(async (app) => {
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Inventario Willy — API",
        version: "1.0.0",
        description: [
          "API REST para inventario, catálogo y ventas. Todas las respuestas son JSON; los errores siguen RFC 7807 (`application/problem+json`).",
          "",
          "**Autenticación**: envía `Authorization: Bearer iw_live_...` (API key con scopes) o usa la sesión de la app web (cookie).",
          "",
          "**Idempotencia**: en los `POST` que crean órdenes, ajustes, transferencias o conteos puedes enviar `Idempotency-Key: <uuid>`. Si repites la misma clave con el mismo cuerpo recibirás la respuesta original con `Idempotent-Replayed: true`.",
          "",
          "**Paginación**: por cursor. Usa `limit` y `cursor` (de `meta.next_cursor`). Filtra con `updated_since`, `sku`, `location_id`, `status` según el recurso; ordena con `sort=campo:asc|desc`; expande relaciones con `expand=a,b`.",
          "",
          "**Webhooks**: firmados con HMAC-SHA256 en `X-Webhook-Signature` (ver guía en la página Desarrolladores).",
        ].join("\n"),
      },
      servers: [{ url: app.config.PUBLIC_URL, description: "Producción" }],
      components: {
        securitySchemes: {
          apiKey: { type: "http", scheme: "bearer", bearerFormat: "iw_live_<prefix>.<secret>" },
          session: { type: "apiKey", in: "cookie", name: "iw_session" },
        },
      },
      security: [{ apiKey: [] }, { session: [] }],
      tags: [
        { name: "Auth", description: "Sesión de usuario (solo app web)" },
        { name: "Products", description: "Productos y variantes" },
        { name: "Inventory", description: "Niveles, ajustes y movimientos" },
        { name: "Transfers" },
        { name: "Counts", description: "Conteos físicos" },
        { name: "Locations" },
        { name: "Orders", description: "Ventas, pagos, devoluciones" },
        { name: "Cash", description: "Apertura y cierre de caja" },
        { name: "Customers" },
        { name: "Suppliers" },
        { name: "PurchaseOrders" },
        { name: "Reports" },
        { name: "Settings" },
        { name: "ApiKeys" },
        { name: "Webhooks" },
        { name: "Imports" },
        { name: "System" },
      ],
    },
    transform: jsonSchemaTransform,
    hideUntagged: false,
  });

  await app.register(scalar, {
    routePrefix: "/api/docs",
    configuration: {
      theme: "default",
      hideModels: false,
      metaData: { title: "Inventario Willy — API" },
      defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
    },
  });

  app.get("/api/openapi.json", { schema: { hide: true } }, async () => app.swagger());
});
