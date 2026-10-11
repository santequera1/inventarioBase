import { z } from "zod";
import { storeSettingsSchema, updateStoreSettingsBody } from "@inventario/shared";
import type { App } from "../../app";
import { audit } from "../../lib/audit";
import { iso } from "../../lib/serialize";
import { reconcileLevel } from "../../services/inventory";

export default async function settingsRoutes(app: App) {
  app.get(
    "/settings",
    { preValidation: [app.guard(null, "read:locations")], schema: { tags: ["Settings"], summary: "Configuración de la tienda", response: { 200: storeSettingsSchema } } },
    async () => iso(await app.settings()),
  );

  app.patch(
    "/settings",
    {
      preValidation: [app.guard("settings.manage", null)],
      schema: { tags: ["Settings"], summary: "Actualizar configuración", body: updateStoreSettingsBody, response: { 200: storeSettingsSchema } },
    },
    async (request) => {
      const before = await app.settings();
      const data = { ...request.body, email: request.body.email === "" ? null : request.body.email };
      const after = await app.db.storeSettings.update({ where: { id: 1 }, data });
      app.invalidateSettings();
      await audit(app.db, request.actor!, "update", "settings", "1", { before, after, ip: request.ip });
      return iso(after);
    },
  );

  app.post(
    "/settings/reconcile",
    { preValidation: [app.guard("settings.manage", null)], schema: { tags: ["Settings"], summary: "Conciliar niveles con el libro mayor", response: { 200: z.object({ ok: z.literal(true), checked: z.number().int(), mismatches: z.number().int(), details: z.array(z.unknown()) }) } } },
    async () => {
      const levels = await app.db.inventoryLevel.findMany({ select: { variantId: true, locationId: true } });
            let mismatches = 0;
      const details: unknown[] = [];
      for (const l of levels) {
        const r = await app.db.$transaction((tx) => reconcileLevel(tx, l.variantId, l.locationId));
        if (!r.matches) {
          mismatches++;
          details.push({ ...l, ...r });
        }
      }
      return { ok: true as const, checked: levels.length, mismatches, details };
    },
  );
}
