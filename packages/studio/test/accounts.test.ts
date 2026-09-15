import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import test from "node:test";

import type { CredentialRef, CredentialValue, WritableCredentialStore } from "@hypit/runtime";

import { StudioAccounts, maskKey } from "../src/accounts.js";

/** A writable in-memory stand-in for the Runtime Profile's Credential Store. */
function store(): WritableCredentialStore & { readonly value: () => string | undefined } {
  let secret: string | undefined;
  const ref: CredentialRef = { store: "os", key: "orcarouter.apiKey" };
  return {
    value: () => secret,
    owns: (candidate) => candidate.store === ref.store && candidate.key === ref.key,
    async resolve(candidate) { return candidate.key === ref.key && secret !== undefined ? { secret } : undefined; },
    async put(candidate: CredentialRef, value: CredentialValue) { assert.equal(candidate.key, ref.key); secret = value.secret; },
    async delete(candidate: CredentialRef) { if (candidate.key !== ref.key || secret === undefined) return false; secret = undefined; return true; },
  };
}

/** A local stand-in for the OrcaRouter authorization service. */
async function authService(options: { readonly scope?: string; readonly status?: number } = {}) {
  const seen: { readonly path: string; readonly body: Record<string, string> }[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      seen.push({ path: new URL(request.url ?? "/", "http://127.0.0.1").pathname, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, string> });
      response.writeHead(options.status ?? 200, { "content-type": "application/json" });
      response.end(JSON.stringify({ key: "sk-orca-from-consent", user_id: "1", scope: options.scope ?? "api" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  return {
    seen,
    url: `http://127.0.0.1:${address.port}`,
    close: async () => { await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); }); },
  };
}

test("a pasted key and an authorized key are stored in the same slot and read the same way", async () => {
  const credentials = store();
  const accounts = new StudioAccounts({ store: credentials });

  const afterPaste = await accounts.saveApiKey("sk-orca-pasted-key");
  assert.equal(afterPaste.configured, true);
  // The panel reports the key masked, and never the key.
  // The mask keeps the scheme and replaces the whole secret body, so no part of a stored key can be
  // read back out of the panel or out of a screenshot of it.
  assert.equal(afterPaste.secretMasked, maskKey("sk-orca-pasted-key"));
  assert.equal(afterPaste.secretMasked, `sk-orca-${"•".repeat("pasted-key".length)}`);
  assert.equal(afterPaste.secretMasked.includes("pasted"), false);
  assert.ok(!JSON.stringify(afterPaste).includes("sk-orca-pasted-key"));
  assert.equal(afterPaste.authMethods.find((item) => item.id === "orcarouter")?.selected, true);
  assert.equal(afterPaste.authMethods.find((item) => item.id === "orcarouter-oauth")?.selected, false);

  const service = await authService();
  const previousAuth = process.env.ORCA_AUTH_BASE_URL;
  process.env.ORCA_AUTH_BASE_URL = service.url;
  try {
    const started = await accounts.beginConnect();
    assert.ok(started.connecting !== undefined);
    const authorize = new URL(started.connecting.authorizeUrl);
    assert.equal(authorize.searchParams.get("callback_url"), "oob");
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    const afterLogin = await accounts.submitCode(started.connecting.generation, "DISPLAYED-CODE");
    assert.equal(afterLogin.configured, true);
    assert.equal(afterLogin.authMethods.find((item) => item.id === "orcarouter-oauth")?.selected, true);
    assert.ok(!JSON.stringify(afterLogin).includes("sk-orca-from-consent"));
    // The exchange went to the authorization service's own path, in the declared JSON shape.
    assert.equal(service.seen.length, 1);
    assert.equal(service.seen[0]!.path, "/api/v1/auth/keys");
    assert.equal(service.seen[0]!.body.code, "DISPLAYED-CODE");
    assert.equal(service.seen[0]!.body.code_challenge_method, "S256");
    assert.equal(typeof service.seen[0]!.body.code_verifier, "string");
  } finally {
    if (previousAuth === undefined) delete process.env.ORCA_AUTH_BASE_URL;
    else process.env.ORCA_AUTH_BASE_URL = previousAuth;
    await service.close();
  }
});

test("both authentication choices are always offered, and removing one leaves the other usable", async () => {
  const credentials = store();
  const accounts = new StudioAccounts({ store: credentials });
  const before = await accounts.view();
  assert.deepEqual(before.authMethods.map((item) => item.id), ["orcarouter", "orcarouter-oauth"]);
  assert.deepEqual(before.authMethods.map((item) => item.label), ["OrcaRouter - API", "OrcaRouter - Auth"]);
  assert.equal(before.configured, false);
  assert.equal(before.state, "ready");
  assert.equal(before.keyDashboard, "https://www.orcarouter.ai/console/authorized-apps");
  // The inference and authorization origins are reported apart, and are different hosts.
  assert.equal(before.origins.auth, "https://www.orcarouter.ai");
  assert.equal(before.origins.api, "https://api.orcarouter.ai/v1");

  await accounts.saveApiKey("sk-orca-key");
  const cleared = await accounts.clear();
  assert.equal(cleared.configured, false);
  assert.equal(credentials.value(), undefined);
  // A key without the API-key shape is refused before it can reach the store.
  await assert.rejects(async () => await accounts.saveApiKey("   "), /Enter an OrcaRouter API key/u);
  await assert.rejects(async () => await accounts.saveApiKey("sk-orca-a b"), /no whitespace/u);
});

test("a stale generation cannot finish an authorization that was replaced", async () => {
  const credentials = store();
  const accounts = new StudioAccounts({ store: credentials });
  const first = await accounts.beginConnect();
  assert.ok(first.connecting !== undefined);
  const second = await accounts.beginConnect();
  assert.ok(second.connecting !== undefined);
  // The replaced authorization, and any older one, is refused rather than exchanging a code.
  await assert.rejects(
    async () => await accounts.submitCode(first.connecting!.generation, "OLD-CODE"),
    /no longer the current one/u,
  );
});

test("a failed exchange leaves the panel able to try again and stores nothing", async () => {
  const credentials = store();
  const accounts = new StudioAccounts({ store: credentials });
  const service = await authService({ status: 403 });
  const previous = process.env.ORCA_AUTH_BASE_URL;
  process.env.ORCA_AUTH_BASE_URL = service.url;
  try {
    const started = await accounts.beginConnect();
    assert.ok(started.connecting !== undefined);
    const authorize = new URL(started.connecting.authorizeUrl);
    assert.equal(authorize.origin, service.url);
    await assert.rejects(async () => await accounts.submitCode(started.connecting!.generation, "BAD-CODE"), /HTTP 403/u);
    // Nothing was stored, and the next authorization can start immediately.
    assert.equal(credentials.value(), undefined);
    const again = await accounts.beginConnect();
    assert.ok(again.connecting !== undefined);
    await accounts.cancel(again.connecting.generation);
  } finally {
    if (previous === undefined) delete process.env.ORCA_AUTH_BASE_URL;
    else process.env.ORCA_AUTH_BASE_URL = previous;
    await service.close();
  }
});

test("cancelling releases the authorization and clears the panel", async () => {
  const accounts = new StudioAccounts({ store: store() });
  const started = await accounts.beginConnect();
  assert.ok(started.connecting !== undefined);
  assert.equal((await accounts.cancel(started.connecting.generation)).connecting, undefined);
  // A later answer from the released attempt is refused.
  await assert.rejects(
    async () => await accounts.submitCode(started.connecting!.generation, "LATE-CODE"),
    /no longer the current one/u,
  );
});

test("the catalogue falls back to the verified seed when live discovery fails", async () => {
  const credentials = store();
  await credentials.put({ store: "os", key: "orcarouter.apiKey" },
    { secret: JSON.stringify({ format: "hypit.orcarouter-credential@1", key: "sk-orca-key", generation: 1, state: "ready", issuedVia: "oauth" }) });
  const offline = new StudioAccounts({
    store: credentials,
    fetch: async () => { throw new Error("network down"); },
  });
  const degraded = await offline.models("chat");
  assert.equal(degraded.source, "seed");
  assert.equal(degraded.degraded, true);
  assert.ok(degraded.models.some((model) => model.id === "openai/gpt-5.5"));
  assert.match(degraded.detail ?? "", /network down/u);

  const live = new StudioAccounts({
    store: credentials,
    fetch: async () => Response.json({ data: [
      { id: "deepseek/deepseek-v4.1-flash", supported_endpoint_types: ["openai"], architecture: { input_modalities: ["text", "image"] } },
    ] }),
  });
  const result = await live.models("multimodal", "image");
  assert.equal(result.source, "live");
  assert.equal(result.degraded, false);
  assert.deepEqual(result.models.map((model) => model.id), ["deepseek/deepseek-v4.1-flash"]);
  // The seed is never mixed into a successful live read.
  assert.ok(!result.models.some((model) => model.id === "openai/gpt-5.5"));
});

test("a needsReauth credential is reported and never used for discovery", async () => {
  const credentials = store();
  await credentials.put({ store: "os", key: "orcarouter.apiKey" },
    { secret: JSON.stringify({ format: "hypit.orcarouter-credential@1", key: "sk-orca-dead", generation: 1, state: "needsReauth", issuedVia: "oauth" }) });
  let called = false;
  const accounts = new StudioAccounts({
    store: credentials,
    fetch: async () => { called = true; return Response.json({ data: [] }); },
  });
  const view = await accounts.view();
  assert.equal(view.state, "needsReauth");
  assert.match(view.detail ?? "", /console\/authorized-apps/u);
  assert.equal((await accounts.models("chat")).source, "seed");
  // A rejected key must not be sent to the relay at all.
  assert.equal(called, false);
});
