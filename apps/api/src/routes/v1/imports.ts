import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { importCommitBody, importKind, importPreviewResponse, importResultResponse } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { parseCsv, toCsv } from "../../lib/csv";
import { withTx } from "../../lib/prisma";
import { createProduct, updateProduct } from "../../services/products";
import { applyAdjustments, type AdjustmentCommand } from "../../services/inventory";
import { emitInventoryEvents } from "../../services/inventory-events";
import { audit } from "../../lib/audit";

type PreviewRow = { row: number; data: Record<string, string>; errors: string[]; action: "create" | "update" | "skip" | "error" };
const pending = new Map<string, { kind: "products" | "inventory" | "customers"; rows: PreviewRow[]; ownerId: string | null; at: number }>();

const PRODUCT_COLUMNS = ["titulo", "sku", "precio", "costo", "codigo_barras", "categoria", "proveedor", "iva", "estado", "etiquetas", "opcion1_nombre", "opcion1_valor", "opcion2_nombre", "opcion2_valor", "descripcion", "stock_inicial"];
const INVENTORY_COLUMNS = ["sku", "ubicacion", "cantidad", "modo", "motivo"];
const CUSTOMER_COLUMNS = ["nombre", "apellido", "tipo_documento", "documento", "correo", "telefono", "direccion", "ciudad", "empresa"];

function num(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v.replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export default async function importRoutes(app: App) {
  app.get(
    "/imports/template",
    { preValidation: [app.guard("import.run", null)], schema: { tags: ["Imports"], summary: "Plantilla CSV", querystring: z.object({ kind: importKind }), produces: ["text/csv"] } },
    async (request, reply) => {
      const cols = request.query.kind === "products" ? PRODUCT_COLUMNS : request.query.kind === "inventory" ? INVENTORY_COLUMNS : CUSTOMER_COLUMNS;
      const example = request.query.kind === "products"
        ? [["Camiseta básica", "CAM-001-M", "45000", "22000", "7701234567890", "Ropa", "Textiles del Caribe", "19", "ACTIVE", "verano,basicos", "Talla", "M", "Color", "Blanco", "Camiseta 100% algodón", "10"]]
        : request.query.kind === "inventory"
          ? [["CAM-001-M", "Tienda principal", "25", "set", "Conteo inicial"]]
          : [["Ana", "Pérez", "CC", "1020304050", "ana@ejemplo.com", "3001234567", "Calle 10 # 5-20", "Bogotá", ""]];
      reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="plantilla-${request.query.kind}.csv"`);
      return reply.send(toCsv(cols, example));
    },
  );

  app.post(
    "/imports/preview",
    { preValidation: [app.guard("import.run", null)], schema: { tags: ["Imports"], summary: "Previsualizar CSV (multipart `file`) con errores por fila", consumes: ["multipart/form-data"], querystring: z.object({ kind: importKind }), response: { 200: importPreviewResponse } } },
    async (request) => {
      const file = await request.file();
      if (!file) throw E.badRequest("Adjunta el archivo CSV en el campo `file`.");
      const text = (await file.toBuffer()).toString("utf8");
      let records: Record<string, string>[];
      try {
        records = parseCsv(text);
      } catch (err) {
        throw E.validation(`No se pudo leer el CSV: ${err instanceof Error ? err.message : "formato inválido"}.`);
      }
      if (records.length === 0) throw E.validation("El archivo no tiene filas.");
      if (records.length > 5000) throw E.validation("Máximo 5.000 filas por importación.");
      const kind = request.query.kind;
      const rows: PreviewRow[] = [];
      const columns = Object.keys(records[0]!);

      if (kind === "products") {
        const skus = records.map((r) => r.sku?.trim()).filter(Boolean) as string[];
        const existing = new Set((await app.db.variant.findMany({ where: { sku: { in: skus } }, select: { sku: true } })).map((v) => v.sku));
        records.forEach((r, i) => {
          const errors: string[] = [];
          if (!r.titulo?.trim()) errors.push("Falta el título.");
          if (!r.sku?.trim()) errors.push("Falta el SKU.");
          const price = num(r.precio);
          if (price === null || Number.isNaN(price) || price < 0) errors.push("Precio inválido: introduce un número entero en COP.");
          const cost = num(r.costo);
          if (cost !== null && (Number.isNaN(cost) || cost < 0)) errors.push("Costo inválido.");
          if (r.iva && !["0", "5", "19"].includes(r.iva.trim())) errors.push("IVA debe ser 0, 5 o 19.");
          if (r.estado && !["ACTIVE", "DRAFT", "ARCHIVED", "activo", "borrador", "archivado"].includes(r.estado.trim())) errors.push("Estado debe ser ACTIVE, DRAFT o ARCHIVED.");
          const stock = num(r.stock_inicial);
          if (stock !== null && (Number.isNaN(stock) || stock < 0)) errors.push("Stock inicial inválido.");
          if (skus.filter((s) => s === r.sku?.trim()).length > 1) errors.push("SKU repetido en el archivo.");
          rows.push({ row: i + 2, data: r, errors, action: errors.length ? "error" : existing.has(r.sku!.trim()) ? "update" : "create" });
        });
      } else if (kind === "inventory") {
        const skus = records.map((r) => r.sku?.trim()).filter(Boolean) as string[];
        const existing = new Set((await app.db.variant.findMany({ where: { sku: { in: skus } }, select: { sku: true } })).map((v) => v.sku));
        const locations = await app.db.location.findMany({ where: { active: true } });
        records.forEach((r, i) => {
          const errors: string[] = [];
          if (!r.sku?.trim()) errors.push("Falta el SKU.");
          else if (!existing.has(r.sku.trim())) errors.push(`El SKU ${r.sku} no existe.`);
          if (r.ubicacion && !locations.some((l) => l.name.toLowerCase() === r.ubicacion!.trim().toLowerCase() || l.id === r.ubicacion!.trim())) errors.push(`La ubicación "${r.ubicacion}" no existe.`);
          const qty = num(r.cantidad);
          if (qty === null || Number.isNaN(qty)) errors.push("Cantidad inválida: introduce un número entero.");
          if (r.modo && !["set", "delta"].includes(r.modo.trim().toLowerCase())) errors.push("Modo debe ser set o delta.");
          if (!r.motivo?.trim()) errors.push("Falta el motivo.");
          rows.push({ row: i + 2, data: r, errors, action: errors.length ? "error" : "update" });
        });
      } else {
        const docs = records.map((r) => r.documento?.trim()).filter(Boolean) as string[];
        const existing = new Set((await app.db.customer.findMany({ where: { documentNumber: { in: docs } }, select: { documentNumber: true } })).map((c) => c.documentNumber!));
        records.forEach((r, i) => {
          const errors: string[] = [];
          if (!r.nombre?.trim()) errors.push("Falta el nombre.");
          if (r.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.correo.trim())) errors.push("Correo inválido.");
          if (r.tipo_documento && !["CC", "NIT", "CE", "PASAPORTE", "OTRO"].includes(r.tipo_documento.trim().toUpperCase())) errors.push("Tipo de documento debe ser CC, NIT, CE, PASAPORTE u OTRO.");
          rows.push({ row: i + 2, data: r, errors, action: errors.length ? "error" : r.documento && existing.has(r.documento.trim()) ? "update" : "create" });
        });
      }
      const token = createId();
      pending.set(token, { kind, rows, ownerId: request.actor!.id, at: Date.now() });
      for (const [k, v] of pending) if (Date.now() - v.at > 30 * 60_000) pending.delete(k);
      const valid = rows.filter((r) => r.action !== "error").length;
      return { kind, total: rows.length, valid, invalid: rows.length - valid, columns, rows: rows.slice(0, 500), token };
    },
  );

  app.post(
    "/imports/commit",
    { preValidation: [app.guard("import.run", null)], schema: { tags: ["Imports"], summary: "Confirmar importación (solo filas válidas)", body: importCommitBody, response: { 200: importResultResponse } } },
    async (request) => {
      const job = pending.get(request.body.token);
      if (!job || job.ownerId !== request.actor!.id) throw E.notFound("La previsualización (expiró o no existe)");
      pending.delete(request.body.token);
      const settings = await app.settings();
      const result = { created: 0, updated: 0, skipped: 0, errors: [] as { row: number; message: string }[] };
      const valid = job.rows.filter((r) => r.action !== "error");
      result.skipped = job.rows.length - valid.length;

      if (job.kind === "products") {
        const defaultLoc = request.body.locationId ?? (await app.db.location.findFirst({ where: { isDefault: true } }))?.id;
        const categories = await app.db.category.findMany();
        const suppliers = await app.db.supplier.findMany();
        // Agrupa por título cuando hay opciones (varias filas = variantes del mismo producto).
        const groups = new Map<string, PreviewRow[]>();
        for (const r of valid) {
          const key = r.data.titulo!.trim().toLowerCase();
          groups.set(key, [...(groups.get(key) ?? []), r]);
        }
        for (const [, rowsOfProduct] of groups) {
          const first = rowsOfProduct[0]!;
          try {
            const d = first.data;
            let categoryId: string | null = null;
            if (d.categoria?.trim()) {
              let c = categories.find((x) => x.name.toLowerCase() === d.categoria!.trim().toLowerCase());
              if (!c) {
                c = await app.db.category.create({ data: { name: d.categoria.trim(), slug: d.categoria.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-") + "-" + createId().slice(0, 4) } });
                categories.push(c);
              }
              categoryId = c.id;
            }
            let supplierId: string | null = null;
            if (d.proveedor?.trim()) {
              let s = suppliers.find((x) => x.name.toLowerCase() === d.proveedor!.trim().toLowerCase());
              if (!s) {
                s = await app.db.supplier.create({ data: { name: d.proveedor.trim() } });
                suppliers.push(s);
              }
              supplierId = s.id;
            }
            const optionNames = [d.opcion1_nombre?.trim(), d.opcion2_nombre?.trim()].filter(Boolean) as string[];
            const options = optionNames.map((name, idx) => ({ name, values: [...new Set(rowsOfProduct.map((r) => (idx === 0 ? r.data.opcion1_valor : r.data.opcion2_valor)?.trim()).filter(Boolean) as string[])] }));
            const statusMap: Record<string, "ACTIVE" | "DRAFT" | "ARCHIVED"> = { activo: "ACTIVE", borrador: "DRAFT", archivado: "ARCHIVED", ACTIVE: "ACTIVE", DRAFT: "DRAFT", ARCHIVED: "ARCHIVED" };
            const variants = rowsOfProduct.map((r) => {
              const ov: Record<string, string> = {};
              if (optionNames[0] && r.data.opcion1_valor) ov[optionNames[0]] = r.data.opcion1_valor.trim();
              if (optionNames[1] && r.data.opcion2_valor) ov[optionNames[1]] = r.data.opcion2_valor.trim();
              const stock = num(r.data.stock_inicial);
              return {
                sku: r.data.sku!.trim(), barcode: r.data.codigo_barras?.trim() || null, price: num(r.data.precio) ?? 0, cost: num(r.data.costo), compareAtPrice: null, weightGrams: null,
                optionValues: ov, trackInventory: true, active: true, imageId: null,
                initialStock: stock && defaultLoc ? [{ locationId: defaultLoc, available: stock }] : undefined,
              };
            });
            const body = {
              title: d.titulo!.trim(), description: d.descripcion?.trim() || null, status: statusMap[d.estado?.trim() ?? ""] ?? "ACTIVE", categoryId, supplierId,
              tags: (d.etiquetas ?? "").split(",").map((t) => t.trim()).filter(Boolean), taxRate: (d.iva ? Number(d.iva) : settings.defaultTaxRate) as 0 | 5 | 19, options, variants,
            };
            const existing = await app.db.variant.findFirst({ where: { sku: { in: variants.map((v) => v.sku) } }, select: { productId: true, product: { include: { variants: true } } } });
            if (existing) {
              const merged = variants.map((v) => ({ ...v, id: existing.product.variants.find((cv) => cv.sku === v.sku)?.id, initialStock: undefined }));
              const keep = existing.product.variants.filter((cv) => !variants.some((v) => v.sku === cv.sku)).map((cv) => ({ id: cv.id, sku: cv.sku, price: cv.price, cost: cv.cost, compareAtPrice: cv.compareAtPrice, barcode: cv.barcode, weightGrams: cv.weightGrams, optionValues: (cv.optionValues as Record<string, string>) ?? {}, trackInventory: cv.trackInventory, active: cv.active, title: cv.title, position: cv.position, imageId: cv.imageId }));
              await withTx(app.db, (tx) => updateProduct(tx, existing.productId, { ...body, variants: [...merged, ...keep] }, request.actor!, settings.allowNegativeStock));
              result.updated += rowsOfProduct.length;
            } else {
              await withTx(app.db, (tx) => createProduct(tx, body, request.actor!, settings.allowNegativeStock));
              result.created += rowsOfProduct.length;
            }
          } catch (err) {
            result.errors.push({ row: first.row, message: err instanceof Error ? err.message : "Error desconocido" });
          }
        }
      } else if (job.kind === "inventory") {
        const locations = await app.db.location.findMany({ where: { active: true } });
        const defaultLoc = locations.find((l) => l.isDefault) ?? locations[0];
        const variants = await app.db.variant.findMany({ where: { sku: { in: valid.map((r) => r.data.sku!.trim()) } }, select: { id: true, sku: true } });
        const cmds: AdjustmentCommand[] = [];
        for (const r of valid) {
          const v = variants.find((x) => x.sku === r.data.sku!.trim());
          const loc = r.data.ubicacion ? locations.find((l) => l.name.toLowerCase() === r.data.ubicacion!.trim().toLowerCase() || l.id === r.data.ubicacion!.trim()) : defaultLoc;
          if (!v || !loc) {
            result.errors.push({ row: r.row, message: "SKU o ubicación no encontrados." });
            continue;
          }
          cmds.push({ variantId: v.id, locationId: loc.id, mode: (r.data.modo?.trim().toLowerCase() as "set" | "delta") || "set", bucket: "AVAILABLE", quantity: num(r.data.cantidad) ?? 0, reason: r.data.motivo!.trim(), referenceType: "IMPORT" });
        }
        try {
          const applied = await withTx(app.db, (tx) => applyAdjustments(tx, cmds, request.actor!, { allowNegativeAvailable: settings.allowNegativeStock }));
          await emitInventoryEvents(app, applied, "import");
          result.updated = cmds.length;
        } catch (err) {
          result.errors.push({ row: 0, message: err instanceof Error ? err.message : "Error al aplicar ajustes" });
        }
      } else {
        for (const r of valid) {
          try {
            const d = r.data;
            const data = { firstName: d.nombre!.trim(), lastName: d.apellido?.trim() || null, documentType: d.tipo_documento?.trim().toUpperCase() || null, documentNumber: d.documento?.trim() || null, email: d.correo?.trim() || null, phone: d.telefono?.trim() || null, address: d.direccion?.trim() || null, city: d.ciudad?.trim() || null, companyName: d.empresa?.trim() || null };
            const existing = data.documentNumber ? await app.db.customer.findFirst({ where: { documentNumber: data.documentNumber } }) : null;
            if (existing) {
              await app.db.customer.update({ where: { id: existing.id }, data });
              result.updated++;
            } else {
              await app.db.customer.create({ data });
              result.created++;
            }
          } catch (err) {
            result.errors.push({ row: r.row, message: err instanceof Error ? err.message : "Error" });
          }
        }
      }
      await audit(app.db, request.actor!, "import", job.kind, null, { after: result, ip: request.ip });
      return result;
    },
  );

  // ---- Exportaciones ----
  app.get(
    "/exports/products",
    { preValidation: [app.guard("products.read", "read:products")], schema: { tags: ["Imports"], summary: "Exportar productos y variantes a CSV", produces: ["text/csv"] } },
    async (_request, reply) => {
      const products = await app.db.product.findMany({ include: { category: true, supplier: true, variants: { include: { levels: { include: { location: true } } } } }, orderBy: { title: "asc" } });
      const rows: (string | number | null)[][] = [];
      for (const p of products) {
        const opts = (p.options as { name: string }[]) ?? [];
        for (const v of p.variants) {
          const ov = (v.optionValues as Record<string, string>) ?? {};
          rows.push([p.title, v.sku, v.price, v.cost, v.barcode, p.category?.name ?? "", p.supplier?.name ?? "", p.taxRate, p.status, p.tags.join(","), opts[0]?.name ?? "", opts[0] ? ov[opts[0].name] ?? "" : "", opts[1]?.name ?? "", opts[1] ? ov[opts[1].name] ?? "" : "", p.description ?? "", v.levels.reduce((a, l) => a + l.available, 0)]);
        }
      }
      reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="productos-${new Date().toISOString().slice(0, 10)}.csv"`);
      return reply.send(toCsv([...PRODUCT_COLUMNS.slice(0, 15), "disponible_total"], rows));
    },
  );
  app.get(
    "/exports/inventory",
    { preValidation: [app.guard("inventory.read", "read:inventory")], schema: { tags: ["Imports"], summary: "Exportar niveles de inventario a CSV", querystring: z.object({ location_id: z.string().optional() }), produces: ["text/csv"] } },
    async (request, reply) => {
      const levels = await app.db.inventoryLevel.findMany({ where: { ...(request.query.location_id ? { locationId: request.query.location_id } : {}), variant: { product: { status: { not: "ARCHIVED" } } } }, include: { variant: { include: { product: true } }, location: true }, orderBy: [{ variant: { product: { title: "asc" } } }] });
      const csv = toCsv(["Producto", "Variante", "SKU", "Código de barras", "Ubicación", "Disponible", "Comprometido", "No disponible", "En existencia", "Entrante", "Stock mínimo", "Costo", "Precio"], levels.map((l) => [l.variant.product.title, l.variant.title, l.variant.sku, l.variant.barcode, l.location.name, l.available, l.committed, l.unavailable, l.available + l.committed + l.unavailable, l.incoming, l.minStock, l.variant.cost, l.variant.price]));
      reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="inventario-${new Date().toISOString().slice(0, 10)}.csv"`);
      return reply.send(csv);
    },
  );
  app.get(
    "/exports/customers",
    { preValidation: [app.guard("customers.read", "read:customers")], schema: { tags: ["Imports"], summary: "Exportar clientes a CSV", produces: ["text/csv"] } },
    async (_request, reply) => {
      const rows = await app.db.customer.findMany({ orderBy: { firstName: "asc" } });
      const csv = toCsv([...CUSTOMER_COLUMNS, "ordenes", "total_gastado"], rows.map((c) => [c.firstName, c.lastName, c.documentType, c.documentNumber, c.email, c.phone, c.address, c.city, c.companyName, c.ordersCount, c.totalSpent]));
      reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="clientes-${new Date().toISOString().slice(0, 10)}.csv"`);
      return reply.send(csv);
    },
  );
}
