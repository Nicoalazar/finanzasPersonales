import { buildApp } from "./app.js";
import { config } from "./config.js";
import { ensureAdmin, ensureDefaults } from "./bootstrap.js";

const app = await buildApp();
await ensureAdmin();
await ensureDefaults();
await app.listen({ port: config.PORT, host: "0.0.0.0" });
