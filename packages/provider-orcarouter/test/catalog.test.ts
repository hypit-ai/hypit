import assert from "node:assert/strict";
import test from "node:test";

import { CATALOG_LIMITS, ORCAROUTER_SEED_MODELS, filterCatalog, parseCatalogResponse } from "../src/catalog.js";
import type { CatalogModel } from "../src/catalog.js";

/** One catalogue record in the shape `GET /v1/models` returns. */
function entry(id: string, endpointTypes: readonly string[], inputModalities?: readonly string[]): Record<string, unknown> {
  return {
    id,
    object: "model",
    name: `${id} display`,
    supported_endpoint_types: [...endpointTypes],
    ...(inputModalities === undefined ? {} : { architecture: { input_modalities: [...inputModalities] } }),
  };
}

const live = parseCatalogResponse({
  data: [
    entry("deepseek/deepseek-v4-pro", ["openai", "openai-response"], ["text"]),
    entry("deepseek/deepseek-v4.1-flash", ["openai", "openai-response", "anthropic"], ["text", "image"]),
    entry("orcarouter/auto", ["openai", "openai-response", "anthropic", "gemini"]),
    entry("openai/gpt-image-2", ["openai", "image-generation"]),
    entry("vendor/embed-1", ["embeddings"]),
    entry("vendor/video-1", ["openai-video"]),
    entry("vendor/rerank-1", ["jina-rerank"]),
    entry("vendor/declared-nothing", ["openai"]),
    entry("vendor/no-endpoints", []),
  ],
});

test("catalogue parsing keeps the vendor namespace and drops unusable records", () => {
  const ids = live.map((model) => model.id);
  assert.ok(ids.includes("deepseek/deepseek-v4.1-flash"));
  assert.deepEqual(parseCatalogResponse({ data: [{ object: "model" }, null, 7, { id: "" }] }), []);
  assert.throws(() => parseCatalogResponse({ models: [] } as unknown), /no data array/u);
});

test("catalogue parsing bounds the response it accepts", () => {
  const many = parseCatalogResponse({ data: Array.from({ length: 900 }, (_item, index) => entry(`vendor/m${index}`, ["openai"])) });
  assert.equal(many.length, CATALOG_LIMITS.maxModels);
  const long = parseCatalogResponse({ data: [entry("x".repeat(CATALOG_LIMITS.maxStringLength + 1), ["openai"])] });
  assert.deepEqual(long, []);
});

test("text controls offer only chat-capable models from the live catalogue", () => {
  const chat = filterCatalog(live, "chat").map((model) => model.id);
  assert.deepEqual(chat, ["deepseek/deepseek-v4-pro", "deepseek/deepseek-v4.1-flash", "orcarouter/auto", "vendor/declared-nothing"]);
  // A media-only or embedding-only entry never reaches a text control.
  for (const id of ["openai/gpt-image-2", "vendor/embed-1", "vendor/video-1", "vendor/rerank-1"]) {
    assert.ok(!chat.includes(id), `${id} must not appear in the text control`);
  }
});

test("only entries that declare image input reach the multimodal control", () => {
  const multimodal = filterCatalog(live, "multimodal", "image").map((model) => model.id);
  assert.deepEqual(multimodal, ["deepseek/deepseek-v4.1-flash"]);
  // An entry with no architecture block fails closed rather than being assumed to accept images.
  const undeclared = live.find((model) => model.id === "orcarouter/auto")!;
  assert.deepEqual(undeclared.inputModalities, []);
  assert.ok(!multimodal.includes("orcarouter/auto"));
});

test("each non-text control matches only its own endpoint type", () => {
  assert.deepEqual(filterCatalog(live, "image").map((model) => model.id), ["openai/gpt-image-2"]);
  assert.deepEqual(filterCatalog(live, "embedding").map((model) => model.id), ["vendor/embed-1"]);
  assert.deepEqual(filterCatalog(live, "video").map((model) => model.id), ["vendor/video-1"]);
  assert.deepEqual(filterCatalog(live, "rerank").map((model) => model.id), ["vendor/rerank-1"]);
});

test("the verified seed keeps its metadata and is recognisable as an outage fallback", () => {
  const seed = ORCAROUTER_SEED_MODELS;
  assert.deepEqual(seed.map((model) => model.id), [
    "orcarouter/auto", "openai/gpt-5.5", "anthropic/claude-opus-4.8", "google/gemini-3.5-flash", "deepseek/deepseek-v4-pro",
  ]);
  const gpt = seed.find((model) => model.id === "openai/gpt-5.5")!;
  assert.deepEqual(gpt.reasoningEfforts, ["low", "medium", "high", "xhigh"]);
  assert.equal(gpt.contextLength, 400_000);
  assert.ok(seed.every((model) => model.origin === "seed"));
  // The seed is a chat-only fallback: it advertises no capability the catalogue has not confirmed.
  assert.deepEqual(filterCatalog(seed, "chat").map((model) => model.id), seed.map((model: CatalogModel) => model.id));
  assert.deepEqual(filterCatalog(seed, "image"), []);
  assert.deepEqual(filterCatalog(seed, "embedding"), []);
});
