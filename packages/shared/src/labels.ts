/** Etiquetas en español para enums (una sola fuente para UI y recibos). */
export const movementTypeLabels: Record<string, string> = {
  SALE: "Venta",
  ADJUSTMENT: "Ajuste",
  RECEIPT: "Recepción",
  TRANSFER_OUT: "Transferencia (salida)",
  TRANSFER_IN: "Transferencia (entrada)",
  RETURN: "Devolución",
  COUNT: "Conteo",
  STATE_CHANGE: "Cambio de estado",
  RESERVATION: "Reserva",
  CANCELLATION: "Anulación",
  PURCHASE_INCOMING: "Orden de compra",
};
export const bucketLabels: Record<string, string> = {
  AVAILABLE: "Disponible",
  COMMITTED: "Comprometido",
  UNAVAILABLE: "No disponible",
  INCOMING: "Entrante",
};
export const productStatusLabels: Record<string, string> = {
  ACTIVE: "Activo",
  DRAFT: "Borrador",
  ARCHIVED: "Archivado",
};
export const orderStatusLabels: Record<string, string> = {
  OPEN: "Abierta",
  COMPLETED: "Completada",
  CANCELLED: "Anulada",
};
export const paymentStatusLabels: Record<string, string> = {
  PENDING: "Pendiente de pago",
  PARTIAL: "Pago parcial",
  PAID: "Pagada",
  REFUNDED: "Reembolsada",
  PARTIALLY_REFUNDED: "Reembolso parcial",
};
export const fulfillmentStatusLabels: Record<string, string> = {
  UNFULFILLED: "Sin entregar",
  FULFILLED: "Entregada",
  PARTIALLY_RETURNED: "Devolución parcial",
  RETURNED: "Devuelta",
};
export const transferStatusLabels: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  IN_TRANSIT: "En tránsito",
  RECEIVED: "Recibida",
  CANCELLED: "Cancelada",
};
export const purchaseStatusLabels: Record<string, string> = {
  DRAFT: "Borrador",
  ORDERED: "Pedida",
  PARTIAL: "Recepción parcial",
  RECEIVED: "Recibida",
  CANCELLED: "Cancelada",
};
export const countStatusLabels: Record<string, string> = {
  OPEN: "Abierto",
  APPLIED: "Aplicado",
  CANCELLED: "Cancelado",
};
export const deliveryStatusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  SUCCESS: "Entregado",
  FAILED: "Fallido",
  RETRYING: "Reintentando",
};
export const permissionLabels: Record<string, string> = {
  "products.read": "Ver productos",
  "products.write": "Crear y editar productos",
  "inventory.read": "Ver inventario",
  "inventory.adjust": "Ajustar inventario",
  "inventory.transfer": "Transferir inventario",
  "inventory.count": "Hacer conteos",
  "purchases.read": "Ver órdenes de compra",
  "purchases.write": "Crear y recibir órdenes de compra",
  "orders.read": "Ver órdenes",
  "orders.write": "Crear órdenes",
  "orders.refund": "Devoluciones y anulaciones",
  "pos.use": "Usar el POS",
  "cash.manage": "Abrir y cerrar caja",
  "customers.read": "Ver clientes",
  "customers.write": "Crear y editar clientes",
  "suppliers.read": "Ver proveedores",
  "suppliers.write": "Crear y editar proveedores",
  "reports.read": "Ver reportes",
  "settings.manage": "Administrar configuración",
  "users.manage": "Administrar usuarios y roles",
  "apikeys.manage": "Administrar API keys",
  "webhooks.manage": "Administrar webhooks",
  "audit.read": "Ver auditoría",
  "import.run": "Importar y exportar datos",
};
export const scopeLabels: Record<string, string> = {
  "read:products": "Leer productos y variantes",
  "write:products": "Crear y editar productos",
  "read:inventory": "Leer niveles y movimientos",
  "write:inventory": "Ajustes, transferencias y conteos",
  "read:orders": "Leer órdenes",
  "write:orders": "Crear órdenes, devoluciones y anulaciones",
  "read:customers": "Leer clientes",
  "write:customers": "Crear y editar clientes",
  "read:suppliers": "Leer proveedores y órdenes de compra",
  "write:suppliers": "Crear proveedores y órdenes de compra",
  "read:reports": "Leer reportes",
  "read:locations": "Leer ubicaciones",
  "write:webhooks": "Administrar webhooks",
};
export const webhookEventLabels: Record<string, string> = {
  "inventory.updated": "Inventario actualizado",
  "inventory.low_stock": "Stock bajo",
  "product.created": "Producto creado",
  "product.updated": "Producto actualizado",
  "product.deleted": "Producto eliminado",
  "order.created": "Orden creada",
  "order.paid": "Orden pagada",
  "order.cancelled": "Orden anulada",
  "order.returned": "Devolución registrada",
  "transfer.received": "Transferencia recibida",
  "purchase_order.received": "Orden de compra recibida",
};
