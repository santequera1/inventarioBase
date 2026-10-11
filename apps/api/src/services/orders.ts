import type { CreateOrderBody } from "@inventario/shared";
import type { Tx } from "../lib/prisma";
import { E } from "../lib/errors";
import type { Actor } from "../lib/actor";
import { nextOrderNumber } from "../lib/numbering";
import { applyMovements, type MovementInput } from "./inventory";

export const orderInclude = {
  location: { select: { id: true, name: true } },
  customer: { select: { id: true, firstName: true, lastName: true, documentNumber: true, email: true, phone: true } },
  items: true,
  payments: { orderBy: { createdAt: "asc" as const } },
  events: { orderBy: { createdAt: "asc" as const } },
} as const;

type OrderRow = {
  id: string; number: string; status: string; paymentStatus: string; fulfillmentStatus: string; source: string; locationId: string; customerId: string | null;
  subtotal: number; discountTotal: number; taxTotal: number; total: number; paidTotal: number; refundedTotal: number; note: string | null; externalRef: string | null; cashSessionId: string | null; createdByName: string | null;
  completedAt: Date | null; cancelledAt: Date | null; createdAt: Date; updatedAt: Date;
  location?: { id: string; name: string }; customer?: { id: string; firstName: string; lastName: string | null; documentNumber: string | null; email: string | null; phone: string | null } | null;
  items: { id: string; variantId: string | null; productTitle: string; variantTitle: string; sku: string; quantity: number; returnedQuantity: number; unitPrice: number; unitCost: number; discount: number; taxRate: number; taxAmount: number; subtotal: number; total: number; thumbPath: string | null }[];
  payments: { id: string; methodCode: string; methodName: string; amount: number; received: number | null; change: number; reference: string | null; kind: string; createdAt: Date }[];
  events?: { id: string; type: string; message: string; actorName: string | null; createdAt: Date }[];
};

export function serializeOrder(o: OrderRow) {
  return {
    id: o.id, number: o.number, status: o.status as "OPEN", paymentStatus: o.paymentStatus as "PAID", fulfillmentStatus: o.fulfillmentStatus as "FULFILLED", source: o.source as "POS",
    locationId: o.locationId, location: o.location, customerId: o.customerId, customer: o.customer ?? null,
    subtotal: o.subtotal, discountTotal: o.discountTotal, taxTotal: o.taxTotal, total: o.total, paidTotal: o.paidTotal, refundedTotal: o.refundedTotal,
    itemCount: o.items.reduce((a, i) => a + i.quantity, 0),
    note: o.note, externalRef: o.externalRef, cashSessionId: o.cashSessionId, createdByName: o.createdByName,
    items: o.items.map((i) => ({ ...i, thumbUrl: i.thumbPath ? `/uploads/${i.thumbPath}` : null })),
    payments: o.payments.map((p) => ({ ...p, kind: p.kind as "PAYMENT", createdAt: p.createdAt.toISOString() })),
    events: o.events?.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    completedAt: o.completedAt?.toISOString() ?? null, cancelledAt: o.cancelledAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(),
  };
}

/** Reparte un descuento global entre líneas proporcionalmente, sin perder pesos por redondeo. */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const out = weights.map((w) => Math.floor((total * w) / sum));
  let rest = total - out.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0 && i < out.length; i++) {
    if (weights[i]! > 0) {
      out[i]!++;
      rest--;
    }
  }
  return out;
}

export type ComputedLine = {
  variantId: string; productTitle: string; variantTitle: string; sku: string; quantity: number; unitPrice: number; unitCost: number; discount: number; taxRate: number; taxAmount: number; subtotal: number; total: number; thumbPath: string | null; trackInventory: boolean;
};

export function computeTotals(
  lines: { variantId: string; quantity: number; unitPrice: number; discount: number; taxRate: number; unitCost: number; productTitle: string; variantTitle: string; sku: string; thumbPath: string | null; trackInventory: boolean }[],
  globalDiscount: number,
  pricesIncludeTax: boolean,
) {
  const subtotals = lines.map((l) => l.unitPrice * l.quantity);
  const afterLine = lines.map((l, i) => Math.max(0, subtotals[i]! - l.discount));
  const totalAfterLine = afterLine.reduce((a, b) => a + b, 0);
  const gd = Math.min(globalDiscount, totalAfterLine);
  const alloc = allocate(gd, afterLine);
  const computed: ComputedLine[] = lines.map((l, i) => {
    const discount = l.discount + alloc[i]!;
    const net = Math.max(0, subtotals[i]! - discount);
    const taxAmount = pricesIncludeTax ? net - Math.round(net / (1 + l.taxRate / 100)) : Math.round((net * l.taxRate) / 100);
    const total = pricesIncludeTax ? net : net + taxAmount;
    return { ...l, discount, taxAmount, subtotal: subtotals[i]!, total };
  });
  const subtotal = subtotals.reduce((a, b) => a + b, 0);
  const discountTotal = computed.reduce((a, l) => a + l.discount, 0);
  const taxTotal = computed.reduce((a, l) => a + l.taxAmount, 0);
  const total = computed.reduce((a, l) => a + l.total, 0);
  const costTotal = computed.reduce((a, l) => a + l.unitCost * l.quantity, 0);
  return { lines: computed, subtotal, discountTotal, taxTotal, total, costTotal };
}

export async function createOrder(tx: Tx, body: CreateOrderBody, actor: Actor, settings: { allowNegativeStock: boolean; pricesIncludeTax: boolean; defaultTaxRate: number }) {
  const location = await tx.location.findUnique({ where: { id: body.locationId } });
  if (!location || !location.active) throw E.validation("La ubicación no existe o está inactiva.", [{ path: "locationId", message: "Selecciona una ubicación válida." }]);
  if (body.customerId) {
    const c = await tx.customer.findUnique({ where: { id: body.customerId } });
    if (!c) throw E.validation("El cliente no existe.", [{ path: "customerId", message: "Selecciona un cliente válido." }]);
  }
  if (body.cashSessionId) {
    const cs = await tx.cashSession.findUnique({ where: { id: body.cashSessionId } });
    if (!cs || cs.status !== "OPEN") throw E.validation("La sesión de caja no está abierta.", [{ path: "cashSessionId", message: "Abre la caja antes de vender." }]);
  }
  // Consolidar líneas con la misma variante y mismo precio
  const variantIds = [...new Set(body.items.map((i) => i.variantId))];
  const variants = await tx.variant.findMany({ where: { id: { in: variantIds } }, include: { product: { include: { images: { orderBy: { position: "asc" }, take: 1 } } }, image: true } });
  const vmap = new Map(variants.map((v) => [v.id, v]));
  const rawLines = body.items.map((i, idx) => {
    const v = vmap.get(i.variantId);
    if (!v) throw E.validation(`La variante de la línea ${idx + 1} no existe.`, [{ path: `items.${idx}.variantId`, message: "Variante no encontrada." }]);
    if (!v.active || v.product.status !== "ACTIVE") throw E.validation(`"${v.product.title} — ${v.title}" no está activo para la venta.`, [{ path: `items.${idx}.variantId`, message: "Producto inactivo." }]);
    return {
      variantId: v.id, productTitle: v.product.title, variantTitle: v.title, sku: v.sku, quantity: i.quantity,
      unitPrice: i.unitPrice ?? v.price, discount: i.discount, taxRate: i.taxRate ?? v.product.taxRate, unitCost: v.cost ?? 0,
      thumbPath: v.image?.thumbPath ?? v.product.images[0]?.thumbPath ?? null, trackInventory: v.trackInventory,
    };
  });
  const totals = computeTotals(rawLines, body.discount, settings.pricesIncludeTax);

  // Pagos
  const methods = await tx.paymentMethod.findMany({ where: { active: true } });
  const payments: { methodCode: string; methodName: string; amount: number; received: number | null; change: number; reference: string | null }[] = [];
  let remaining = totals.total;
  for (const [idx, p] of body.payments.entries()) {
    const m = methods.find((x) => x.code === p.methodCode);
    if (!m) throw E.validation(`Método de pago "${p.methodCode}" no existe o está inactivo.`, [{ path: `payments.${idx}.methodCode`, message: "Método de pago inválido." }]);
    if (m.requiresReference && !p.reference) throw E.validation(`El método ${m.name} requiere número de referencia.`, [{ path: `payments.${idx}.reference`, message: "Introduce la referencia del pago." }]);
    const amount = Math.min(p.amount, remaining);
    if (amount <= 0) continue;
    let change = 0;
    let received: number | null = null;
    if (m.type === "CASH") {
      received = p.received ?? p.amount;
      if (received < amount) throw E.validation(`El efectivo recibido (${received}) es menor que el monto a pagar (${amount}).`, [{ path: `payments.${idx}.received`, message: "El efectivo recibido no cubre el monto." }]);
      change = received - amount;
    }
    payments.push({ methodCode: m.code, methodName: m.name, amount, received, change, reference: p.reference ?? null });
    remaining -= amount;
  }
  const paidTotal = payments.reduce((a, p) => a + p.amount, 0);
  const paymentStatus = paidTotal >= totals.total ? "PAID" : paidTotal > 0 ? "PARTIAL" : "PENDING";
  const status = body.hold ? "OPEN" : "COMPLETED";
  const fulfillmentStatus = body.hold ? "UNFULFILLED" : "FULFILLED";

  const { number, sequence } = await nextOrderNumber(tx);
  const order = await tx.order.create({
    data: {
      number, sequence, status, paymentStatus, fulfillmentStatus, source: body.source, locationId: body.locationId, customerId: body.customerId ?? null,
      subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, total: totals.total, paidTotal, costTotal: totals.costTotal,
      note: body.note ?? null, externalRef: body.externalRef ?? null, cashSessionId: body.cashSessionId ?? null,
      createdById: actor.id, createdByName: actor.name,
      completedAt: status === "COMPLETED" ? new Date() : null,
      items: { create: totals.lines.map((l) => ({ variantId: l.variantId, productTitle: l.productTitle, variantTitle: l.variantTitle, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice, unitCost: l.unitCost, discount: l.discount, taxRate: l.taxRate, taxAmount: l.taxAmount, subtotal: l.subtotal, total: l.total, thumbPath: l.thumbPath })) },
      payments: { create: payments.map((p) => ({ ...p, kind: "PAYMENT", cashSessionId: body.cashSessionId ?? null })) },
      events: {
        create: [
          { type: "created", message: `Orden creada desde ${body.source === "POS" ? "el POS" : body.source === "API" ? "la API" : "la app"}.`, actorName: actor.name },
          ...payments.map((p) => ({ type: "payment", message: `Pago de ${p.amount.toLocaleString("es-CO")} con ${p.methodName}${p.change ? ` (cambio ${p.change.toLocaleString("es-CO")})` : ""}.`, actorName: actor.name })),
          ...(status === "COMPLETED" ? [{ type: "fulfilled", message: "Artículos entregados.", actorName: actor.name }] : [{ type: "hold", message: "Orden en espera: stock comprometido.", actorName: actor.name }]),
        ],
      },
    },
  });

  // Movimientos de inventario
  const movements: MovementInput[] = [];
  for (const l of totals.lines) {
    if (!l.trackInventory) continue;
    if (body.hold) {
      movements.push({ variantId: l.variantId, locationId: body.locationId, type: "RESERVATION", bucket: "AVAILABLE", quantity: -l.quantity, referenceType: "ORDER", referenceId: order.id, referenceLabel: number, reason: "Reserva por orden" });
      movements.push({ variantId: l.variantId, locationId: body.locationId, type: "RESERVATION", bucket: "COMMITTED", quantity: l.quantity, referenceType: "ORDER", referenceId: order.id, referenceLabel: number, reason: "Reserva por orden" });
    } else {
      movements.push({ variantId: l.variantId, locationId: body.locationId, type: "SALE", bucket: "AVAILABLE", quantity: -l.quantity, referenceType: "ORDER", referenceId: order.id, referenceLabel: number, reason: "Venta" });
    }
  }
  const applied = await applyMovements(tx, movements, actor, { allowNegativeAvailable: settings.allowNegativeStock });

  if (body.customerId) {
    await tx.customer.update({ where: { id: body.customerId }, data: { ordersCount: { increment: 1 }, totalSpent: { increment: totals.total }, lastOrderAt: new Date() } });
  }
  const full = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  return { order: full, applied };
}

/** Entregar una orden abierta: Comprometido → vendido. */
export async function fulfillOrder(tx: Tx, id: string, actor: Actor) {
  const o = await tx.order.findUnique({ where: { id }, include: { items: true } });
  if (!o) throw E.notFound("La orden");
  if (o.status !== "OPEN") throw E.conflict("Solo se pueden entregar órdenes abiertas.");
  const movements: MovementInput[] = o.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, locationId: o.locationId, type: "SALE", bucket: "COMMITTED", quantity: -i.quantity, referenceType: "ORDER", referenceId: o.id, referenceLabel: o.number, reason: "Entrega de orden" }));
  const applied = await applyMovements(tx, movements, actor, { allowNegativeAvailable: false });
  await tx.order.update({ where: { id }, data: { status: "COMPLETED", fulfillmentStatus: "FULFILLED", completedAt: new Date(), events: { create: { type: "fulfilled", message: "Artículos entregados.", actorName: actor.name } } } });
  return applied;
}

export async function cancelOrder(tx: Tx, id: string, actor: Actor, opts: { reason: string; refund: boolean; refundMethodCode?: string }) {
  const o = await tx.order.findUnique({ where: { id }, include: { items: true, payments: true } });
  if (!o) throw E.notFound("La orden");
  if (o.status === "CANCELLED") throw E.conflict("La orden ya está anulada.");
  const movements: MovementInput[] = [];
  for (const i of o.items) {
    if (!i.variantId) continue;
    const qty = i.quantity - i.returnedQuantity;
    if (qty <= 0) continue;
    if (o.status === "OPEN") {
      movements.push({ variantId: i.variantId, locationId: o.locationId, type: "CANCELLATION", bucket: "COMMITTED", quantity: -qty, referenceType: "ORDER", referenceId: o.id, referenceLabel: o.number, reason: opts.reason });
      movements.push({ variantId: i.variantId, locationId: o.locationId, type: "CANCELLATION", bucket: "AVAILABLE", quantity: qty, referenceType: "ORDER", referenceId: o.id, referenceLabel: o.number, reason: opts.reason });
    } else {
      movements.push({ variantId: i.variantId, locationId: o.locationId, type: "CANCELLATION", bucket: "AVAILABLE", quantity: qty, referenceType: "ORDER", referenceId: o.id, referenceLabel: o.number, reason: opts.reason });
    }
  }
  const applied = await applyMovements(tx, movements, actor, { allowNegativeAvailable: false });
  const refundable = o.paidTotal - o.refundedTotal;
  let refunded = 0;
  if (opts.refund && refundable > 0) {
    const method = opts.refundMethodCode ? await tx.paymentMethod.findUnique({ where: { code: opts.refundMethodCode } }) : null;
    const first = o.payments.find((p) => p.kind === "PAYMENT");
    const m = method ?? (first ? { code: first.methodCode, name: first.methodName } : { code: "cash", name: "Efectivo" });
    await tx.orderPayment.create({ data: { orderId: o.id, methodCode: m.code, methodName: m.name, amount: refundable, kind: "REFUND", cashSessionId: o.cashSessionId } });
    refunded = refundable;
  }
  const refundedTotal = o.refundedTotal + refunded;
  await tx.order.update({
    where: { id },
    data: {
      status: "CANCELLED", cancelledAt: new Date(), refundedTotal,
      paymentStatus: o.paidTotal === 0 ? "PENDING" : refundedTotal >= o.paidTotal ? "REFUNDED" : refundedTotal > 0 ? "PARTIALLY_REFUNDED" : o.paymentStatus,
      events: { create: [{ type: "cancelled", message: `Orden anulada. Motivo: ${opts.reason}`, actorName: actor.name }, ...(refunded ? [{ type: "refund", message: `Reembolso de ${refunded.toLocaleString("es-CO")}.`, actorName: actor.name }] : [])] },
    },
  });
  if (o.customerId) await tx.customer.update({ where: { id: o.customerId }, data: { totalSpent: { decrement: o.total }, ordersCount: { decrement: 1 } } });
  return applied;
}

export async function returnOrder(
  tx: Tx,
  id: string,
  actor: Actor,
  body: { items: { lineId: string; quantity: number; restock: boolean; restockAs: "AVAILABLE" | "UNAVAILABLE" }[]; reason: string; refundAmount?: number; refundMethodCode?: string; note?: string },
) {
  const o = await tx.order.findUnique({ where: { id }, include: { items: true, payments: true } });
  if (!o) throw E.notFound("La orden");
  if (o.status !== "COMPLETED") throw E.conflict("Solo se pueden devolver artículos de órdenes completadas.");
  const movements: MovementInput[] = [];
  let proportional = 0;
  for (const [idx, it] of body.items.entries()) {
    const line = o.items.find((l) => l.id === it.lineId);
    if (!line) throw E.validation(`La línea ${it.lineId} no pertenece a esta orden.`, [{ path: `items.${idx}.lineId`, message: "Línea inválida." }]);
    const max = line.quantity - line.returnedQuantity;
    if (it.quantity > max) throw E.validation(`Solo puedes devolver hasta ${max} unidades de "${line.productTitle}".`, [{ path: `items.${idx}.quantity`, message: `Máximo ${max}.` }]);
    proportional += Math.round((line.total / line.quantity) * it.quantity);
    await tx.orderLine.update({ where: { id: line.id }, data: { returnedQuantity: line.returnedQuantity + it.quantity } });
    if (it.restock && line.variantId) {
      movements.push({ variantId: line.variantId, locationId: o.locationId, type: "RETURN", bucket: it.restockAs, quantity: it.quantity, referenceType: "ORDER", referenceId: o.id, referenceLabel: o.number, reason: body.reason, note: body.note ?? null });
    }
  }
  const applied = await applyMovements(tx, movements, actor, { allowNegativeAvailable: false });
  const refundable = o.paidTotal - o.refundedTotal;
  const refundAmount = Math.min(body.refundAmount ?? proportional, refundable);
  if (refundAmount > 0) {
    const method = body.refundMethodCode ? await tx.paymentMethod.findUnique({ where: { code: body.refundMethodCode } }) : null;
    const first = o.payments.find((p) => p.kind === "PAYMENT");
    const m = method ?? (first ? { code: first.methodCode, name: first.methodName } : { code: "cash", name: "Efectivo" });
    await tx.orderPayment.create({ data: { orderId: o.id, methodCode: m.code, methodName: m.name, amount: refundAmount, kind: "REFUND", cashSessionId: o.cashSessionId } });
  }
  const ret = await tx.return.create({ data: { orderId: o.id, reason: body.reason, note: body.note ?? null, refundAmount, items: body.items, createdById: actor.id } });
  const lines = await tx.orderLine.findMany({ where: { orderId: o.id } });
  const allReturned = lines.every((l) => l.returnedQuantity >= l.quantity);
  const refundedTotal = o.refundedTotal + refundAmount;
  await tx.order.update({
    where: { id },
    data: {
      refundedTotal,
      fulfillmentStatus: allReturned ? "RETURNED" : "PARTIALLY_RETURNED",
      paymentStatus: refundedTotal >= o.paidTotal && o.paidTotal > 0 ? "REFUNDED" : refundedTotal > 0 ? "PARTIALLY_REFUNDED" : o.paymentStatus,
      events: { create: { type: "return", message: `Devolución de ${body.items.reduce((a, i) => a + i.quantity, 0)} unidad(es). Motivo: ${body.reason}.${refundAmount ? ` Reembolso de ${refundAmount.toLocaleString("es-CO")}.` : ""}`, actorName: actor.name } },
    },
  });
  if (o.customerId && refundAmount > 0) await tx.customer.update({ where: { id: o.customerId }, data: { totalSpent: { decrement: refundAmount } } });
  return { applied, returnId: ret.id, refundAmount };
}

export async function addPayments(tx: Tx, id: string, actor: Actor, payments: { methodCode: string; amount: number; received?: number; reference?: string | null }[]) {
  const o = await tx.order.findUnique({ where: { id } });
  if (!o) throw E.notFound("La orden");
  if (o.status === "CANCELLED") throw E.conflict("No se pueden registrar pagos en una orden anulada.");
  let remaining = o.total - o.paidTotal;
  if (remaining <= 0) throw E.conflict("La orden ya está pagada.");
  const methods = await tx.paymentMethod.findMany({ where: { active: true } });
  let added = 0;
  for (const [idx, p] of payments.entries()) {
    const m = methods.find((x) => x.code === p.methodCode);
    if (!m) throw E.validation(`Método de pago "${p.methodCode}" inválido.`, [{ path: `payments.${idx}.methodCode`, message: "Método de pago inválido." }]);
    const amount = Math.min(p.amount, remaining);
    if (amount <= 0) continue;
    let change = 0;
    let received: number | null = null;
    if (m.type === "CASH") {
      received = p.received ?? p.amount;
      change = Math.max(0, received - amount);
    }
    await tx.orderPayment.create({ data: { orderId: o.id, methodCode: m.code, methodName: m.name, amount, received, change, reference: p.reference ?? null, kind: "PAYMENT", cashSessionId: o.cashSessionId } });
    await tx.orderEvent.create({ data: { orderId: o.id, type: "payment", message: `Pago de ${amount.toLocaleString("es-CO")} con ${m.name}.`, actorName: actor.name } });
    remaining -= amount;
    added += amount;
  }
  const paidTotal = o.paidTotal + added;
  await tx.order.update({ where: { id }, data: { paidTotal, paymentStatus: paidTotal >= o.total ? "PAID" : paidTotal > 0 ? "PARTIAL" : "PENDING" } });
  return paidTotal >= o.total;
}
