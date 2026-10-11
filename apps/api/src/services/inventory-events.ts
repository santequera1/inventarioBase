import type { App } from "../app";
import type { AppliedMovement } from "./inventory";
import { onHand } from "./inventory";

/** Emite inventory.updated por cada nivel tocado y inventory.low_stock si cruzó el umbral. */
export async function emitInventoryEvents(app: App, applied: AppliedMovement[], source: string) {
  if (applied.length === 0) return;
  const byLevel = new Map<string, AppliedMovement>();
  for (const m of applied) byLevel.set(`${m.variantId}|${m.locationId}`, m); // último estado
  const settings = await app.settings();
  const variantIds = [...new Set(applied.map((m) => m.variantId))];
  const variants = await app.db.variant.findMany({ where: { id: { in: variantIds } }, select: { id: true, sku: true, title: true, productId: true, product: { select: { title: true } } } });
  const vmap = new Map(variants.map((v) => [v.id, v]));
  for (const m of byLevel.values()) {
    const v = vmap.get(m.variantId);
    const payload = {
      variant_id: m.variantId,
      product_id: v?.productId ?? null,
      sku: v?.sku ?? null,
      product_title: v?.product.title ?? null,
      variant_title: v?.title ?? null,
      location_id: m.locationId,
      available: m.availableAfter,
      committed: m.committedAfter,
      unavailable: m.unavailableAfter,
      on_hand: onHand({ available: m.availableAfter, committed: m.committedAfter, unavailable: m.unavailableAfter }),
      incoming: m.incomingAfter,
      min_stock: m.level.minStock,
      source,
      movement_ids: applied.filter((x) => x.variantId === m.variantId && x.locationId === m.locationId).map((x) => x.id),
    };
    void app.webhooks.emit("inventory.updated", payload);
    const threshold = m.level.minStock ?? settings.lowStockThreshold;
    const wasAbove = applied
      .filter((x) => x.variantId === m.variantId && x.locationId === m.locationId && x.bucket === "AVAILABLE")
      .some((x) => x.availableAfter - x.quantity > threshold);
    if (m.availableAfter <= threshold && wasAbove) {
      void app.webhooks.emit("inventory.low_stock", { ...payload, threshold });
    }
  }
}
