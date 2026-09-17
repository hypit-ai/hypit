#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "apps", "surreel-web");
const command = process.argv[2] ?? "dev";
const children = new Set();
let stopping = false;

function run(binary, args, options = {}) {
  return new Promise((done, reject) => {
    const child = spawn(binary, args, { cwd: root, stdio: "inherit", ...options });
    children.add(child);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      children.delete(child);
      if (code === 0 || (stopping && signal)) done();
      else reject(new Error(binary + " exited with " + (code ?? signal)));
    });
  });
}
function stop() {
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

function availablePort(preferred) {
  return new Promise((done, reject) => {
    const probe = createServer();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE" && preferred !== 0) {
        availablePort(0).then(done, reject);
      } else reject(error);
    });
    probe.listen(preferred, process.env.SURREEL_HOST ?? "127.0.0.1", () => {
      const address = probe.address();
      const port = String(address.port);
      probe.close(() => done(port));
    });
  });
}

async function main() {
  if (command === "build") {
    await run("pnpm", ["--filter", "@surreel/web", "build", ...process.argv.slice(3)]);
    return;
  }
  if (command === "check") {
    await run("pnpm", ["--filter", "@surreel/web", "check"]);
    await run("pnpm", ["--filter", "@surreel/web", "test"]);
    return;
  }
  const port = process.env.SURREEL_PORT ?? await availablePort(8787);
  const serviceEnv = { ...process.env, SURREEL_PORT: port };
  const webDir = join(app, "dist");
  if (command === "serve") {
    if (!existsSync(join(webDir, "index.html"))) throw new Error("Run pnpm surreel:build before serving the app.");
    await run(process.execPath, ["--import", "tsx", "packages/surreel-server/src/main.ts"], {
      env: { ...serviceEnv, SURREEL_WEB_DIR: webDir },
    });
    return;
  }
  if (command === "dev") {
    const webPort = process.env.SURREEL_DEV_PORT ?? await availablePort(8080);
    const api = process.env.SURREEL_API_URL ?? "http://127.0.0.1:" + port;
    const origins = new Set((process.env.SURREEL_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean));
    origins.add("http://127.0.0.1:" + webPort);
    origins.add("http://localhost:" + webPort);
    serviceEnv.SURREEL_ALLOWED_ORIGINS = [...origins].join(",");
    console.info("Surreel development: http://127.0.0.1:" + webPort);
    await Promise.all([
      run(process.execPath, ["--import", "tsx", "packages/surreel-server/src/main.ts"], { env: serviceEnv }),
      run("pnpm", ["--filter", "@surreel/web", "exec", "vite", "--host", "127.0.0.1", "--port", String(webPort)], {
        env: { ...process.env, SURREEL_API_URL: api, SURREEL_DEV_PORT: String(webPort) },
      }),
    ]);
    return;
  }
  throw new Error("Usage: node scripts/surreel.mjs dev|build|serve|check");
}
main().catch((error) => {
  stop();
  console.error(error.message);
  process.exitCode = 1;
});
