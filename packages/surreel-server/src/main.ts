import { loadConfig } from "./config.js";
import { createSurreelServer } from "./server.js";

const config = loadConfig();
const app = await createSurreelServer({ config });
await new Promise<void>((resolve, reject) => {
  app.server.once("error", reject);
  app.server.listen(config.port, config.host, () => {
    app.server.off("error", reject);
    resolve();
  });
});
console.info(`Surreel is listening at http://${config.host.includes(":") ? `[${config.host}]` : config.host}:${config.port}`);
let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await app.close();
}
process.once("SIGINT", () => { void stop().catch((error: unknown) => { console.error(error); process.exitCode = 1; }); });
process.once("SIGTERM", () => { void stop().catch((error: unknown) => { console.error(error); process.exitCode = 1; }); });
