import { z } from "zod";
import { categorySchema, createCategoryBody, idParam, okResponse, updateCategoryBody } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default async function categoryRoutes(app: App) {
  app.get(
    "/categories",
    { preValidation: [app.guard("products.read", "read:products")], schema: { tags: ["Products"], summary: "Listar categorías", response: { 200: z.object({ data: z.array(categorySchema) }) } } },
    async () => {
      const rows = await app.db.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } });
      return { data: rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, parentId: c.parentId, productCount: c._count.products })) };
    },
  );
  app.post(
    "/categories",
    { preValidation: [app.guard("products.write", "write:products")], schema: { tags: ["Products"], summary: "Crear categoría", body: createCategoryBody, response: { 201: categorySchema } } },
    async (request, reply) => {
      let slug = slugify(request.body.name) || "categoria";
      const exists = await app.db.category.findUnique({ where: { slug } });
      if (exists) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      const row = await app.db.category.create({ data: { name: request.body.name.trim(), slug, parentId: request.body.parentId ?? null } });
      return reply.status(201).send({ ...row, productCount: 0 });
    },
  );
  app.patch(
    "/categories/:id",
    { preValidation: [app.guard("products.write", "write:products")], schema: { tags: ["Products"], summary: "Editar categoría", params: idParam, body: updateCategoryBody, response: { 200: categorySchema } } },
    async (request) => {
      const row = await app.db.category.update({ where: { id: request.params.id }, data: { ...(request.body.name ? { name: request.body.name.trim() } : {}), ...(request.body.parentId !== undefined ? { parentId: request.body.parentId } : {}) } });
      return row;
    },
  );
  app.delete(
    "/categories/:id",
    { preValidation: [app.guard("products.write", "write:products")], schema: { tags: ["Products"], summary: "Eliminar categoría (los productos quedan sin categoría)", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const row = await app.db.category.findUnique({ where: { id: request.params.id } });
      if (!row) throw E.notFound("La categoría");
      await app.db.category.delete({ where: { id: row.id } });
      return { ok: true as const };
    },
  );
}
