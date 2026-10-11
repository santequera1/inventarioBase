# Proyecto: Sistema de inventario y ventas "Inventario Willy"

Eres un ingeniero full-stack senior con criterio de diseño de producto. Vas a construir, desplegar y versionar un sistema de inventario y ventas de calidad producción, directamente en este servidor. Trabaja de forma autónoma por fases, verifica cada fase antes de pasar a la siguiente y haz commits frecuentes.

## 1. Objetivo

Un sistema de inventario para una tienda física, con registro de ventas, cuya experiencia y estética se parezcan mucho al panel de administración de Shopify. Hay que copiar la **lógica de trabajo**, no solo los colores: navegación estable, tablas fáciles de explorar y acciones que dejan claro qué va a cambiar. La **API pública es un requisito central**, no un extra: otros sistemas deben poder enviar datos, consultarlos e integrarse por webhooks.

Moneda: COP (sin decimales en la UI, formato `$ 1.250.000`). Idioma de la interfaz: español (Colombia). Zona horaria: America/Bogota.

## 2. Stack (obligatorio)

- **Monorepo** con pnpm workspaces:
  - `apps/web` → React 18 + Vite + TypeScript estricto + Tailwind + **shadcn/ui** (Radix), TanStack Router o React Router, TanStack Query, TanStack Table, React Hook Form + Zod, lucide-react, sonner, Recharts.
  - `apps/api` → Node 20+ + TypeScript + **Fastify** (o Hono), Prisma o Drizzle, **PostgreSQL**.
  - `packages/shared` → esquemas Zod y tipos compartidos (una sola fuente de verdad para validación).
- Documentación OpenAPI 3.1 generada desde los esquemas, servida con Scalar o Swagger UI en `/api/docs`.
- Tests: Vitest. Lint: ESLint + Prettier.

## 3. Diseño visual — sobrio, compacto, sin "AI slop"

Usa como referencia de patrones a **Polaris** (el sistema de diseño de Shopify), implementado con shadcn/ui. No copies logos, íconos propietarios ni marcas de Shopify. Los datos tienen protagonismo, no la decoración.

**Tokens (defínelos como CSS variables del tema de shadcn y úsalos en todo el proyecto):**
- Fondo general `#F1F1F1`; tarjetas y tablas `#FFFFFF`.
- Texto principal `#303030`; texto secundario `#616161`; bordes `#E3E3E3`.
- Botón principal casi negro `#303030` con texto blanco. Botones secundarios blancos con borde gris. Acciones menores como botones de texto.
- El color se reserva para **comunicar estados** (éxito, advertencia, error). Nada de verde ni morado decorativo.
- Tipografía: Inter (o fuente del sistema). Texto y campos 14 px; títulos de página 24 px peso 600; encabezados de sección 16 px peso 600. Escala corta, no todo en negrita.
- Espaciado en múltiplos de 4 px: 24 px alrededor del contenido, 16–20 px dentro de tarjetas, 8–12 px entre controles relacionados.
- Superficies: bordes de 1 px, esquinas de 8–12 px, sombras muy suaves.
- Botones, buscadores y selectores con la misma altura (36–40 px en escritorio).
- Etiquetas de formulario **encima** del campo, nunca solo como placeholder.
- Íconos de un solo estilo (lucide), 16–20 px; las acciones importantes llevan texto, no solo ícono.
- Cifras con `font-variant-numeric: tabular-nums` para que las columnas no "bailen".

**Layout:**
- Barra lateral de ~240 px con pocas secciones orientadas al trabajo (Inicio, Productos, Inventario, Movimientos, Transferencias, Ventas/POS, Órdenes, Clientes, Proveedores, Reportes, Configuración). Ítem activo con fondo blanco y sombra sutil. Colapsa a drawer en móvil.
- Topbar con buscador global (Cmd/Ctrl+K con `cmdk`) y menú de usuario.
- Cada pantalla: título a la izquierda y **una** acción principal a la derecha (p. ej. en Inventario: "Ajustar inventario"; importar/exportar como secundarias).
- En listados, **una sola superficie blanca** que contiene vistas (pestañas), buscador, filtros y tabla. No pongas cada control en una tarjeta distinta.
- Título, filtros y contenido comparten exactamente los mismos márgenes.
- La pantalla de inicio no es un tablero de veinte indicadores: un resumen breve (ventas del día, stock bajo, movimientos recientes) con accesos directos. Los gráficos viven en Reportes.

**Tablas (el centro de la interfaz):**
- Encabezado discreto, separadores horizontales finos, filas de 52–60 px, fondo gris muy suave al pasar el cursor.
- Textos alineados a la izquierda, cantidades a la derecha. Producto y variante juntos en la misma celda (con miniatura).
- Ordenamiento en columnas relevantes, selección de filas con acciones en lote, paginación.
- Vistas guardadas por pestañas ("Todos", "Stock bajo", "Agotados", y personalizadas).
- Estados con badges pequeños de fondo tenue y texto oscuro: "Stock bajo" en ámbar, "Agotado" en gris. Nunca filas enteras coloreadas.
- En móvil, priorizar producto, SKU y disponible; el resto va al detalle.

**Estados de la interfaz (todos diseñados, no improvisados):** carga (skeletons), lista vacía con texto útil y acción, búsqueda sin resultados, errores y cambios sin guardar (barra contextual "Cambios sin guardar — Descartar / Guardar"). Los errores dicen cómo corregirse ("Introduce una cantidad entera", no "Valor inválido"). No depender solo del color: texto, foco de teclado visible y contraste AA.

**Evitar:** degradados, sombras fuertes, botones gigantes, bordes muy redondos, muchos colores, gráficos decorativos, emojis, lorem ipsum, tarjetas genéricas de "dashboard de IA".

**Componentes primero:** antes de multiplicar pantallas, crea una única versión de botones, campos, filtros, badges, tabla de datos, diálogos, toasts, encabezado de página y barra de cambios sin guardar. Todas las pantallas se construyen con ellos.

## 4. Modelo de inventario

Por cada variante y ubicación se manejan estas cantidades, con estos significados exactos:

- **Disponible**: lo que se puede vender.
- **Comprometido**: reservado (p. ej. órdenes sin entregar).
- **No disponible**: físicamente presente pero apartado (dañado, en revisión, etc.), con motivo.
- **En existencia** = Disponible + Comprometido + No disponible.
- **Entrante**: en camino (órdenes de compra/transferencias); **no** forma parte del stock físico.

Nunca uses una única columna llamada "Cantidad" ambigua. La tabla de inventario lleva: Producto/Variante | SKU | Disponible | Comprometido | No disponible | En existencia | Entrante.

**Libro mayor de movimientos inmutable** (append-only): cada cambio genera un movimiento con tipo (venta, ajuste, recepción, transferencia, devolución, conteo, cambio de estado), cantidad, estado afectado, motivo, usuario o API key, fecha y referencia al documento origen. El stock actual se deriva/concilia con este libro.

**Ajustes que previenen errores:**
- Diferenciar explícitamente **"Agregar o quitar unidades"** de **"Establecer cantidad final"**. Escribir "10" nunca debe dejar duda de si suma diez o deja el total en diez.
- Antes de guardar, vista previa del cambio: producto, ubicación, motivo y "Disponible: 24 → 19".
- Motivo obligatorio. Tras guardar, confirmación discreta (toast) sin interrumpir el trabajo.

## 5. Módulos funcionales

1. **Productos**: título, descripción, imágenes (subida local con miniaturas), categoría/colección, etiquetas, proveedor, estado (activo/borrador/archivado). Variantes con opciones (talla, color…), SKU único, código de barras, precio, precio comparado, costo, peso. Detalle en dos columnas: contenido a la izquierda, estado/organización a la derecha.
2. **Inventario**: listado con selector de ubicación, buscador (nombre, SKU, código de barras), filtros (ubicación, categoría, estado de existencias) y vistas guardadas. Ubicaciones múltiples, ajustes, transferencias, conteos físicos con diferencias, stock mínimo por variante/ubicación.
3. **Detalle de producto por ubicación** con su historial de movimientos.
4. **Historial de movimientos** global, filtrable y exportable.
5. **Órdenes de compra / recepciones** a proveedores (parciales o totales; alimentan "Entrante" y luego "Disponible", y actualizan costo).
6. **Ventas**:
   - **POS** rápido: búsqueda por nombre/SKU/código de barras (compatible con lector USB), carrito, descuentos, cliente opcional, IVA configurable por producto (0%, 5%, 19%), pagos combinables (efectivo con cambio, tarjeta, transferencia, Nequi, Daviplata; configurables).
   - **Órdenes** con estado de pago y entrega, línea de tiempo de eventos y notas.
   - Devoluciones y anulaciones que reingresan stock vía movimientos.
   - Recibo imprimible (ticket 80 mm y A4/PDF). Apertura y cierre de caja con arqueo.
7. **Clientes** (documento CC/NIT, historial, total gastado) y **Proveedores**.
8. **Reportes**: ventas por periodo, más vendidos, margen bruto, valorización del inventario (a costo y precio), rotación, productos sin movimiento, stock bajo. Filtros por fechas y ubicación. Export CSV.
9. **Importación/exportación CSV** con vista previa y errores por fila.
10. **Usuarios y roles** (administrador, inventario, vendedor; permisos granulares). Sesión con cookies httpOnly, contraseñas con argon2.
11. **Auditoría** de acciones relevantes.
12. **Configuración**: tienda, impuestos, métodos de pago, ubicaciones, motivos de ajuste, numeración de órdenes, API keys y webhooks.

**Prioridad de calidad:** las tres pantallas que deben quedar impecables antes que cualquier otra son el **listado de inventario**, el **detalle de producto por ubicación** y el **historial de movimientos**.

## 6. API pública (prioridad máxima)

- REST versionada en `/api/v1`, JSON. Recursos: products, variants, inventory-levels, inventory-movements, inventory-adjustments, transfers, locations, orders, customers, suppliers, purchase-orders, reports.
- Los ajustes por API también distinguen `mode: "delta"` vs `mode: "set"` y exigen motivo.
- **API keys** creadas desde la UI, con **scopes** (`read:products`, `write:inventory`, `write:orders`…), mostradas una sola vez, guardadas con hash, revocables, con último uso.
- **Idempotencia** con header `Idempotency-Key` en todos los POST que crean ventas, movimientos o ajustes.
- Paginación por cursor, filtros (`updated_since`, `sku`, `location_id`, `status`), ordenamiento, `expand`.
- Operaciones en lote (upsert de productos por SKU, ajuste masivo de stock) para sincronizaciones.
- **Webhooks salientes** (`inventory.updated`, `inventory.low_stock`, `order.created`, `order.cancelled`, `product.updated`…), firmados con HMAC-SHA256, reintentos con backoff exponencial, registro de entregas y reenvío manual desde la UI.
- Errores RFC 7807 (problem+json), códigos HTTP correctos, rate limiting por API key, CORS configurable.
- La app web consume esta misma API (dogfooding).
- OpenAPI completa con ejemplos y página "Desarrolladores" en la app con guía rápida y ejemplos curl.

## 7. Calidad e ingeniería

- Operaciones de stock y ventas en **transacciones** con bloqueo adecuado (dos ventas simultáneas del último ítem). Política de stock negativo configurable, por defecto no permitido.
- Validación Zod en ambos lados. Sin `any`.
- Tests de reglas críticas: venta descuenta stock, devolución reintegra, la fórmula de "En existencia" siempre cuadra, delta vs set, idempotencia, scopes, firma de webhooks, concurrencia.
- Seeds de demostración realistas (tienda colombiana) activables por comando, nunca por defecto en producción.
- Secretos solo en `.env`; incluir `.env.example`.
- Logs estructurados (pino), healthcheck `/api/health`, backups diarios de PostgreSQL con `pg_dump` y rotación.

## 8. Despliegue en este servidor

Dominio: **https://inventariowilly.botyventas.com** (configura HTTPS y redirige http → https).

1. Primero **inspecciona el servidor sin modificar nada**: SO, servidor web (nginx/Apache/cPanel/Plesk/Caddy), puertos ocupados, versiones de Node/PostgreSQL, gestor de procesos, sitios existentes. Resume lo encontrado antes de seguir.
2. **No rompas nada existente**: no edites configuraciones de otros sitios, valida antes de recargar (`nginx -t` o equivalente), no cambies versiones globales de Node si otros proyectos dependen de ellas (usa nvm/fnm).
3. Verifica el DNS (`dig +short inventariowilly.botyventas.com`). Si no resuelve a este servidor, detente en ese paso, dime qué registro crear y continúa con lo demás.
4. Base de datos y usuario PostgreSQL dedicados con contraseña fuerte.
5. Virtual host del subdominio: frontend compilado servido estático y `/api` como reverse proxy a un puerto interno libre.
6. SSL con Let's Encrypt (certbot o el mecanismo del panel), con renovación automática.
7. API con PM2 (o systemd), reinicio automático y arranque al boot.
8. Script `deploy.sh`: pull, install, migraciones, build, reinicio sin downtime.
9. Crea el primer administrador y entrégame las credenciales al final (fuera del repo).

## 9. Repositorio Git

El servidor ya tiene mis credenciales de GitHub. Repositorio vacío:

```
https://github.com/santequera1/inventarioBase.git
```

- Inicializa git, rama `main`, añade `origin` y haz push.
- `.gitignore` correcto (node_modules, dist, .env, uploads, backups, logs).
- Commits pequeños (Conventional Commits) al final de cada fase, con push.
- `README.md` completo: descripción, arquitectura, instalación local, variables de entorno, despliegue, API con ejemplos, webhooks y verificación de firma.

## 10. Orden de trabajo

1. Inspección del servidor + plan breve (arquitectura, modelo de datos, decisiones). Esqueleto del monorepo, commit y push.
2. Modelo de datos + migraciones + autenticación + roles.
3. API v1 con OpenAPI, API keys, idempotencia y tests.
4. Tokens de diseño + librería de componentes base + layout (sidebar, topbar, buscador).
5. Las tres pantallas clave: listado de inventario, detalle de producto por ubicación, historial de movimientos. Pulirlas antes de seguir.
6. Productos y variantes → ajustes, transferencias, conteos, ubicaciones.
7. POS y órdenes → caja → devoluciones.
8. Clientes, proveedores, órdenes de compra.
9. Reportes, importación/exportación, webhooks con UI de entregas, página de desarrolladores.
10. Despliegue, SSL, PM2, backups.
11. Verificación final.

Al terminar cada fase: tests y build, corrige lo que falle, commit y push.

## 11. Verificación final (obligatoria)

- `pnpm build` y tests en verde.
- En el dominio real: login, crear producto con variantes, ajustar stock en ambos modos (agregar/quitar y establecer total) comprobando la vista previa, marcar unidades como no disponibles, transferir, vender por POS, devolver, y comprobar que el libro de movimientos cuadra con el stock y que En existencia = Disponible + Comprometido + No disponible.
- API con curl: venta con el mismo `Idempotency-Key` dos veces (una sola creada), consulta de inventario, webhook recibido en un endpoint de prueba con firma validada.
- Revisión visual en escritorio y móvil contra los tokens de la sección 3: márgenes alineados, alturas iguales de controles, cantidades a la derecha con cifras tabulares, color solo en estados. Corrige lo que se vea genérico o desalineado.
- Resumen final: URL, credenciales del admin, cómo crear API keys, ubicación de logs y backups, y pendientes.