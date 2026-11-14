import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { startWorkbenchSuiteServer, type WorkbenchSuiteSurface } from "../../src/node/index.js";

async function target(label: string): Promise<{ readonly origin: string; close(): Promise<void> }> {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    response.writeHead(200, { "content-type": "application/json" });
    const value = request.url === "/api/workbench/environment"
      ? { status: "ready", credentials: [], environment: { selected: true, label: "local" } }
      : { label, method: request.method, url: request.url,
          body: Buffer.concat(chunks).toString("utf8"),
          ...(request.url === "/api/canvas" ? {
        environment: { status: "ready", credentials: [], environment: { selected: true, label: "local" } },
          } : {}) };
    response.end(`${JSON.stringify(value)}\n`);
  });
  await new Promise<void>((fulfill, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); fulfill(); });
  });
  const address = server.address();
  assert(address !== null && typeof address !== "string");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((fulfill, reject) => server.close((error) => error === undefined ? fulfill() : reject(error)));
    },
  };
}

test("one Workbench origin routes each surface to its independent Host", async () => {
  const targets = Object.fromEntries(await Promise.all((["nle", "scene", "canvas"] as const).map(async (surface) => {
    const opened = await target(surface);
    return [surface, opened] as const;
  }))) as Record<WorkbenchSuiteSurface, Awaited<ReturnType<typeof target>>>;
  const suite = await startWorkbenchSuiteServer({
    targets: Object.fromEntries(Object.entries(targets).map(([surface, opened]) => [surface, opened.origin])),
    projectTarget: targets.nle.origin,
    defaultSurface: "nle",
  });
  try {
    const root = await fetch(suite.origin, { redirect: "manual" });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get("location"), "/nle");
    for (const [path, label] of [
      ["/nle", "nle"],
      ["/comments", "nle"],
      ["/api/nle", "nle"],
      ["/3d", "scene"],
      ["/api/scene", "scene"],
      ["/canvas", "canvas"],
      ["/api/canvas", "canvas"],
      ["/api/project/media", "nle"],
      ["/api/project/media/events", "nle"],
      ["/assets/topbar.js", "nle"],
      ["/assets/3d.js", "scene"],
      ["/assets/GLTFLoader.js", "scene"],
      ["/assets/BufferGeometryUtils.js", "scene"],
      ["/assets/canvas.js", "canvas"],
    ] as const) {
      const response = await fetch(`${suite.origin}${path}`);
      assert.equal(response.status, 200);
      assert.equal((await response.json() as { readonly label: string }).label, label);
    }
    const response = await fetch(`${suite.origin}/api/canvas/transaction?revision=4`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "move" }),
    });
    assert.deepEqual(await response.json(), {
      label: "canvas",
      method: "POST",
      url: "/api/canvas/transaction?revision=4",
      body: JSON.stringify({ operation: "move" }),
    });
    assert.deepEqual(await (await fetch(`${suite.origin}/api/workbench/environment`)).json(), {
      status: "ready", credentials: [], environment: { selected: true, label: "local" },
    });
  } finally {
    await suite.close();
    await Promise.all(Object.values(targets).map(async (opened) => await opened.close()));
  }
});
