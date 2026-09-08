import { requestDeadline } from "@hypit/runtime-kit";
import type { AsyncEndpoint, EndpointCredential, EndpointFulfillment, EndpointInvocationContext, EndpointPollContext, EndpointPricingReader, EndpointStartContext, EndpointOutcome, ImmediateEndpointHandler } from "@hypit/endpoint-kit";
import { defineEndpointPackage, wakeAfter } from "@hypit/endpoint-kit";
import { selectWireModelForRequest } from "@hypit/generation";
import type { GenerationRequest } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef, ResourceStore } from "@hypit/runtime";
import { sealAlignedTranscriptEvidence, speechEvidenceTypes } from "@hypit/speech-evidence";
import {
  assertWhisperXEvidenceWav,
  interpretWhisperXTranscript,
  verifyWhisperXAlignmentRequest,
  whisperXCapabilities,
} from "@hypit/whisperx";
import type { WhisperXTranscriptResponse } from "@hypit/whisperx";
import { hypiHubRouteForCapability, hypiHubRoutes } from "./routes.js";
import { HypiHubUploader } from "./upload.js";
import type { RuntimeDoctorDiagnostic } from "@hypit/runtime-kit";
import { createHypiHubAuth } from "./oauth.js";
import type { HypiHubAuth } from "./oauth.js";

export const hypiHubProviderModuleRef = { name: "@hypit/provider-hypihub", version: "1" } as const;

export type CreateHypiHubProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly baseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly actionLimits?: import("@hypit/endpoint-kit").EndpointActionLimits;
  readonly capabilityConcurrency?: Readonly<Record<string, number>>;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly oauthRequestTimeoutMs?: number;
  readonly pricingRequestTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly uploadPartTimeoutMs?: number;
  readonly uploadPartAttempts?: number;
  readonly downloadAttempts?: number;
  /** HypiHub model used for the Provider-neutral WhisperX alignment capability. */
  readonly transcriptionModel?: string;
  readonly fetch?: typeof globalThis.fetch;
  /** Overrides HypiHub's negotiated upload transport for referenced Resources. */
  readonly publicAssetUrl?: (artifact: BlobRef, artifacts: ResourceStore) => Promise<string>;
};

type Handle = { readonly contract: "hypit.hypihub-operation@1"; readonly jobId: string; readonly route: string; readonly startedAt: number };

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}
function capabilityKey(capability: CapabilityRef): string { return `${capability.module.name}@${capability.module.version}#${capability.name}`; }
function apiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/u, "");
  assert(trimmed.length > 0, "HypiHub base URL is empty");
  const origin = trimmed.replace(/\/(?:v1beta|v1)$/iu, "");
  return `${origin}/v1`;
}
function credential(credentials: Readonly<Record<string, EndpointCredential>>) {
  const value = credentials.apiKey?.secret;
  assert(typeof value === "string" && value.length > 0, "HypiHub login is unavailable; run hypit auth login for HypiHub");
  return credentials.apiKey!;
}
function guidedMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /API key is unavailable|HypiHub login is unavailable|HTTP (?:401|403|404)\b|not enabled for|model_not_found|no_capable_provider/iu.test(message)
    ? `${message}. Sign in to HypiHub at https://hypit.ai with hypit auth login`
    : message;
}
function failure(error: unknown): EndpointOutcome {
  const message = guidedMessage(error);
  return { status: "failed", failure: { code: "HYPIHUB_ERROR", message } };
}

function jobId(value: Record<string, unknown>): string {
  const id = value.id ?? value.job_id;
  assert(typeof id === "string" && id.length > 0, "HypiHub response has no job id");
  return id;
}

type HypiHubModelOperation = "images" | "image_edits" | "videos" | "audio_speech" | "transcriptions";

async function verifyModelRoute(client: HypiHubClient, auth: HypiHubAuth, model: string, operation: HypiHubModelOperation): Promise<void> {
  const card = await client.json(`/models/${encodeURIComponent(model)}`, auth);
  const endpoints = card.endpoints;
  assert(Array.isArray(endpoints) && endpoints.includes(operation),
    `HypiHub model ${model} is not enabled for ${operation} with this API key`);
}

class HypiHubHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

class HypiHubClient {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly downloadAttempts: number;
  readonly fetcher: typeof globalThis.fetch;
  readonly uploader: HypiHubUploader;
  constructor(options: {
    readonly baseUrl: string;
    readonly timeout: number;
    readonly uploadPartTimeout: number;
    readonly uploadPartAttempts: number;
    readonly downloadAttempts: number;
    readonly fetcher: typeof globalThis.fetch;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/$/u, "");
    this.timeout = options.timeout;
    this.downloadAttempts = options.downloadAttempts;
    this.fetcher = options.fetcher;
    this.uploader = new HypiHubUploader({
      baseUrl: this.baseUrl,
      requestTimeoutMs: this.timeout,
      uploadPartTimeoutMs: options.uploadPartTimeout,
      uploadPartAttempts: options.uploadPartAttempts,
      fetch: this.fetcher,
    });
  }
  async json(path: string, auth: HypiHubAuth, init: RequestInit = {}, refreshOnUnauthorized = true): Promise<Record<string, unknown>> {
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(`${this.baseUrl}${path}`, { ...init, signal: deadline.signal, headers: { authorization: `Bearer ${await auth.token()}`, ...(init.headers ?? {}) } }));
      const text = await deadline.wait(response.text()); let body: unknown = {};
      if (response.status === 401 && refreshOnUnauthorized && auth.canRefresh()) {
        await auth.refresh();
        return await this.json(path, auth, init, false);
      }
      if (!response.ok) throw new HypiHubHttpError(response.status, `HypiHub returned HTTP ${response.status}: ${text.slice(0, 300)}`);
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch { throw new Error(`HypiHub returned invalid JSON (${response.status})`); }
      return object(body, "HypiHub response");
    } finally { deadline.finish(); }
  }
  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.downloadAttempts; attempt += 1) {
      const deadline = requestDeadline(this.timeout);
      try {
        const response = await deadline.wait(this.fetcher(url, { signal: deadline.signal }));
        if (!response.ok) throw new Error(`HypiHub asset returned HTTP ${response.status}`);
        return { bytes: new Uint8Array(await deadline.wait(response.arrayBuffer())), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream" };
      } catch (error) {
        lastError = error;
      } finally {
        deadline.finish();
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  async upload(artifact: BlobRef, resources: ResourceStore, auth: HypiHubAuth, refreshOnUnauthorized = true): Promise<string> {
    const bytes = await resources.get(artifact.resource);
    assert(bytes !== undefined, `HypiHub reference artifact ${artifact.resource} is unavailable`);
    assert(bytes.byteLength === artifact.size, `HypiHub reference artifact ${artifact.resource} size differs`);
    try {
      return await this.uploader.upload({ bytes, mediaType: artifact.mediaType }, await auth.token());
    } catch (error) {
      if (refreshOnUnauthorized && auth.canRefresh() && /HTTP 401\b/u.test(error instanceof Error ? error.message : String(error))) {
        await auth.refresh();
        return await this.upload(artifact, resources, auth, false);
      }
      throw error;
    }
  }
  async transcribe(body: Record<string, unknown>, auth: HypiHubAuth): Promise<Record<string, unknown>> {
    return await this.json("/audio/transcriptions", auth, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  async speech(auth: HypiHubAuth, body: Record<string, unknown>, refreshOnUnauthorized = true): Promise<readonly { readonly bytes: Uint8Array; readonly mediaType: string }[]> {
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(`${this.baseUrl}/audio/speech`, {
        method: "POST",
        headers: { authorization: `Bearer ${await auth.token()}`, "content-type": "application/json" },
        body: JSON.stringify({ ...body, output: "b64_json" }),
        signal: deadline.signal,
      }));
      const bytes = new Uint8Array(await deadline.wait(response.arrayBuffer()));
      if (response.status === 401 && refreshOnUnauthorized && auth.canRefresh()) {
        await auth.refresh();
        return await this.speech(auth, body, false);
      }
      if (!response.ok) {
        throw new Error(`HypiHub returned HTTP ${response.status}: ${Buffer.from(bytes).toString("utf8").slice(0, 300)}`);
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
    } finally {
      deadline.finish();
    }
  }
}

function authFor(context: EndpointInvocationContext, client: HypiHubClient): HypiHubAuth {
  return createHypiHubAuth({
    credential: credential(context.credentials),
    baseUrl: client.baseUrl,
    requestTimeoutMs: client.timeout,
    fetch: client.fetcher,
  });
}

function pricingAuth(credentials: Readonly<Record<string, EndpointCredential>>, client: HypiHubClient): HypiHubAuth {
  return createHypiHubAuth({
    credential: credential(credentials),
    baseUrl: client.baseUrl,
    requestTimeoutMs: client.timeout,
    fetch: client.fetcher,
  });
}

function pricingModel(request: import("@hypit/endpoint-kit").EndpointRequest, transcriptionModel: string): string | undefined {
  if (capabilityKey(request.capability) === capabilityKey(whisperXCapabilities.alignment)) {
    return transcriptionModel;
  }
  const route = hypiHubRouteForCapability(request.capability);
  if (route === undefined) return undefined;
  const generation = request.constraints as unknown as GenerationRequest;
  return selectWireModelForRequest(
    route,
    generation,
    request.pendingInputs?.map((input) => input.input),
  );
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

/** The additional model names a card answers to. HypiHub publishes the per-operation
 *  routing names used by the Provider mapping table as aliases of one canonical card. */
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
  assert(typeof apiKey === "string" && apiKey.length > 0, "HypiHub login is unavailable");
  const client = new HypiHubClient({
    baseUrl: apiBaseUrl(options.baseUrl ?? "https://hypit.ai/v1"),
    timeout: options.requestTimeoutMs ?? 30_000,
    uploadPartTimeout: options.uploadPartTimeoutMs ?? 5 * 60_000,
    uploadPartAttempts: options.uploadPartAttempts ?? 3,
    downloadAttempts: options.downloadAttempts ?? 3,
    fetcher: options.fetch ?? globalThis.fetch,
  });
  const auth = createHypiHubAuth({
    credential: { secret: apiKey },
    baseUrl: client.baseUrl,
    requestTimeoutMs: client.timeout,
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
      message: `HypiHub login cannot currently route ${capabilityKey(capability)}`,
      subject: capabilityKey(capability),
    });
  }
  return diagnostics;
}

function generationOperation(route: (typeof hypiHubRoutes)[number], input: Record<string, unknown>): HypiHubModelOperation {
  if (route.media === "audio") return "audio_speech";
  if (route.media === "video") return "videos";
  const hasReferences = Object.entries(input).some(([key, value]) => {
    if (!["images", "reference_images", "reference_image_urls", "reference_videos", "reference_audios", "first_frame", "last_frame"].includes(key)) return false;
    return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0;
  });
  return hasReferences ? "image_edits" : "images";
}

async function complete(client: HypiHubClient, auth: HypiHubAuth, route: (typeof hypiHubRoutes)[number], id: string, artifacts: ResourceStore): Promise<EndpointOutcome> {
  const response = await client.json(`/jobs/${encodeURIComponent(id)}/assets`, auth); const items = response.items;
  assert(Array.isArray(items) && items.length > 0, "HypiHub job has no assets"); const blobs: BlobRef[] = [];
  for (const item of items) { const asset = object(item, "HypiHub asset"); assert(typeof asset.url === "string", "HypiHub asset has no URL"); const downloaded = await client.download(asset.url); blobs.push(await artifacts.put(downloaded.bytes, downloaded.mediaType)); }
  return { status: "completed", result: { value: route.packageResult(blobs) } };
}

async function synthesizeAudio(client: HypiHubClient, context: EndpointInvocationContext, publicAssetUrl: CreateHypiHubProviderOptions["publicAssetUrl"]): Promise<EndpointFulfillment> {
  const route = hypiHubRouteForCapability(context.need.capability);
  assert(route !== undefined && route.media === "audio", "HypiHub does not implement this exact capability");
  const auth = authFor(context, client);
  const compiled = await route.compile(context.need.constraints, async (artifact) => publicAssetUrl === undefined
    ? await client.upload(artifact, context.resources, auth)
    : await publicAssetUrl(artifact, context.resources));
  await verifyModelRoute(client, auth, compiled.model, "audio_speech");
  const audio = await client.speech(auth, { model: compiled.model, ...(compiled.input as Record<string, unknown>) });
  const artifacts = await Promise.all(audio.map(async (item) => await context.resources.put(item.bytes, item.mediaType)));
  return { value: route.packageResult(artifacts) };
}

function endpoint(client: HypiHubClient, pollIntervalMs: number, maxOperationMs: number, publicAssetUrl: CreateHypiHubProviderOptions["publicAssetUrl"]): AsyncEndpoint {
  return {
    async start(context: EndpointStartContext) {
      try {
        const route = hypiHubRouteForCapability(context.need.capability);
        assert(route !== undefined, "HypiHub does not implement this exact capability");
        const auth = authFor(context, client);
        const uploaded = new Map<string, Promise<string>>();
        const resolve = (artifact: BlobRef): Promise<string> => {
          const existing = uploaded.get(artifact.resource);
          if (existing !== undefined) return existing;
          const promise = publicAssetUrl === undefined
            ? client.upload(artifact, context.resources, auth)
            : publicAssetUrl(artifact, context.resources);
          uploaded.set(artifact.resource, promise);
          return promise;
        };
        const compiled = await route.compile(context.need.constraints, resolve);
        assert(route.media !== "audio", "HypiHub audio capabilities use an immediate endpoint");
        const input = compiled.input as Record<string, unknown>;
        const operation = generationOperation(route, input);
        const path = operation === "image_edits" ? "/images/edits"
          : operation === "images" ? "/images/generations" : "/videos";
        await verifyModelRoute(client, auth, compiled.model, operation);
        const response = await client.json(path, auth, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": context.operation }, body: JSON.stringify({ model: compiled.model, ...input }) });
        const status = response.status;
        const remoteEnded = status === "succeeded" || status === "completed";
        const handle: Handle = { contract: "hypit.hypihub-operation@1", jobId: jobId(response), route: capabilityKey(route.capability), startedAt: Date.now() };
        const receipt = { id: handle.jobId };
        await context.checkpoint?.({ handle: canonicalize(handle), receipt, ...(remoteEnded ? { remoteEnded: true as const } : {}) });
        return remoteEnded ? { status: "ready", handle: canonicalize(handle), receipt }
          : { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "submitted" }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context: EndpointPollContext) {
      try {
        const handle = object(context.handle, "HypiHub handle") as unknown as Handle; const route = hypiHubRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.contract === "hypit.hypihub-operation@1" && handle.route === capabilityKey(route.capability), "HypiHub handle is invalid");
        if (Date.now() - handle.startedAt > maxOperationMs) {
          return { status: "failed",
            failure: { code: "HYPIHUB_OPERATION_TIMEOUT", message: "HypiHub operation timed out" } };
        }
        const job = await client.json(`/jobs/${encodeURIComponent(handle.jobId)}`, authFor(context, client)); const status = job.status;
        if (status === "queued" || status === "running" || status === "in_progress") return wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: String(status) });
        if (status === "failed" || status === "queue_expired" || status === "cancelled") {
          const detail = [job.error, job.message, job.reason, job.detail]
            .find((value) => typeof value === "string" && value.length > 0);
          throw new Error(`HypiHub job ${status}${typeof detail === "string" ? `: ${detail}` : ""}`);
        }
        if (status !== "succeeded" && status !== "completed") throw new Error(`HypiHub returned unknown job status ${String(status)}`);
        return { status: "ready", handle: context.handle, receipt: { id: handle.jobId } };
      } catch (error) {
        return failure(error);
      }
    },
    async collect(context) {
      const handle = object(context.handle, "HypiHub handle") as unknown as Handle;
      const route = hypiHubRouteForCapability(context.need.capability);
      assert(route !== undefined && handle.route === capabilityKey(route.capability), "HypiHub collection route differs");
      return await complete(client, authFor(context, client), route, handle.jobId, context.resources);
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
    uploadPartTimeout: uploadPartTimeoutMs,
    uploadPartAttempts,
    downloadAttempts,
    fetcher: options.fetch ?? globalThis.fetch,
  });
  const pricingClient = new HypiHubClient({
    baseUrl: apiBaseUrl(options.baseUrl ?? "https://hypit.ai/v1"),
    timeout: pricingRequestTimeoutMs,
    uploadPartTimeout: uploadPartTimeoutMs,
    uploadPartAttempts,
    downloadAttempts,
    fetcher: options.fetch ?? globalThis.fetch,
  });
  const asyncEndpoint = endpoint(client, options.pollIntervalMs ?? 10_000, operationTimeoutMs, options.publicAssetUrl);
  const audioEndpoint: ImmediateEndpointHandler = async (context) => {
    try {
      return await synthesizeAudio(client, context, options.publicAssetUrl);
    } catch (error) {
      throw new Error(guidedMessage(error), { cause: error });
    }
  };
  const transcriptionModel = options.transcriptionModel?.trim() || "victor-upmeet/whisperx";
  const whisperXEndpoint: ImmediateEndpointHandler = async (context) => {
    try {
      const request = verifyWhisperXAlignmentRequest(context.need.constraints);
      const bytes = await context.resources.get(request.audio.resource);
      assert(bytes !== undefined && bytes.byteLength === request.audio.size,
        `WhisperX evidence Resource ${request.audio.resource} is unavailable or has changed`);
      assertWhisperXEvidenceWav(bytes, request.sampleFrames);
      const auth = authFor(context, client);
      await verifyModelRoute(client, auth, transcriptionModel, "transcriptions");
      const url = options.publicAssetUrl === undefined
        ? await client.upload(request.audio, context.resources, auth)
        : await options.publicAssetUrl(request.audio, context.resources);
      const response = await client.transcribe({
        model: transcriptionModel,
        url,
        response_format: "verbose_json",
        language: request.language,
        timestamp_granularities: ["segment", "word"],
      }, auth);
      const evidence = sealAlignedTranscriptEvidence({
        passages: interpretWhisperXTranscript(response as WhisperXTranscriptResponse, request.sampleFrames),
      });
      return { value: { kind: "inline", value: canonicalize(evidence) } };
    } catch (error) {
      throw new Error(guidedMessage(error), { cause: error });
    }
  };
  const oauthOrigin = new URL(options.baseUrl ?? "https://hypit.ai").origin;
  return defineEndpointPackage({
    module: hypiHubProviderModuleRef, facet: "gateway", instance: options.instance ?? "hypihub.default", pool: options.pool ?? options.instance ?? "hypihub.default",
    pricing: { kind: "page", url: "https://hypit.ai/commercial/pricing/" },
    readPricing: hypiHubPricingReader(pricingClient, transcriptionModel),
    credentials: { apiKey: options.apiKey ?? credentialRef("os", "hypihub.oauth") },
    credentialInputs: { apiKey: {
      label: "HypiHub login",
      acquisition: {
        kind: "oauth2-pkce",
        authorizationEndpoint: new URL("/oauth/consent", oauthOrigin).toString(),
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
