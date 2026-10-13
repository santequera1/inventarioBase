# Inventario Willy — Documentación de uso

Versión 1.0 · Octubre 2026 · https://inventariowilly.botyventas.com

Esta guía explica cómo trabajar día a día con el sistema. La documentación técnica (instalación, variables, despliegue, API) está en [`README.md`](README.md); la referencia completa de la API, con ejemplos, en `/api/docs`.

---

## 1. Acceso y roles

- Entra en **https://inventariowilly.botyventas.com** con tu correo y contraseña. La sesión dura 30 días en el navegador.
- Cambia tu contraseña en el menú de usuario (arriba a la derecha) → **Mi cuenta y contraseña**.
- Roles incluidos:

| Rol | Puede |
| --- | --- |
| **ADMIN** | Todo, incluida configuración, usuarios, API keys y webhooks |
| **INVENTARIO** | Productos, inventario, ajustes, transferencias, conteos, compras, proveedores, reportes |
| **VENDEDOR** | POS, órdenes, caja, clientes (lectura de productos e inventario) |

Un administrador puede crear roles con permisos a medida en **Configuración → Usuarios y roles**.

**Atajos**: `Ctrl/⌘ + K` abre el buscador global (productos, SKU, órdenes, clientes y navegación). En el POS: `F2` enfoca el buscador y `F9` abre el cobro.

---

## 2. Conceptos de inventario

Por cada **variante** (p. ej. Camiseta · Talla M · Blanco) y **ubicación** (tienda o bodega) se llevan cinco cantidades:

| Cantidad | Significado |
| --- | --- |
| **Disponible** | Lo que se puede vender ahora |
| **Comprometido** | Reservado por órdenes "en espera" aún no entregadas |
| **No disponible** | Está físicamente, pero apartado: dañado, en revisión, exhibición… (siempre con motivo) |
| **En existencia** | Disponible + Comprometido + No disponible (lo que hay físicamente) |
| **Entrante** | Viene en camino (órdenes de compra pedidas, transferencias despachadas). **No** es stock físico |

Todo cambio queda en el **historial de movimientos**, que es inmutable: nunca se edita ni se borra. Cada movimiento registra tipo, cantidad con signo, estado afectado, motivo, usuario (o API key), fecha, documento origen y el saldo que quedó. El stock actual siempre coincide con la suma del historial; en Configuración → Tienda hay un botón **Conciliar** que lo comprueba.

---

## 3. Productos

**Productos → Agregar producto**

1. Título y descripción.
2. Imágenes (JPG, PNG o WEBP). La primera es la miniatura.
3. **Precio, precio con descuento (opcional), costo por unidad e IVA** (0 %, 5 % o 19 %). Si llenas el precio con descuento, el producto se vende a ese precio y el precio normal aparece tachado en los catálogos. El costo solo sirve para calcular tu ganancia (se muestra debajo). Los precios incluyen IVA; el recibo lo desglosa.
4. **Variantes**: si el producto tiene tallas, colores, etc., pulsa **Añadir opción** (hasta 3: por ejemplo Talla, Color y Material).
   - Escribe el nombre de la opción (puedes cambiar el sugerido).
   - Escribe cada valor y pulsa **Enter**, coma o el botón **Añadir**. Puedes pegar varios separados por coma: `S, M, L, XL`.
   - Las variantes se generan solas combinando los valores (Talla S / Color Rojo, Talla M / Color Rojo…). Cada una tiene su **SKU** (único), código de barras, precio, costo y peso. Al añadir una segunda opción a un producto que ya existía, las variantes originales conservan su SKU y su stock en el primer valor nuevo.
   - Si una variante ya no se vende, desactívala con el interruptor en lugar de borrarla: así conserva su historial.
5. Estado: **Activo** (se puede vender), **Borrador** o **Archivado**.
6. Categoría, proveedor y etiquetas (a la derecha). Puedes crear categorías desde el mismo formulario.
7. **Stock inicial** (solo al crear): la cantidad por variante entra en la ubicación predeterminada como un ajuste con motivo "Stock inicial".

Guarda con el botón **Guardar** o con la barra "Cambios sin guardar" que aparece arriba al editar.

Los SKU deben ser únicos en toda la tienda. Si uno ya existe, el sistema te lo indica en el campo.

---

## 4. Inventario

**Inventario** muestra, por ubicación, la tabla: Producto/Variante · SKU · No disponible · Comprometido · **Disponible** · En existencia · Entrante.

- Cambia de ubicación con el selector de arriba a la derecha ("Todas" para ver todo).
- Pestañas **Todos / Stock bajo / Agotados**; búsqueda por nombre, SKU o código de barras; filtro por categoría. Puedes guardar la combinación actual como una **vista** (pestaña propia) con **Guardar vista**.
- Haz clic en una fila para abrir el **detalle por ubicación**: cantidades, historial de movimientos de esa variante en esa ubicación, valor a costo y a precio, stock mínimo y stock en las demás ubicaciones.

### 4.1 Ajustar inventario

Botón **Ajustar inventario** (o clic en el número de "Disponible" de una fila).

1. Busca el producto y elige la ubicación.
2. Elige el **tipo de ajuste**, que es lo más importante:
   - **Agregar o quitar unidades**: escribe `+10` para sumar o `-3` para restar.
   - **Establecer cantidad final**: el total quedará exactamente en lo que escribas. Escribir `10` deja 10, sin importar cuánto había.
3. Elige el estado a ajustar (Disponible o No disponible), el **motivo** (obligatorio) y una nota opcional.
4. Revisa la **vista previa**: "Disponible: 24 → 19" y "En existencia: 24 → 19".
5. **Guardar**. Verás una confirmación discreta abajo.

Para varias filas a la vez: selecciónalas con las casillas y usa **Ajustar seleccionados** (una cantidad por fila, mismo motivo).

### 4.2 Marcar unidades como no disponibles

En el detalle de la variante, **Marcar como no disponible** mueve unidades entre Disponible y No disponible sin cambiar la existencia total (ej. 3 unidades dañadas). El camino inverso ("No disponible → Disponible") sirve cuando se reparan o aprueban.

### 4.3 Stock mínimo

Por defecto, un producto aparece como **Stock bajo** cuando su disponible es ≤ al umbral global (Configuración → Tienda, por defecto 5). Puedes fijar un mínimo propio por variante y ubicación desde el lápiz en el detalle. Al cruzar el mínimo se emite el webhook `inventory.low_stock`.

### 4.4 Transferencias entre ubicaciones

**Transferencias → Crear transferencia**: origen, destino y productos con cantidad.

- **Guardar como pendiente**: no toca el stock todavía.
- **Crear y despachar**: descuenta Disponible en el origen y suma **Entrante** en el destino.
- Cuando llega la mercancía, abre la transferencia y pulsa **Recibir** (total o parcial): Entrante pasa a Disponible en el destino.
- **Cancelar** una transferencia en tránsito devuelve lo no recibido al origen.

### 4.5 Conteos físicos

**Inventario → Más acciones → Conteos físicos → Nuevo conteo**.

1. Elige la ubicación y añade los productos contados; el sistema toma el Disponible actual como "esperado".
2. Escribe lo contado y guarda. Puedes seguir editando mientras el conteo está **abierto**.
3. **Aplicar conteo** ajusta cada producto a lo contado (modo "cantidad final") con un movimiento tipo **Conteo**, para que la diferencia quede justificada.

### 4.6 Historial de movimientos

**Movimientos** muestra el libro mayor completo: pestañas por tipo (ventas y devoluciones, ajustes y conteos, recepciones, transferencias), filtros por tipo, estado afectado y fechas, búsqueda por producto, motivo, referencia o usuario, y **Exportar CSV**. Cada referencia (#1001, TR-0001, OC-0001, CT-0001) enlaza al documento origen.

---

## 5. Compras y proveedores

**Proveedores**: nombre, NIT, contacto, teléfono, correo y notas.

**Órdenes de compra (Proveedores → Órdenes de compra → Crear)**:

1. Proveedor, ubicación de destino, productos con cantidad y costo unitario, referencia del proveedor y fecha estimada.
2. **Guardar borrador** (sin efecto en stock) o **Crear y marcar como pedida**: las cantidades aparecen como **Entrante**.
3. Al llegar, **Recibir mercancía** (parcial o total). Lo recibido pasa a Disponible y el **costo** del producto se actualiza con promedio ponderado.
4. **Cancelar** retira de Entrante lo pendiente.

---

## 6. Ventas

### 6.1 Caja

**Ventas / POS → Caja** (o la alerta amarilla del POS):

- **Abrir caja** con la base de efectivo.
- Durante el día: **Registrar entrada / salida** de efectivo con motivo (p. ej. pago a domiciliario).
- **Cerrar caja**: escribe el efectivo contado; el sistema calcula el esperado (base + ventas en efectivo − reembolsos + entradas − salidas) y la diferencia. Los cierres quedan en el historial.

Las ventas en efectivo se asocian a la caja abierta de la ubicación. Puedes vender sin caja abierta, pero no quedarán en un arqueo.

### 6.2 Punto de venta (POS)

1. **Escanea** el código de barras o escribe nombre/SKU (`F2`). Con lector USB, el producto se añade al carrito automáticamente al coincidir el código.
2. Ajusta cantidad, precio o descuento por línea; descuento global en el resumen. El IVA se calcula por producto.
3. Opcional: **cliente** (buscar o crear al vuelo) y nota.
4. **Cobrar** (`F9`): elige el método (efectivo, tarjeta, transferencia, Nequi, Daviplata…). En efectivo escribe lo recibido y verás el **cambio**. Puedes **combinar varios métodos**; si queda saldo, la orden se registra como pago parcial.
5. **Completar venta**: el stock se descuenta y aparece la opción de **imprimir** el recibo.
6. **Dejar en espera**: crea la orden abierta y **compromete** el stock sin venderlo todavía; se entrega después desde la orden.

### 6.3 Órdenes

**Órdenes** lista todas las ventas con estado (abierta/completada/anulada), pago (pendiente, parcial, pagada, reembolsada) y entrega. Pestañas, filtros por estado y fecha, búsqueda por número, cliente o SKU, y exportación CSV.

En el detalle de una orden:

- **Marcar como entregada** (órdenes en espera): el comprometido pasa a vendido.
- **Registrar pago** si hay saldo pendiente.
- **Devolución**: elige artículos y cantidades, si reingresan al stock (como disponibles o como no disponibles si vienen dañados), motivo y monto a reembolsar (por defecto proporcional).
- **Anular**: reingresa todo lo no devuelto y reembolsa lo pagado.
- **Línea de tiempo** con cada evento y notas internas.
- **Imprimir recibo**: ticket 80 mm por defecto; en la vista del recibo puedes cambiar a A4 y guardar como PDF con `Ctrl + P`.

---

## 7. Clientes

Nombre, documento (CC, NIT, CE…), empresa, contacto y notas. En cada cliente se ve el historial de órdenes, el número de compras, el total gastado y la última compra. Se pueden crear desde el POS en plena venta.

---

## 8. Reportes

**Reportes** (filtro por ubicación y, en ventas, por rango de fechas con atajos Hoy / 7 / 30 / 90 días):

- **Ventas**: netas, margen bruto, IVA recaudado, devoluciones, descuentos, ticket promedio, serie por día/semana/mes y total por método de pago.
- **Más vendidos**: unidades, ventas netas y margen por variante.
- **Valorización**: unidades en existencia, valor a costo y a precio, margen potencial; desglose por ubicación y categoría.
- **Stock bajo**, **Sin movimiento** (con existencia y sin ventas en 30 días) y **Rotación** (vendidos / stock promedio). Todos con **Exportar CSV**.

---

## 9. Importar y exportar

**Configuración → Importar CSV**: elige el tipo (productos, ajustes de inventario o clientes), descarga la **plantilla**, súbela rellena y revisa la **vista previa**: cada fila indica si se creará, actualizará u omitirá, y los errores concretos ("Precio inválido…"). Solo se importan las filas válidas al confirmar.

- Productos: una fila por variante; las filas con el mismo título se agrupan en un producto con sus opciones (`opcion1_nombre`, `opcion1_valor`, `opcion2_*`). Si el SKU existe, se actualiza.
- Ajustes de inventario: `sku`, `ubicacion`, `cantidad`, `modo` (`set` o `delta`) y `motivo`.
- Clientes: se actualizan por número de documento.

Exportaciones CSV disponibles en Productos, Inventario, Movimientos, Órdenes, Clientes y Reportes.

---

## 10. Configuración

| Sección | Qué se configura |
| --- | --- |
| **Tienda e impuestos** | Nombre, razón social, NIT, dirección, pie del recibo; IVA por defecto; precios con IVA incluido; **permitir stock negativo** (desactivado por defecto); umbral global de stock bajo; prefijo y siguiente número de orden; botón de conciliación |
| **Ubicaciones** | Tiendas y bodegas; una es la predeterminada (POS y stock inicial) |
| **Métodos de pago** | Activar/desactivar, crear nuevos (tipo efectivo, tarjeta, transferencia, billetera), exigir referencia |
| **Motivos de ajuste** | Listas para ajustes, para marcar no disponible y para devoluciones |
| **Usuarios y roles** | Crear usuarios, asignar rol y ubicación por defecto, desactivar; crear roles con permisos granulares |
| **API keys** | Credenciales para integraciones con alcances (scopes); el token se muestra una sola vez; revocar |
| **Webhooks** | URL, eventos, secreto (HMAC-SHA256), prueba, registro de entregas y reenvío |
| **Auditoría** | Quién hizo qué y cuándo (antes/después) |

---

## 11. Integraciones (resumen)

La página **Desarrolladores** de la app contiene la guía rápida con ejemplos `curl` y el código para verificar la firma de los webhooks. Puntos clave:

- Base: `https://inventariowilly.botyventas.com/api/v1`, autenticación `Authorization: Bearer iw_live_…`.
- Recursos: productos, variantes, niveles y movimientos de inventario, ajustes (`mode: delta|set`), transferencias, conteos, ubicaciones, órdenes, clientes, proveedores, órdenes de compra, reportes.
- Envía `Idempotency-Key` en los POST para poder reintentar sin duplicar ventas ni ajustes.
- Paginación por cursor y filtro `updated_since` para sincronizaciones incrementales.
- Webhooks: `inventory.updated`, `inventory.low_stock`, `order.created`, `order.paid`, `order.cancelled`, `order.returned`, `product.*`, `transfer.received`, `purchase_order.received`.

---

## 12. Operación del servidor (para el administrador técnico)

- Código: `/home/ubuntu/apps/inventariowilly` (GitHub: `santequera1/inventarioBase`).
- Desplegar una nueva versión: `cd /home/ubuntu/apps/inventariowilly && ./deploy.sh`.
- Proceso de la API: `pm2 status inventariowilly-api`, logs con `pm2 logs inventariowilly-api` o en `logs/`.
- Backups automáticos cada día a las 2:30 en `backups/` (base de datos e imágenes, 14 días). Restaurar: `scripts/restore.sh backups/db-FECHA.dump`.
- Datos de demostración (solo para pruebas, nunca en producción): `DEMO_SEED=1 pnpm db:seed:demo`.
- Salud: `https://inventariowilly.botyventas.com/api/health`.

---

## 13. Preguntas frecuentes

**Escribí 10 en un ajuste y el stock quedó en 10, no sumó 10.** Estaba seleccionado "Establecer cantidad final". Para sumar usa "Agregar o quitar unidades" con `+10`. La vista previa siempre muestra el resultado antes de guardar.

**No me deja vender: "Stock insuficiente".** La política de stock negativo está desactivada (recomendado). Ajusta el inventario o actívala en Configuración → Tienda.

**¿Por qué "En existencia" no baja al despachar una transferencia?** Sí baja en el origen; en el destino sube "Entrante" hasta que se reciba. Entrante no forma parte de la existencia.

**Borré una variante y sigue apareciendo.** Las variantes con historial no se borran: se desactivan para conservar los movimientos. Lo mismo ocurre con productos (se archivan) y ubicaciones con movimientos.

**No encuentro un producto en el POS.** Solo se venden productos **activos** con variantes activas. Revisa el estado en Productos.
