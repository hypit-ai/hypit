import assert from "node:assert/strict";
import fs from "node:fs";
import type { FSWatcher } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { ViteDevServer } from "vite";
import { studioFeedbackPlugin } from "../src/feedback-server.js";
import { allowsStudioMutation } from "../src/mutation-origin.js";

test("Studio mutations accept the actual local page and local non-browser clients", () => {
  assert.equal(allowsStudioMutation({ host: "localhost:5173", origin: "http://localhost:5173", "sec-fetch-site": "same-origin" }), true);
  assert.equal(allowsStudioMutation({ host: "127.0.0.1:5173" }), true);
});

test("Studio mutations reject other pages even when they use a loopback hostname", () => {
  assert.equal(allowsStudioMutation({ host: "localhost:5173", origin: "https://example.com", "sec-fetch-site": "cross-site" }), false);
  assert.equal(allowsStudioMutation({ host: "localhost:5173", origin: "http://localhost:4000", "sec-fetch-site": "same-site" }), false);
  assert.equal(allowsStudioMutation({ host: "localhost:5173", "sec-fetch-site": "cross-site" }), false);
  assert.equal(allowsStudioMutation({ host: "example.com:5173", origin: "http://example.com:5173" }), false);
});

for (const failure of ["opening", "watching"] as const) {
  test(`feedback watch failure while ${failure} warns without disabling the endpoint`, (t) => {
    let closed = false;
    const watcher = Object.assign(new EventEmitter(), { close() { closed = true; } });
    const error = new Error("watch capacity exhausted");
    t.mock.method(fs, "watch", () => {
      if (failure === "opening") throw error;
      return watcher as FSWatcher;
    });
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    const warnings: string[] = [];
    let installed = false;
    const plugin = studioFeedbackPlugin("/project", "/project/main.svml");
    (plugin.configureServer as (server: ViteDevServer) => void)({
      config: { logger: { warn(message: string) { warnings.push(message); } } },
      ws: { send() {} },
      middlewares: { use() { installed = true; } },
    } as unknown as ViteDevServer);
    if (failure === "watching") watcher.emit("error", error);
    assert.equal(installed, true);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /watch capacity exhausted/);
    assert.equal(closed, failure === "watching");
  });
}
