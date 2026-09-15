import assert from "node:assert/strict";
import test from "node:test";

import { createOrcaRouterCredential } from "../src/credentials.js";
import { OrcaRouterClient, OrcaRouterHttpError } from "../src/client.js";
import { ORCAROUTER_API_BASE_URL, ORCAROUTER_AUTH_BASE_URL, orcaRouterOrigins } from "../src/provider.js";
import { CHAT_ENDPOINT_TYPES, filterCatalog } from "../src/catalog.js";

/**
 * The live path, run only when an OrcaRouter key is configured. It goes through the same client the
 * Endpoint uses, so a passing run is evidence that the wiring works rather than that the API exists.
 *
 * The key is read from the environment and is never printed, logged or included in an assertion
 * message: every failure below reports a status or a model ID.
 */
const apiKey = process.env.ORCAROUTER_API_KEY;
const keyReady = typeof apiKey === "string" && apiKey.startsWith("sk-orca-");

/** One credential held in memory; no store is written by a read-only live check. */
function credential() {
  const created = createOrcaRouterCredential({
    secret: JSON.stringify({
      format: "hypit.orcarouter-credential@1",
      key: apiKey!,
      generation: 0,
      state: "ready",
      issuedVia: "api-key",
    }),
    ref: { store: "env", key: "ORCAROUTER_API_KEY" },
  });
  assert.ok(created !== undefined, "the configured key must read as an OrcaRouter credential");
  return created;
}

test("live: the declared origins keep authentication and inference apart", () => {
  const origins = orcaRouterOrigins({});
  assert.equal(origins.authBaseUrl, ORCAROUTER_AUTH_BASE_URL);
  assert.equal(origins.apiBaseUrl, ORCAROUTER_API_BASE_URL);
  assert.equal(new URL(origins.authBaseUrl).host, "www.orcarouter.ai");
  assert.equal(new URL(origins.apiBaseUrl).host, "api.orcarouter.ai");
  assert.equal(new URL(origins.apiBaseUrl).pathname, "/v1");
});

test("live: the catalogue answers on the inference origin and keeps vendor namespaces", {
  skip: !keyReady && "ORCAROUTER_API_KEY is not configured",
  timeout: 60_000,
}, async () => {
  const client = new OrcaRouterClient({ baseUrl: orcaRouterOrigins({}).apiBaseUrl, timeout: 30_000 });
  const result = await client.models(credential(), "chat");
  assert.equal(result.source, "live", `the live catalogue must answer: ${result.detail ?? "no detail"}`);
  assert.ok(result.models.length > 0, "the account must be able to call at least one chat model");
  for (const model of result.models) {
    assert.equal(model.id.includes("/"), true, `a catalogue ID keeps its vendor namespace: ${model.id}`);
    assert.equal(model.origin, "live");
  }
  // The text control's filter is the Provider's own, not a name-matching heuristic.
  assert.deepEqual(result.models.map((model) => model.id).sort(),
    filterCatalog(result.models, "chat").map((model) => model.id).sort());
  assert.equal(result.models.every((model) =>
    model.endpointTypes.some((type) => CHAT_ENDPOINT_TYPES.includes(type))), true);
});

test("live: a real chat completion is returned through the implemented client", {
  skip: !keyReady && "ORCAROUTER_API_KEY is not configured",
  timeout: 180_000,
}, async () => {
  const origins = orcaRouterOrigins({});
  const client = new OrcaRouterClient({ baseUrl: origins.apiBaseUrl, timeout: 60_000 });
  const held = credential();
  const catalogue = await client.models(held, "chat");
  assert.equal(catalogue.source, "live", "the model to call comes from the live catalogue");
  // A key may be scoped to a subset of the workspace catalogue, which the relay reports as 403. The
  // check calls the catalogue's own models until one answers, and reports the statuses it saw.
  const attempted: string[] = [];
  let reply: { readonly text: string } | undefined;
  for (const model of catalogue.models) {
    try {
      reply = await client.chat(held, {
        model: model.id,
        messages: [{ role: "user", content: "Reply with the single word: ready" }],
      });
      attempted.push(`${model.id}:ok`);
      break;
    } catch (error) {
      attempted.push(`${model.id}:${error instanceof OrcaRouterHttpError ? error.status : "error"}`);
    }
  }
  assert.ok(reply !== undefined, `no catalogue model answered this key (${attempted.join(", ")})`);
  assert.ok(reply.text.trim().length > 0, "a real completion must carry text");
  assert.equal(reply.text.includes(apiKey!), false, "a reply never echoes the credential");
});

test("live: image input is offered only for models whose catalogue entry declares it", {
  skip: !keyReady && "ORCAROUTER_API_KEY is not configured",
  timeout: 60_000,
}, async () => {
  const client = new OrcaRouterClient({ baseUrl: orcaRouterOrigins({}).apiBaseUrl, timeout: 30_000 });
  const held = credential();
  const text = await client.models(held, "chat");
  const multimodal = await client.models(held, "multimodal", "image");
  assert.equal(multimodal.source, "live");
  // Every entry the multimodal control may offer proves image input in its own metadata.
  for (const model of multimodal.models) {
    assert.equal(model.inputModalities.includes("image"), true,
      `${model.id} is offered for image input without declaring it`);
    assert.equal(text.models.some((candidate) => candidate.id === model.id), true,
      `${model.id} must also be a chat model`);
  }
  // The multimodal control never grows beyond the chat control.
  assert.ok(multimodal.models.length <= text.models.length);
  // With no image-input model in the catalogue, the multimodal control stays empty rather than
  // falling back to models that merely look capable.
  if (multimodal.models.length === 0) {
    assert.equal(text.models.every((model) => !model.inputModalities.includes("image")), true,
      "an empty multimodal control means no chat model declared image input");
  }
});
