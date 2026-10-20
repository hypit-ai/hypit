import { capabilityKey } from "@hypit/hypit/protocol";
import { readFileSync } from "node:fs";
import type { RuntimeDoctorDiagnostic } from "@hypit/runtime-local/extension";
import type { AsyncEndpoint, CredentialRef, EndpointCredential, EndpointFulfillment, EndpointInvocationContext, EndpointPollContext, EndpointPricingReader, EndpointStartContext, EndpointOutcome, ImmediateEndpointHandler, ResourceStore } from "@hypit/hypit/endpoint";
import { credentialRef, EndpointServiceError, defineEndpoint, wakeAfter } from "@hypit/hypit/endpoint";
import { EndpointHttpError, EndpointResponseError, EndpointTransportError, withRequestDeadline } from "@hypit/hypit/endpoint/http";
import { selectWireModelForRequest } from "@hypit/generation/provider";
import type { ProviderFieldRequest } from "@hypit/generation/provider";
import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef } from "@hypit/hypit/protocol";
import { sealAlignedTranscriptEvidence, speechEvidenceTypes } from "@hypit/speech-evidence";
import {
  assertWhisperXEvidenceWav,
  interpretWhisperXTranscript,
  verifyWhisperXAlignmentRequest,
  whisperXCapabilities,
} from "@hypit/whisperx";
import type { WhisperXTranscriptResponse } from "@hypit/whisperx";
import { hypiHubRouteForCapability, hypiHubRoutes } from "./routes.js";
import type { HypiHubModelOperation } from "./routes.js";
import { HypiHubUploader } from "./upload.js";
import { createHypiHubAuth, hypiHubCredentialNeedsRefresh } from "./oauth.js";
import type { HypiHubAuth } from "./oauth.js";
import { HypiHubHttpError, HypiHubServiceError, hypiHubJobFailure } from "./errors.js";

function providerVersion(): string {
  try {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      readonly name?: unknown; readonly version?: unknown;
    };
    if (manifest.name !== "@hypit/provider-hypihub" || typeof manifest.version !== "string" || manifest.version.length === 0) {
      return "unknown";
    }
    return manifest.version;
  } catch {
    return "unknown";
  }
}

const userAgent = `hypit-provider-hypihub/${providerVersion()}`;

const identifiedFetch = (fetcher: typeof globalThis.fetch): typeof globalThis.fetch =>
  async (input, init) => {
    const headers: Record<string, string> = { "user-agent": userAgent };
    new Headers(init?.headers).forEach((value, name) => { headers[name] = value; });
    return await fetcher(input, { ...init, headers });
  };

export const hypiHubProviderModuleRef = { name: "@hypit/provider-hypihub", version: "1" } as const;

export type CreateHypiHubProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly baseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly actionLimits?: import("@hypit/hypit/endpoint").EndpointActionLimits;
  readonly capabilityConcurrency?: Readonly<Record<string, number>>;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly oauthRequestTimeoutMs?: number;
  readonly pricingRequestTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  /** Whole files uploaded concurrently per service and credential in this process. */
  readonly uploadConcurrency?: number;
  readonly uploadPartTimeoutMs?: number;
  readonly uploadPartAttempts?: number;
  readonly downloadAttempts?: number;
  /** HypiHub model used for the Provider-neutral WhisperX alignment capability. */
  readonly transcriptionModel?: string;
  readonly fetch?: typeof globalThis.fetch;
  /** Overrides HypiHub's negotiated upload transport for referenced Resources. */
  readonly publicAssetUrl?: (artifact: BlobRef, artifacts: ResourceStore, fields?: Readonly<Record<string, string | number | boolean>>) => Promise<string>;
};

type Handle = { readonly contract: "hypit.hypihub-operation@1"; readonly jobId: string; readonly route: string; readonly startedAt: number };

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}
function apiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/u, "");
  assert(trimmed.length > 0, "HypiHub base URL is empty");
  const origin = trimmed.replace(/\/(?:v1beta|v1)$/iu, "");
  return `${origin}/v1`;
}
function credential(credentials: Readonly<Record<string, EndpointCredential>>) {
  const value = credentials.apiKey?.secret;
  if (typeof value !== "string" || value.length === 0) {
    throw new HypiHubServiceError("HYPIHUB_CREDENTIAL_UNAVAILABLE",
      "HypiHub apiKey credential is unavailable; configure this Endpoint's credential with a HypiHub API key or OAuth login");
  }
  return credentials.apiKey!;
}
function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function failure(error: unknown): EndpointOutcome {
  if (!(error instanceof EndpointServiceError || error instanceof EndpointHttpError
    || error instanceof EndpointTransportError || error instanceof EndpointResponseError)) throw error;
  const code = error instanceof EndpointServiceError || error instanceof EndpointHttpError ? error.code : "HYPIHUB_ERROR";
  return { status: "failed", failure: { code, message: failureMessage(error) } };
}

function retrying(error: unknown, handle: CanonicalValue, pollIntervalMs: number, deadlineAt?: number): EndpointOutcome | undefined {
  const delay = error instanceof EndpointTransportError ? pollIntervalMs
    : error instanceof EndpointHttpError && (error.status === 429 || error.status >= 500)
      ? error.retryAfterMs ?? pollIntervalMs : undefined;
  if (delay === undefined) return undefined;
  const now = Date.now();
  return { status: "pending", handle, wakeAt: Math.min(now + delay, deadlineAt ?? Number.MAX_SAFE_INTEGER), progress: { phase: "retrying" } };
}
function unknownSubmission(error: unknown): EndpointOutcome | undefined {
  return error instanceof EndpointTransportError ? { status: "failed", failure: {
    code: "HYPIHUB_SUBMISSION_UNKNOWN",
    message: `HypiHub submission transport failed; remote outcome is unknown: ${error.message}`,
  } } : undefined;
}

function jobId(value: Record<string, unknown>): string {
  const id = value.id ?? value.job_id;
  assert(typeof id === "string" && id.length > 0, "HypiHub response has no job id");
  return id;
}

async function verifyModelRoute(client: HypiHubClient, auth: HypiHubAuth, model: string, operation: HypiHubModelOperation): Promise<boolean> {
  let card: Record<string, unknown>;
  try {
    card = await client.json(`/models/${encodeURIComponent(model)}`, auth);
  } catch (error) {
    if (error instanceof EndpointTransportError
      || error instanceof EndpointHttpError && (error.status === 429 || error.status >= 500)) return false;
    throw error;
  }
  const endpoints = card.endpoints;
  if (!Array.isArray(endpoints) || !endpoints.every((value) => typeof value === "string")) {
    throw new EndpointResponseError(`HypiHub model ${model} returned no valid operation list; support for ${operation} is unknown`);
  }
  if (!endpoints.includes(operation)) {
    throw new HypiHubServiceError("HYPIHUB_MODEL_OPERATION_UNAVAILABLE",
      `HypiHub model ${model} does not list operation ${operation}; listed operations: ${endpoints.join(", ") || "none"}`);
  }
  return true;
}

class HypiHubClient {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly oauthTimeout: number;
  readonly downloadAttempts: number;
  readonly fetcher: typeof globalThis.fetch;
  readonly uploader: HypiHubUploader;
  constructor(options: {
    readonly baseUrl: string;
    readonly timeout: number;
    readonly oauthTimeout: number;
    readonly uploadConcurrency: number;
    readonly uploadPartTimeout: number;
    readonly uploadPartAttempts: number;
    readonly downloadAttempts: number;
    readonly fetcher: typeof globalThis.fetch;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/$/u, "");
    this.timeout = options.timeout;
    this.oauthTimeout = options.oauthTimeout;
    this.downloadAttempts = options.downloadAttempts;
    this.fetcher = identifiedFetch(options.fetcher);
    this.uploader = new HypiHubUploader({
      baseUrl: this.baseUrl,
      requestTimeoutMs: this.timeout,
      uploadConcurrency: options.uploadConcurrency,
      uploadPartTimeoutMs: options.uploadPartTimeout,
      uploadPartAttempts: options.uploadPartAttempts,
      fetch: this.fetcher,
    });
  }
  async json(path: string, auth: HypiHubAuth, init: RequestInit = {}, refreshOnUnauthorized = true,
    onResponse?: (response: Response) => Promise<void>): Promise<Record<string, unknown>> {
    const token = await auth.token();
    const result = await withRequestDeadline(this.timeout, async ({ signal, wait }) => {
      const response = await wait(this.fetcher(`${this.baseUrl}${path}`, { ...init, signal, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }));
      if (response.status !== 401 && onResponse !== undefined) await wait(onResponse(response));
      const text = await wait(response.text()); let body: unknown = {};
      if (response.status === 401 && refreshOnUnauthorized && auth.canRefresh()) {
        return undefined;
      }
      if (!response.ok) {
        const input = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        throw new HypiHubHttpError(response.status, response, text, {
          method: init.method ?? "GET", url: `${this.baseUrl}${path}`,
          ...(typeof input?.model === "string" ? { model: input.model } : {}),
        });
      }
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch { throw new EndpointResponseError(`HypiHub returned invalid JSON (${response.status})`); }
      return object(body, "HypiHub response");
    }, () => new EndpointTransportError("HypiHub request timed out", { timeout: true }));
    if (result !== undefined) return result;
    await auth.refresh();
    return await this.json(path, auth, init, false, onResponse);
  }
  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.downloadAttempts; attempt += 1) {
      try {
        return await withRequestDeadline(this.timeout, async ({ signal, wait }) => {
          const response = await wait(this.fetcher(url, { signal }));
          if (!response.ok) throw new HypiHubHttpError(response.status, response, "", { method: "GET", url });
          return { bytes: new Uint8Array(await wait(response.arrayBuffer())), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream" };
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  async upload(artifact: BlobRef, resources: ResourceStore, auth: HypiHubAuth, fields?: Readonly<Record<string, string | number | boolean>>): Promise<string> {
    const bytes = await resources.get(artifact.resource);
    assert(bytes !== undefined, `HypiHub reference artifact ${artifact.resource} is unavailable`);
    assert(bytes.byteLength === artifact.size, `HypiHub reference artifact ${artifact.resource} size differs`);
    const personReference = fields?.personReference;
    assert(personReference === undefined || typeof personReference === "boolean", "HypiHub personReference must be a boolean");
    return await this.uploader.upload({ bytes, mediaType: artifact.mediaType,
      ...(personReference === undefined ? {} : { isPersonReference: personReference }) }, auth);
  }

  async transcribe(body: Record<string, unknown>, auth: HypiHubAuth,
    report?: (message: string) => Promise<void>): Promise<Record<string, unknown>> {
    return await this.json("/audio/transcriptions", auth, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }, true, async (response) => {
      const requestId = response.headers.get("x-request-id");
      if (requestId === null || !/^[A-Za-z0-9_-]{1,200}$/u.test(requestId)) return;
      let retrieval = "";
      const location = response.headers.get("location");
      if (location !== null) {
        try {
          const url = new URL(location, this.baseUrl);
          const expected = new URL(`${this.baseUrl}/audio/transcriptions/${encodeURIComponent(requestId)}`);
          if (url.href === expected.href) retrieval = `; result lookup: ${url.href}`;
        } catch { /* A malformed Location does not erase the request identifier. */ }
      }
      await report?.(`HypiHub transcription request ${requestId} (HTTP ${response.status})${retrieval}`);
    });
  }
  async speech(auth: HypiHubAuth, body: Record<string, unknown>, refreshOnUnauthorized = true): Promise<readonly { readonly bytes: Uint8Array; readonly mediaType: string }[]> {
    const token = await auth.token();
    const result = await withRequestDeadline(this.timeout, async ({ signal, wait }) => {
      const response = await wait(this.fetcher(`${this.baseUrl}/audio/speech`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ...body, output: "b64_json" }),
        signal,
      }));
      const bytes = new Uint8Array(await wait(response.arrayBuffer()));
      if (response.status === 401 && refreshOnUnauthorized && auth.canRefresh()) {
        return undefined;
      }
      if (!response.ok) {
        throw new HypiHubHttpError(response.status, response, Buffer.from(bytes).toString("utf8"), {
          method: "POST", url: `${this.baseUrl}/audio/speech`,
          ...(typeof body.model === "string" ? { model: body.model } : {}),
        });
      }
      const responseType = response.headers.get("content-type")?.split(";", 1)[0] ?? "audio/mpeg";
      if (!responseType.includes("json")) return [{ bytes, mediaType: responseType }];

      let decoded: unknown;
      try {
        decoded = JSON.parse(Buffer.from(bytes).toString("utf8"));
      } catch {
        throw new Error("HypiHub returned invalid audio JSON");
      }
      const root = object(decoded, "HypiHub audio response");
      const values = Array.isArray(root.previews) ? root.previews : [root];
      assert(values.length > 0, "HypiHub audio response contains no audio");
      return await Promise.all(values.map(async (value, index) => {
        const item = object(value, `HypiHub audio response ${index + 1}`);
        const mediaType = typeof item.mime_type === "string" && item.mime_type.startsWith("audio/")
          ? item.mime_type : "audio/mpeg";
        if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
          assert(item.b64_json.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/u.test(item.b64_json),
            `HypiHub audio response ${index + 1} contains malformed Base64`);
          const audio = Uint8Array.from(Buffer.from(item.b64_json, "base64"));
          assert(audio.byteLength > 0, `HypiHub audio response ${index + 1} is empty`);
          return { bytes: audio, mediaType };
        }
        assert(typeof item.url === "string" && /^https?:\/\//u.test(item.url),
          `HypiHub audio response ${index + 1} contains neither audio bytes nor a URL`);
        return await this.download(item.url);
      }));
    });
    if (result !== undefined) return result;
    await auth.refresh();
    return await this.speech(auth, body, false);
  }
}

function authFor(context: EndpointInvocationContext, client: HypiHubClient): HypiHubAuth {
  return createHypiHubAuth({
    credential: credential(context.credentials),
    baseUrl: client.baseUrl,
    requestTimeoutMs: client.oauthTimeout,
    fetch: client.fetcher,
  });
}

function pricingAuth(credentials: Readonly<Record<string, EndpointCredential>>, client: HypiHubClient): HypiHubAuth {
  return createHypiHubAuth({
    credential: credential(credentials),
    baseUrl: client.baseUrl,
    requestTimeoutMs: client.oauthTimeout,
    fetch: client.fetcher,
  });
}

function pricingModel(request: import("@hypit/hypit/endpoint").EndpointRequest, transcriptionModel: string): string | undefined {
  if (capabilityKey(request.capability) === capabilityKey(whisperXCapabilities.alignment)) {
    return transcriptionModel;
  }
  const route = hypiHubRouteForCapability(request.capability);
  if (route === undefined) return undefined;
  const generation = request.constraints as unknown as ProviderFieldRequest;
  return selectWireModelForRequest(route, generation);
}

/** Read HypiHub's own current model-pricing document without calculating a request total. */
function hypiHubPricingReader(client: HypiHubClient, transcriptionModel: string): EndpointPricingReader {
  const documents = new Map<string, Promise<Record<string, unknown>>>();
  return async ({ request, credentials }) => {
    const model = pricingModel(request, transcriptionModel);
    if (model === undefined) return [];
    const path = `/pricing?model=${encodeURIComponent(model)}`;
    let pending = documents.get(model);
    if (pending === undefined) {
      pending = credentials().then(async (resolved) => await client.json(path, pricingAuth(resolved, client)));
      documents.set(model, pending);
    }
    const response = await pending;
    return [{
      source: `${client.baseUrl}${path}`,
      data: canonicalize(response),
    }];
  };
}

function cardEndpoints(card: Record<string, unknown> | undefined): readonly string[] {
  return Array.isArray(card?.endpoints)
    ? card.endpoints.filter((item): item is string => typeof item === "string")
    : [];
}

/** The catalogue's own names for a card: its id and its canonical name. */
function cardIdentifiers(card: Record<string, unknown>): readonly string[] {
  return [card.id, card.canonical_name].filter((name): name is string => typeof name === "string");
}

/** Additional names explicitly published by the service for this card. */
function cardAliases(card: Record<string, unknown>): readonly string[] {
  return Array.isArray(card.aliases)
    ? card.aliases.filter((name): name is string => typeof name === "string")
    : [];
}

/** Active, read-only HypiHub check used only by doctor. */
export async function diagnoseHypiHubProvider(
  options: CreateHypiHubProviderOptions,
  context: {
    readonly credentials: Readonly<Record<string, { readonly secret: string }>>;
    readonly capabilities?: readonly CapabilityRef[];
  },
): Promise<readonly RuntimeDoctorDiagnostic[]> {
  const apiKey = context.credentials.apiKey?.secret;
  assert(typeof apiKey === "string" && apiKey.length > 0, "HypiHub credential is unavailable");
  if (hypiHubCredentialNeedsRefresh(apiKey)) return [{
    severity: "warning",
    code: "HYPIHUB_OAUTH_REFRESH_UNCHECKED",
    message: "The stored HypiHub access token needs refresh. Read-only doctor has not checked account access or refresh validity. Authorized execution can refresh through a writable Credential Store; reconnect if that refresh is rejected.",
  }];
  const client = new HypiHubClient({
    baseUrl: apiBaseUrl(options.baseUrl ?? "https://hypit.ai/v1"),
    timeout: options.requestTimeoutMs ?? 30_000,
    oauthTimeout: options.oauthRequestTimeoutMs ?? 30_000,
    uploadConcurrency: options.uploadConcurrency ?? 8,
    uploadPartTimeout: options.uploadPartTimeoutMs ?? 5 * 60_000,
    uploadPartAttempts: options.uploadPartAttempts ?? 3,
    downloadAttempts: options.downloadAttempts ?? 3,
    fetcher: options.fetch ?? globalThis.fetch,
  });
  const auth = createHypiHubAuth({
    credential: { secret: apiKey },
    baseUrl: client.baseUrl,
    requestTimeoutMs: client.oauthTimeout,
    fetch: client.fetcher,
  });
  const response = await client.json("/models", auth);
  assert(Array.isArray(response.data), "HypiHub model catalogue has no data array");
  const catalogue: Record<string, unknown>[] = [];
  for (const value of response.data) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    catalogue.push(value as Record<string, unknown>);
  }
  const cards = new Map<string, Record<string, unknown>>();
  for (const card of catalogue) for (const name of cardIdentifiers(card)) cards.set(name, card);
  for (const card of catalogue) for (const alias of cardAliases(card)) {
    if (!cards.has(alias)) cards.set(alias, card);
  }
  const transcriptionModel = options.transcriptionModel?.trim() || "victor-upmeet/whisperx";
  const diagnostics: RuntimeDoctorDiagnostic[] = [];
  for (const capability of context.capabilities ?? []) {
    let available = false;
    if (capabilityKey(capability) === capabilityKey(whisperXCapabilities.alignment)) {
      available = cardEndpoints(cards.get(transcriptionModel)).includes("transcriptions");
    } else {
      const route = hypiHubRouteForCapability(capability);
      if (route !== undefined) {
        const acceptable = route.media === "image" ? ["images", "image_edits"]
          : route.media === "video" ? ["videos"] : ["audio_speech"];
        available = route.routes.some(({ model }) => cardEndpoints(cards.get(model))
          .some((endpoint) => acceptable.includes(endpoint)));
      }
    }
    if (!available) diagnostics.push({
      severity: "error",
      code: "HYPIHUB_CAPABILITY_UNAVAILABLE",
      message: `The HypiHub catalogue returned for this credential does not list a route for ${capabilityKey(capability)}`,
      subject: capabilityKey(capability),
    });
  }
  return diagnostics;
}

async function complete(client: HypiHubClient, auth: HypiHubAuth, route: (typeof hypiHubRoutes)[number], id: string, artifacts: ResourceStore): Promise<EndpointOutcome> {
  const response = await client.json(`/jobs/${encodeURIComponent(id)}/assets`, auth); const items = response.items;
  assert(Array.isArray(items) && items.length > 0, "HypiHub job has no assets"); const blobs: BlobRef[] = [];
  for (const item of items) { const asset = object(item, "HypiHub asset"); assert(typeof asset.url === "string", "HypiHub asset has no URL"); const downloaded = await client.download(asset.url); blobs.push(await artifacts.put(downloaded.bytes, downloaded.mediaType)); }
  return { status: "completed", result: { value: route.packageResult(blobs) } };
}

async function prepareGeneration(client: HypiHubClient, context: EndpointInvocationContext, publicAssetUrl: CreateHypiHubProviderOptions["publicAssetUrl"]) {
  const route = hypiHubRouteForCapability(context.need.capability);
  assert(route !== undefined, "HypiHub does not implement this exact capability");
  const request = route.prepare(context.need.constraints);
  const auth = authFor(context, client);
  await context.reportProgress?.({ phase: `Reading HypiHub model catalogue: ${request.model} (${request.operation})` });
  if (!await verifyModelRoute(client, auth, request.model, request.operation)) {
    await context.reportDiagnostic?.({ level: "warning",
      message: `HypiHub model catalogue is temporarily unavailable for ${request.model}; proceeding without a support verdict` });
  }
  await context.reportProgress?.({ phase: `Preparing HypiHub request: ${request.model} (${request.operation})` });
  const uploaded = new Map<string, Promise<string>>();
  const resolve = (artifact: BlobRef, fields?: Readonly<Record<string, string | number | boolean>>): Promise<string> => {
    const key = JSON.stringify([artifact.resource, canonicalize(fields ?? {})]);
    const existing = uploaded.get(key);
    if (existing !== undefined) return existing;
    const promise = publicAssetUrl === undefined
      ? client.upload(artifact, context.resources, auth, fields)
      : publicAssetUrl(artifact, context.resources, fields);
    uploaded.set(key, promise);
    return promise;
  };
  const compiled = await request.compile(resolve);
  return { route, auth, compiled, operation: request.operation };
}

async function synthesizeAudio(client: HypiHubClient, context: EndpointInvocationContext, publicAssetUrl: CreateHypiHubProviderOptions["publicAssetUrl"]): Promise<EndpointFulfillment> {
  const { route, auth, compiled, operation } = await prepareGeneration(client, context, publicAssetUrl);
  assert(route.media === "audio", "HypiHub audio capabilities use an immediate endpoint");
  await context.reportProgress?.({ phase: `Submitting HypiHub request: ${compiled.model} (${operation})` });
  const audio = await client.speech(auth, { model: compiled.model, ...(compiled.input as Record<string, unknown>) });
  const artifacts = await Promise.all(audio.map(async (item) => await context.resources.put(item.bytes, item.mediaType)));
  return { value: route.packageResult(artifacts) };
}

function endpoint(client: HypiHubClient, pollIntervalMs: number, maxOperationMs: number, publicAssetUrl: CreateHypiHubProviderOptions["publicAssetUrl"]): AsyncEndpoint {
  return {
    async start(context: EndpointStartContext) {
      try {
        const { route, auth, compiled, operation } = await prepareGeneration(client, context, publicAssetUrl);
        assert(route.media !== "audio", "HypiHub audio capabilities use an immediate endpoint");
        const input = compiled.input as Record<string, unknown>;
        const path = operation === "image_edits" ? "/images/edits"
          : operation === "images" ? "/images/generations" : "/videos";
        await context.reportProgress?.({ phase: `Submitting HypiHub request: ${compiled.model} (${operation})` });
        let response: Record<string, unknown>;
        try {
          response = await client.json(path, auth, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": context.operation }, body: JSON.stringify({ model: compiled.model, ...input }) });
        } catch (error) {
          const unknown = unknownSubmission(error);
          if (unknown !== undefined) return unknown;
          throw error;
        }
        const status = response.status;
        const remoteEnded = status === "succeeded" || status === "completed";
        const handle: Handle = { contract: "hypit.hypihub-operation@1", jobId: jobId(response), route: capabilityKey(route.capability), startedAt: Date.now() };
        const receipt = { id: handle.jobId };
        await context.checkpoint?.({
          status: remoteEnded ? "ended" : "accepted",
          handle: canonicalize(handle),
          receipt,
        });
        const rejected = hypiHubJobFailure(response, handle.jobId);
        if (rejected !== undefined) return { ...failure(rejected), receipt };
        return remoteEnded ? { status: "ready", handle: canonicalize(handle), receipt }
          : { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "submitted" }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context: EndpointPollContext) {
      let operationDeadlineAt: number | undefined;
      try {
        const handle = object(context.handle, "HypiHub handle") as unknown as Handle; const route = hypiHubRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.contract === "hypit.hypihub-operation@1" && handle.route === capabilityKey(route.capability), "HypiHub handle is invalid");
        operationDeadlineAt = handle.startedAt + maxOperationMs;
        if (Date.now() >= operationDeadlineAt) {
          return { status: "failed",
            receipt: { id: handle.jobId },
            failure: { code: "HYPIHUB_OPERATION_TIMEOUT", message: `HypiHub job ${handle.jobId} exceeded this Provider's operationTimeoutMs (${maxOperationMs}); remote outcome is unknown` } };
        }
        const job = await client.json(`/jobs/${encodeURIComponent(handle.jobId)}`, authFor(context, client)); const status = job.status;
        if (status === "queued" || status === "running" || status === "in_progress") return wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: String(status) });
        const rejected = hypiHubJobFailure(job, handle.jobId);
        if (rejected !== undefined) return { ...failure(rejected), receipt: { id: handle.jobId } };
        if (status !== "succeeded" && status !== "completed") throw new Error(`HypiHub returned unknown job status ${String(status)}`);
        return { status: "ready", handle: context.handle, receipt: { id: handle.jobId } };
      } catch (error) {
        return retrying(error, context.handle, pollIntervalMs, operationDeadlineAt) ?? failure(error);
      }
    },
    async collect(context) {
      try {
        const handle = object(context.handle, "HypiHub handle") as unknown as Handle;
        const route = hypiHubRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.route === capabilityKey(route.capability), "HypiHub collection route differs");
        return await complete(client, authFor(context, client), route, handle.jobId, context.resources);
      } catch (error) { return retrying(error, context.handle, pollIntervalMs) ?? failure(error); }
    },

  };
}

export function createHypiHubProvider(options: CreateHypiHubProviderOptions = {}) {
  const capacityNames = new Set([...hypiHubRoutes.map((route) => route.capability.name), "transcription"]);
  const capabilityConcurrency = options.capabilityConcurrency ?? {};
  for (const [name, limit] of Object.entries(capabilityConcurrency)) {
    assert(capacityNames.has(name), `unknown HypiHub capacity ${name}`);
    assert(Number.isSafeInteger(limit) && limit > 0, `HypiHub ${name} capacity must be a positive integer`);
  }
  const requestTimeoutMs = options.requestTimeoutMs ?? 300_000;
  const oauthRequestTimeoutMs = options.oauthRequestTimeoutMs ?? 30_000;
  const pricingRequestTimeoutMs = options.pricingRequestTimeoutMs ?? 30_000;
  const operationTimeoutMs = options.operationTimeoutMs ?? 20 * 60_000;
  const uploadPartTimeoutMs = options.uploadPartTimeoutMs ?? 5 * 60_000;
  const uploadPartAttempts = options.uploadPartAttempts ?? 3;
  const downloadAttempts = options.downloadAttempts ?? 3;
  for (const [name, value] of Object.entries({
    requestTimeoutMs,
    oauthRequestTimeoutMs,
    pricingRequestTimeoutMs,
    operationTimeoutMs,
    uploadPartTimeoutMs,
    uploadPartAttempts,
    downloadAttempts,
  })) {
    assert(Number.isSafeInteger(value) && value > 0, `HypiHub ${name} must be a positive integer`);
  }
  assert(uploadPartAttempts <= 8, "HypiHub uploadPartAttempts must be within 1..8");
  const client = new HypiHubClient({
    baseUrl: apiBaseUrl(options.baseUrl ?? "https://hypit.ai/v1"),
    timeout: requestTimeoutMs,
    oauthTimeout: oauthRequestTimeoutMs,
    uploadConcurrency: options.uploadConcurrency ?? 8,
    uploadPartTimeout: uploadPartTimeoutMs,
    uploadPartAttempts,
    downloadAttempts,
    fetcher: options.fetch ?? globalThis.fetch,
  });
  const pricingClient = new HypiHubClient({
    baseUrl: apiBaseUrl(options.baseUrl ?? "https://hypit.ai/v1"),
    timeout: pricingRequestTimeoutMs,
    oauthTimeout: oauthRequestTimeoutMs,
    uploadConcurrency: options.uploadConcurrency ?? 8,
    uploadPartTimeout: uploadPartTimeoutMs,
    uploadPartAttempts,
    downloadAttempts,
    fetcher: options.fetch ?? globalThis.fetch,
  });
  const asyncEndpoint = endpoint(client, options.pollIntervalMs ?? 10_000, operationTimeoutMs, options.publicAssetUrl);
  const audioEndpoint: ImmediateEndpointHandler = async (context) =>
    await synthesizeAudio(client, context, options.publicAssetUrl);
  const transcriptionModel = options.transcriptionModel?.trim() || "victor-upmeet/whisperx";
  const whisperXEndpoint: ImmediateEndpointHandler = async (context) => {
    try {
      const request = verifyWhisperXAlignmentRequest(context.need.constraints);
      const bytes = await context.resources.get(request.audio.resource);
      assert(bytes !== undefined && bytes.byteLength === request.audio.size,
        `WhisperX evidence Resource ${request.audio.resource} is unavailable or has changed`);
      assertWhisperXEvidenceWav(bytes, request.sampleFrames);
      const auth = authFor(context, client);
      if (!await verifyModelRoute(client, auth, transcriptionModel, "transcriptions")) {
        await context.reportDiagnostic?.({ level: "warning",
          message: `HypiHub model catalogue is temporarily unavailable for ${transcriptionModel}; proceeding without a support verdict` });
      }
      await context.reportProgress?.({ phase: "Preparing audio for hosted transcription" });
      const url = options.publicAssetUrl === undefined
        ? await client.upload(request.audio, context.resources, auth)
        : await options.publicAssetUrl(request.audio, context.resources);
      await context.reportProgress?.({ phase: "Transcribing and aligning words" });
      const response = await client.transcribe({
        model: transcriptionModel,
        url,
        response_format: "verbose_json",
        language: request.language,
        timestamp_granularities: ["segment", "word"],
      }, auth, async (message) => { await context.reportDiagnostic?.({ level: "info", message }); });
      const evidence = sealAlignedTranscriptEvidence({
        domainId: request.domainId,
        sampleFrames: request.sampleFrames,
        passages: interpretWhisperXTranscript(response as WhisperXTranscriptResponse, request.sampleFrames),
      });
      await context.reportProgress?.({ phase: "Word timing ready" });
      return { value: (canonicalize(evidence)) };
    } catch (error) {
      throw new Error(failureMessage(error), { cause: error });
    }
  };
  const oauthOrigin = new URL(options.baseUrl ?? "https://hypit.ai").origin;
  return defineEndpoint({
    instance: options.instance ?? "hypihub.default", pool: options.pool ?? options.instance ?? "hypihub.default",
    pricing: { kind: "page", url: "https://hypit.ai/commercial/pricing/" },
    readPricing: hypiHubPricingReader(pricingClient, transcriptionModel),
    credentials: { apiKey: options.apiKey ?? credentialRef("local", "hypihub.oauth") },
    credentialInputs: { apiKey: {
      label: "HypiHub credential",
      acquisition: {
        kind: "oauth2-pkce",
        authorizationEndpoint: new URL("/oauth/consent", oauthOrigin).toString(),
        redirectUri: new URL("/oauth/callback", oauthOrigin).toString(),
        tokenEndpoint: new URL("/oauth/token", oauthOrigin).toString(),
        clientId: "hyc_d5d5e8e7131b0c877756e66c",
        scopes: ["user:profile", "user:inference"],
        requestTimeoutMs: oauthRequestTimeoutMs,
      },
    } },
    defaultConcurrency: options.defaultConcurrency ?? 4,
    ...(options.actionLimits === undefined ? {} : { actionLimits: options.actionLimits }),
    capabilities: [
      ...hypiHubRoutes
      .map((route) => route.media === "audio"
        ? { capability: route.capability, returns: route.returns, lifecycle: "immediate" as const, handler: audioEndpoint, capacity: route.capability.name, ...(route.supports === undefined ? {} : { supports: route.supports }), ...(capabilityConcurrency[route.capability.name] === undefined ? {} : { maxConcurrency: capabilityConcurrency[route.capability.name]! }) }
        : { capability: route.capability, returns: route.returns, lifecycle: "asynchronous" as const, endpoint: asyncEndpoint, capacity: route.capability.name, ...(route.supports === undefined ? {} : { supports: route.supports }), ...(capabilityConcurrency[route.capability.name] === undefined ? {} : { maxConcurrency: capabilityConcurrency[route.capability.name]! }) }),
      {
        capability: whisperXCapabilities.alignment,
        returns: speechEvidenceTypes.alignedTranscript,
        lifecycle: "immediate" as const,
        handler: whisperXEndpoint,
        capacity: "transcription",
        ...(capabilityConcurrency.transcription === undefined ? {} : { maxConcurrency: capabilityConcurrency.transcription }),
      },
    ],
  });
}
