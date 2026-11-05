import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveHtmlProgram } from "../src/server.js";

function get(url: string, host?: string): Promise<number> {
  return new Promise((resolveStatus, reject) => {
    const target = new URL(url);
    const outgoing = request({ hostname: target.hostname, port: target.port, path: target.pathname,
      headers: host === undefined ? {} : { host } }, (response) => {
      response.resume();
      response.on("end", () => resolveStatus(response.statusCode ?? 0));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

test("the capture server answers only its own loopback host, so a rebound name cannot read staged material", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "hypit-html-server-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "index.html"), "<!doctype html><p>program</p>");
  const server = await serveHtmlProgram(root);
  t.after(() => server.close());
  const { host } = new URL(server.url);
  assert.equal(await get(server.url), 200);
  assert.equal(await get(server.url, host), 200);
  assert.equal(await get(server.url, `attacker.example:${new URL(server.url).port}`), 421);
  assert.equal(await get(server.url, "localhost"), 421);
});
