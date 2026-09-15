import assert from "node:assert/strict";
import test from "node:test";

import type { AsyncEndpoint, EndpointCredential, EndpointInvocationContext, EndpointRequest } from "@hypit/endpoint-kit";
import { orcaRouterCapabilities, orcaRouterTypes } from "@hypit/orcarouter";
import { canonicalize } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { ResourceStore } from "@hypit/runtime";

import type { OrcaRouterChatMessage } from "../src/client.js";
import { createOrcaRouterProvider, orcaRouterOrigins } from "../src/provider.js";

const ref = credentialRef("os", "orcarouter.apiKey");

/** A record-shaped request exactly as the OrcaRouter Surface seals it. */
function request(overrides: Partial<{ model: string; prompt: string; images: readonly unknown[] }> = {}): EndpointRequest {
  return {
    capability: orcaRouterCapabilities.generate,
    returns: orcaRouterTypes.chat,
    constraints: canonicalize({
      model: overrides.model ?? "deepseek/deepseek-v4.1-flash",
      prompt: overrides.prompt ?? "Describe this frame.",
      images: overrides.images ?? [],
    }),
  };
}

const image = { kind: "blob" as const, resource: "res://frame.png", size: 4, mediaType: "image/png" };

function resourceStore(bytes: Readonly<Record<string, Uint8Array>>): ResourceStore {
  return { async get(id: string) { return bytes[id]; } } as unknown as ResourceStore;
}

/** Capture every request the Provider makes and answer each one from a script. */
function server(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { readonly url: string; readonly init: RequestInit }[] = [];
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return await handler(url, init ?? {});
  };
  return { calls, fetcher };
}

/** Drive the registered asynchronous capability the way the Runtime does. */
async function start(
  provider: ReturnType<typeof createOrcaRouterProvider>,
  credentials: Readonly<Record<string, EndpointCredential>>,
  need: EndpointRequest,
  resources: ResourceStore = resourceStore({}),
): Promise<{ readonly status: string; readonly failure?: { readonly message: string }; readonly result?: unknown }> {
  let endpoint: AsyncEndpoint | undefined;
  await provider.endpoint.install({
    registerImmediateEndpoint() { throw new Error("OrcaRouter registers no immediate capability"); },
    registerAsyncEndpoint(_id, capability, _returns, value) {
      if (capability.name === orcaRouterCapabilities.generate.name) endpoint = value;
    },
  });
  assert.ok(endpoint !== undefined, "OrcaRouter registers the chat capability");
  const context = {
    command: {
      kind: "fulfill-need" as const,
      id: "c1",
      need: { id: "n1", capability: need.capability, returns: need.returns, constraints: need.constraints },
    },
    need: { id: "n1", capability: need.capability, returns: need.returns, constraints: need.constraints },
    resources,
    credentials,
  } as unknown as EndpointInvocationContext;
  try {
    return await endpoint.start({ ...context, operation: "op1" }) as { readonly status: string };
  } catch (error) {
    return { status: "failed", failure: { message: error instanceof Error ? error.message : String(error) } };
  }
}

const minted = (key: string, generation: number): string =>
  JSON.stringify({ format: "hypit.orcarouter-credential@1", key, generation, state: "ready", issuedVia: "oauth" });

test("a pasted API key and a PKCE-issued key take the same inference path", async () => {
  for (const [stored, expectedKey, expectedSource] of [
    ["sk-orca-pasted", "sk-orca-pasted", "api-key"],
    [minted("sk-orca-minted", 1), "sk-orca-minted", "oauth"],
  ] as const) {
    const { calls, fetcher } = server(async () => Response.json({ choices: [{ message: { content: "A frame." } }] }));
    const provider = createOrcaRouterProvider({ fetch: fetcher });
    const credentials: Readonly<Record<string, EndpointCredential>> = { apiKey: { secret: stored } };
    const outcome = await start(provider, credentials, request());
    assert.equal(outcome.status, "completed");
    assert.deepEqual(outcome.result, { value: { kind: "inline", value: { text: "A frame." } } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "https://api.orcarouter.ai/v1/chat/completions");
    assert.equal((calls[0]!.init.headers as Record<string, string>).authorization, `Bearer ${expectedKey}`);
    // Exactly one of the two entry points resolves the slot, and it names the route the user took.
    const resolved = await Promise.all(provider.adapters(credentials).map(async (adapter) => await adapter.resolve()));
    assert.equal(resolved.filter((item) => item !== undefined).length, 1);
    assert.equal(resolved.find((item) => item !== undefined)!.source, expectedSource);
  }
});

test("attached images travel as data URLs, never as a path to local media", async () => {
  const { calls, fetcher } = server(async () => Response.json({ choices: [{ message: { content: "ok" } }] }));
  const provider = createOrcaRouterProvider({ fetch: fetcher });
  const outcome = await start(provider, { apiKey: { secret: "sk-orca-key" } }, request({ images: [image] }),
    resourceStore({ "res://frame.png": new Uint8Array([1, 2, 3, 4]) }));
  assert.equal(outcome.status, "completed");
  const body = JSON.parse(String(calls[0]!.init.body)) as { messages: readonly OrcaRouterChatMessage[] };
  const content = body.messages[0]!.content as readonly { type: string; text?: string; image_url?: { url: string } }[];
  assert.equal(content[0]!.type, "text");
  assert.equal(content[1]!.image_url!.url, `data:image/png;base64,${Buffer.from([1, 2, 3, 4]).toString("base64")}`);
  assert.ok(!JSON.stringify(body).includes("res://frame.png"));
});

test("a missing local image fails the attempt instead of sending a broken request", async () => {
  const { calls, fetcher } = server(async () => Response.json({ choices: [{ message: { content: "ok" } }] }));
  const provider = createOrcaRouterProvider({ fetch: fetcher });
  const outcome = await start(provider, { apiKey: { secret: "sk-orca-key" } }, request({ images: [image] }));
  assert.equal(outcome.status, "failed");
  assert.match(outcome.failure!.message, /res:\/\/frame\.png is unavailable/u);
  assert.equal(calls.length, 0);
});

test("a rejected credential marks its exact generation needsReauth and is never refreshed", async () => {
  const { calls, fetcher } = server(async () => new Response("nope", { status: 401 }));
  let persisted = "";
  const provider = createOrcaRouterProvider({ fetch: fetcher });
  const credentials: Readonly<Record<string, EndpointCredential>> = {
    apiKey: { secret: minted("sk-orca-dead", 4), replace: async (value) => { persisted = value.secret; } },
  };
  const outcome = await start(provider, credentials, request());
  assert.equal(outcome.status, "failed");
  assert.match(outcome.failure!.message, /HTTP 401/u);
  assert.match(outcome.failure!.message, /console\/authorized-apps/u);
  assert.equal(calls.length, 1, "a 401 is terminal, not a retry or a refresh");
  // The key is kept and only its state changes, so a misclassified failure is never destructive.
  const decoded = JSON.parse(persisted) as { key: string; state: string; generation: number };
  assert.deepEqual(decoded, { format: "hypit.orcarouter-credential@1", key: "sk-orca-dead", generation: 4, state: "needsReauth", issuedVia: "oauth" });
});

test("a malformed stored credential is refused rather than sent", async () => {
  const { calls, fetcher } = server(async () => Response.json({ choices: [{ message: { content: "ok" } }] }));
  const provider = createOrcaRouterProvider({ fetch: fetcher });
  const outcome = await start(provider, { apiKey: { secret: '{"format":"hypit.orcarouter-credential@1"}' } }, request());
  assert.equal(outcome.status, "failed");
  assert.match(outcome.failure!.message, /unreadable/u);
  assert.equal(calls.length, 0);
});

test("a model without a vendor namespace or too many references is refused before sending", async () => {
  const { calls, fetcher } = server(async () => Response.json({ choices: [{ message: { content: "ok" } }] }));
  const provider = createOrcaRouterProvider({ fetch: fetcher });
  const offer = provider.endpoint.offers[0]!;
  assert.deepEqual(offer.supports!(request({ model: "deepseek-v4-pro" })), {
    status: "unsupported",
    reason: "OrcaRouter model deepseek-v4-pro is missing its vendor namespace, for example anthropic/claude-opus-4.8",
  });
  assert.deepEqual(offer.supports!(request({ prompt: "  " })),
    { status: "unsupported", reason: "OrcaRouter requires a prompt" });
  assert.equal(offer.supports!(request({ images: Array.from({ length: 9 }, () => image) })).status, "unsupported");
  assert.equal(offer.supports!(request()).status, "supported");
  assert.equal(calls.length, 0);
});

test("authentication and inference stay on their own origins", () => {
  const origins = orcaRouterOrigins({});
  assert.equal(origins.authBaseUrl, "https://www.orcarouter.ai");
  assert.equal(origins.apiBaseUrl, "https://api.orcarouter.ai/v1");
  // The inference host is never derived from the auth host by replacing a hostname.
  assert.notEqual(new URL(origins.apiBaseUrl).host, new URL(origins.authBaseUrl).host);
  // A shared self-hosted base feeds both; an explicit override wins over it.
  assert.deepEqual(orcaRouterOrigins({ ORCA_BASE_URL: "https://orca.internal" }),
    { authBaseUrl: "https://orca.internal", apiBaseUrl: "https://orca.internal/v1" });
  assert.deepEqual(orcaRouterOrigins({
    ORCA_BASE_URL: "https://orca.internal",
    ORCA_AUTH_BASE_URL: "https://login.internal",
    ORCA_API_BASE_URL: "https://relay.internal/v1",
  }), { authBaseUrl: "https://login.internal", apiBaseUrl: "https://relay.internal/v1" });
  assert.throws(() => orcaRouterOrigins({ ORCA_API_BASE_URL: "http://api.orcarouter.ai" }), /HTTPS/u);
  assert.equal(orcaRouterOrigins({ ORCA_BASE_URL: "http://127.0.0.1:9000" }).apiBaseUrl, "http://127.0.0.1:9000/v1");
});

test("the catalogue is read with the credential, on the inference origin, filtered to the control", async () => {
  const { calls, fetcher } = server(async () => Response.json({ data: [
    { id: "deepseek/deepseek-v4.1-flash", supported_endpoint_types: ["openai", "anthropic"], architecture: { input_modalities: ["text", "image"] } },
    { id: "openai/gpt-image-2", supported_endpoint_types: ["image-generation"] },
  ] }));
  const provider = createOrcaRouterProvider({ fetch: fetcher });
  const credential = provider.credentialFor({ apiKey: { secret: "sk-orca-key" } });
  const result = await provider.client.models(credential, "chat");
  assert.equal(result.source, "live");
  assert.deepEqual(result.models.map((model) => model.id), ["deepseek/deepseek-v4.1-flash"]);
  assert.equal(calls[0]!.url, "https://api.orcarouter.ai/v1/models?capability=chat");
  assert.equal((calls[0]!.init.headers as Record<string, string>).authorization, "Bearer sk-orca-key");
});

test("a failed catalogue is reported as degraded rather than repaired with the seed", async () => {
  for (const [response, expected] of [
    [() => new Response("boom", { status: 503 }), /HTTP 503/u],
    [() => { throw new Error("socket closed"); }, /socket closed/u],
  ] as const) {
    const { fetcher } = server(async () => response());
    const provider = createOrcaRouterProvider({ fetch: fetcher });
    const credential = provider.credentialFor({ apiKey: { secret: "sk-orca-key" } });
    const result = await provider.client.models(credential, "chat");
    assert.equal(result.source, "seed");
    // Nothing from the seed is merged into a failed live read; the caller decides what to show.
    assert.deepEqual(result.models, []);
    assert.match(result.detail ?? "", expected);
  }
});

test("the provider declares both entry points on one credential slot and its own origins", async () => {
  const provider = createOrcaRouterProvider({});
  const description = provider.endpoint.credentials[0]!;
  assert.equal(description.endpoint, "orcarouter.default");
  assert.equal(description.slot, "apiKey");
  assert.equal(description.ref.store, "os");
  assert.equal(description.ref.key, "orcarouter.apiKey");
  // The label names both choices, because a single "OrcaRouter" button would hide which one runs.
  assert.match(description.label, /OrcaRouter - API/u);
  assert.match(description.label, /OrcaRouter - Auth/u);
  assert.equal(description.acquisition?.authorizationEndpoint, "https://www.orcarouter.ai/auth");
  assert.equal(description.acquisition?.tokenEndpoint, "https://www.orcarouter.ai/api/v1/auth/keys");
  assert.equal(provider.endpoint.pricing?.kind, "page");
  const labels = provider.adapters({ apiKey: { secret: "sk-orca-key" } }).map((adapter) => adapter.label);
  assert.deepEqual(labels, ["OrcaRouter - API", "OrcaRouter - Auth"]);
});

export { ref };
