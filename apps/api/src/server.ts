import { buildApp } from "./app";

process.env.TZ = process.env.TZ ?? "America/Bogota";

const app = await buildApp();
try {
  await app.listen({ port: app.config.PORT, host: app.config.HOST });
  app.log.info(`API lista en http://${app.config.HOST}:${app.config.PORT} — docs en /api/docs`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "apagando");
  await app.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
