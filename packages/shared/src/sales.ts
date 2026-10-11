import { z } from "zod";
import { money, paginationQuery, taxRate } from "./common";
import {
  CashSessionStatus,
  DocumentType,
  FulfillmentStatus,
  OrderSource,
  OrderStatus,
  PaymentMethodType,
  PaymentStatus,
} from "./enums";
import { locationSchema } from "./catalog";

export const customerSchema = z.object({
  id: z.string(),
  documentType: DocumentType.nullable(),
  documentNumber: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  companyName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  notes: z.string().nullable(),
  tags: z.array(z.string()),
  ordersCount: z.number().int(),
  totalSpent: z.number().int(),
  lastOrderAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const createCustomerBody = z.object({
  documentType: DocumentType.nullable().optional(),
  documentNumber: z.string().nullable().optional(),
  firstName: z.string().min(1, "Introduce el nombre"),
  lastName: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  email: z.string().email("Introduce un correo válido").nullable().optional().or(z.literal("")),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});
export const updateCustomerBody = createCustomerBody.partial();
export const listCustomersQuery = paginationQuery.extend({
  q: z.string().optional(),
  updated_since: z.string().datetime({ offset: true }).optional(),
});

export const paymentMethodSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  type: PaymentMethodType,
  active: z.boolean(),
  position: z.number().int(),
  requiresReference: z.boolean(),
});
export const createPaymentMethodBody = z.object({
  name: z.string().min(1),
  code: z
    .string()
    .min(2)
    .regex(/^[a-z0-9_]+$/, "Usa solo minúsculas, números y guion bajo"),
  type: PaymentMethodType,
  active: z.boolean().default(true),
  requiresReference: z.boolean().default(false),
});
export const updatePaymentMethodBody = createPaymentMethodBody.partial();

export const orderLineInput = z.object({
  variantId: z.string().min(1),
  quantity: z.coerce.number().int().positive("Introduce una cantidad entera mayor que cero"),
  /** Precio unitario antes de impuestos; si se omite se usa el precio actual de la variante. */
  unitPrice: money.optional(),
  /** Descuento total de la línea en COP. */
  discount: money.default(0),
  taxRate: taxRate.optional(),
});
export const paymentInput = z.object({
  methodCode: z.string().min(1, "Selecciona un método de pago"),
  amount: money.describe("Monto aplicado a la orden"),
  received: money.optional().describe("Efectivo entregado por el cliente (para calcular el cambio)"),
  reference: z.string().nullable().optional(),
});
export const createOrderBody = z.object({
  locationId: z.string().min(1, "Selecciona la ubicación"),
  customerId: z.string().nullable().optional(),
  items: z.array(orderLineInput).min(1, "Añade al menos un producto"),
  /** Descuento global en COP sobre el subtotal. */
  discount: money.default(0),
  payments: z.array(paymentInput).default([]),
  note: z.string().max(1000).nullable().optional(),
  source: OrderSource.default("POS"),
  cashSessionId: z.string().nullable().optional(),
  /** Si true, la orden queda abierta (stock comprometido) hasta entregar. */
  hold: z.boolean().default(false),
  externalRef: z.string().nullable().optional(),
});
export type CreateOrderBody = z.infer<typeof createOrderBody>;

export const orderLineSchema = z.object({
  id: z.string(),
  variantId: z.string().nullable(),
  productTitle: z.string(),
  variantTitle: z.string(),
  sku: z.string(),
  quantity: z.number().int(),
  returnedQuantity: z.number().int(),
  unitPrice: z.number().int(),
  unitCost: z.number().int(),
  discount: z.number().int(),
  taxRate: z.number().int(),
  taxAmount: z.number().int(),
  subtotal: z.number().int(),
  total: z.number().int(),
  thumbUrl: z.string().nullable(),
});
export const orderPaymentSchema = z.object({
  id: z.string(),
  methodCode: z.string(),
  methodName: z.string(),
  amount: z.number().int(),
  received: z.number().int().nullable(),
  change: z.number().int(),
  reference: z.string().nullable(),
  kind: z.enum(["PAYMENT", "REFUND"]),
  createdAt: z.string(),
});
export const orderEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  message: z.string(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
});
export const orderSchema = z.object({
  id: z.string(),
  number: z.string(),
  status: OrderStatus,
  paymentStatus: PaymentStatus,
  fulfillmentStatus: FulfillmentStatus,
  source: OrderSource,
  locationId: z.string(),
  location: locationSchema.pick({ id: true, name: true }).optional(),
  customerId: z.string().nullable(),
  customer: customerSchema
    .pick({ id: true, firstName: true, lastName: true, documentNumber: true, email: true, phone: true })
    .nullable()
    .optional(),
  subtotal: z.number().int(),
  discountTotal: z.number().int(),
  taxTotal: z.number().int(),
  total: z.number().int(),
  paidTotal: z.number().int(),
  refundedTotal: z.number().int(),
  itemCount: z.number().int(),
  note: z.string().nullable(),
  externalRef: z.string().nullable(),
  cashSessionId: z.string().nullable(),
  createdByName: z.string().nullable(),
  items: z.array(orderLineSchema),
  payments: z.array(orderPaymentSchema),
  events: z.array(orderEventSchema).optional(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Order = z.infer<typeof orderSchema>;

export const listOrdersQuery = paginationQuery.extend({
  q: z.string().optional(),
  status: OrderStatus.optional(),
  payment_status: PaymentStatus.optional(),
  fulfillment_status: FulfillmentStatus.optional(),
  location_id: z.string().optional(),
  customer_id: z.string().optional(),
  source: OrderSource.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  updated_since: z.string().datetime({ offset: true }).optional(),
  expand: z.string().optional(),
});

export const addPaymentBody = z.object({ payments: z.array(paymentInput).min(1) });
export const cancelOrderBody = z.object({
  reason: z.string().min(2, "Introduce el motivo de la anulación"),
  refund: z.boolean().default(true),
  refundMethodCode: z.string().optional(),
});
export const returnOrderBody = z.object({
  items: z
    .array(
      z.object({
        lineId: z.string(),
        quantity: z.coerce.number().int().positive("Introduce una cantidad entera mayor que cero"),
        restock: z.boolean().default(true),
        /** Si restock es true: si la unidad vuelve como disponible o no disponible (dañada). */
        restockAs: z.enum(["AVAILABLE", "UNAVAILABLE"]).default("AVAILABLE"),
      }),
    )
    .min(1, "Selecciona al menos un artículo"),
  reason: z.string().min(2, "Introduce el motivo de la devolución"),
  refundAmount: money.optional().describe("Si se omite se calcula proporcionalmente"),
  refundMethodCode: z.string().optional(),
  note: z.string().optional(),
});
export const addOrderNoteBody = z.object({ message: z.string().min(1).max(2000) });

export const cashSessionSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  location: locationSchema.pick({ id: true, name: true }).optional(),
  status: CashSessionStatus,
  openedById: z.string(),
  openedByName: z.string().nullable(),
  closedByName: z.string().nullable(),
  openingAmount: z.number().int(),
  expectedAmount: z.number().int().nullable(),
  closingAmount: z.number().int().nullable(),
  difference: z.number().int().nullable(),
  cashSales: z.number().int(),
  cashRefunds: z.number().int(),
  cashIn: z.number().int(),
  cashOut: z.number().int(),
  ordersCount: z.number().int(),
  salesTotal: z.number().int(),
  byMethod: z.array(z.object({ methodCode: z.string(), methodName: z.string(), total: z.number().int() })),
  note: z.string().nullable(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
});
export const openCashSessionBody = z.object({
  locationId: z.string().min(1),
  openingAmount: money,
  note: z.string().optional(),
});
export const closeCashSessionBody = z.object({
  closingAmount: money,
  note: z.string().optional(),
});
export const cashMovementBody = z.object({
  type: z.enum(["IN", "OUT"]),
  amount: money.refine((n) => n > 0, "Introduce un monto mayor que cero"),
  reason: z.string().min(2, "Introduce el motivo"),
});
export const listCashSessionsQuery = paginationQuery.extend({
  location_id: z.string().optional(),
  status: CashSessionStatus.optional(),
});
