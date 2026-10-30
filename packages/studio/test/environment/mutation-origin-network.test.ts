import assert from "node:assert/strict";
import fs from "node:fs";
import type { FSWatcher } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { ViteDevServer } from "vite";
import { studioFeedbackPlugin } from "../../src/feedback-server.js";

test("the feedback write endpoint rejects a foreign page before reading its mutation", async (t) => {
  t.mock.method(fs, "watch", () => Object.assign(new EventEmitter(), { close() {} }) as FSWatcher);
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const root = await mkdtemp(join(tmpdir(), "hypit-studio-origin-"));
  let middleware: ((request: IncomingMessage, response: ServerResponse, next: () => void) => void) | undefined;
  const server = createServer((request, response) => {
    assert.ok(middleware);
    middleware(request, response, () => { response.statusCode = 404; response.end(); });
  });
  const plugin = studioFeedbackPlugin(root, join(root, "author", "main.svml"));
  (plugin.configureServer as (server: ViteDevServer) => void)({
    httpServer: server,
    ws: { send() {} },
    middlewares: { use(handler: typeof middleware) { middleware = handler; } },
  } as unknown as ViteDevServer);
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/__studio/feedback`;
    const foreign = await fetch(url, { method: "POST", headers: { origin: "https://example.com" }, body: "{}" });
    assert.equal(foreign.status, 403);
    const local = await fetch(url, { method: "POST", headers: { origin: new URL(url).origin }, body: "{}" });
    assert.equal(local.status, 400, "the local request reaches ordinary mutation validation");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
