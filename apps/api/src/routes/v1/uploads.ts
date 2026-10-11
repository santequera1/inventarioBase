import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { createId } from "@paralleldrive/cuid2";
import { idParam, okResponse, productImageSchema } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";

export default async function uploadRoutes(app: App) {
  app.post(
    "/uploads/images",
    {
      preValidation: [app.guard("products.write", "write:products")],
      schema: { tags: ["Products"], summary: "Subir imagen (multipart, campo `file`); devuelve id para asociar al producto", consumes: ["multipart/form-data"], querystring: z.object({ product_id: z.string().optional() }), response: { 201: productImageSchema } },
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw E.badRequest("Envía la imagen en el campo multipart `file`.");
      if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)) throw E.validation("Formato no soportado. Usa JPG, PNG, WEBP, GIF o AVIF.");
      const buf = await file.toBuffer();
      const id = createId();
      const base = path.resolve(app.config.UPLOADS_DIR);
      const rel = `products/${id}.webp`;
      const relThumb = `products/${id}_thumb.webp`;
      await fs.mkdir(path.join(base, "products"), { recursive: true });
      const img = sharp(buf, { failOn: "none" }).rotate();
      const meta = await img.metadata();
      await img.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(base, rel));
      await img.clone().resize({ width: 160, height: 160, fit: "cover" }).webp({ quality: 80 }).toFile(path.join(base, relThumb));
      const productId = request.query.product_id ?? null;
      let position = 0;
      if (productId) {
        const max = await app.db.productImage.aggregate({ where: { productId }, _max: { position: true } });
        position = (max._max.position ?? -1) + 1;
      }
      const row = await app.db.productImage.create({ data: { id, productId, path: rel, thumbPath: relThumb, width: meta.width ?? null, height: meta.height ?? null, size: buf.length, position, alt: file.filename?.slice(0, 120) ?? null } });
      if (productId) await app.db.product.update({ where: { id: productId }, data: { updatedAt: new Date() } }).catch(() => undefined);
      return reply.status(201).send({ id: row.id, url: `/uploads/${row.path}`, thumbUrl: `/uploads/${row.thumbPath}`, alt: row.alt, position: row.position });
    },
  );

  app.delete(
    "/uploads/images/:id",
    { preValidation: [app.guard("products.write", "write:products")], schema: { tags: ["Products"], summary: "Eliminar imagen", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const row = await app.db.productImage.findUnique({ where: { id: request.params.id } });
      if (!row) throw E.notFound("La imagen");
      await app.db.productImage.delete({ where: { id: row.id } });
      const base = path.resolve(app.config.UPLOADS_DIR);
      await Promise.all([fs.unlink(path.join(base, row.path)).catch(() => undefined), fs.unlink(path.join(base, row.thumbPath)).catch(() => undefined)]);
      return { ok: true as const };
    },
  );
}
