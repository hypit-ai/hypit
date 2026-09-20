import { requestDeadline } from "@hypit/runtime-kit";
import type { AsyncEndpoint, EndpointCredential, EndpointInvocationContext, EndpointOutcome } from "@hypit/endpoint-kit";
import { defineEndpointPackage, wakeAfter } from "@hypit/endpoint-kit";
import type { GenerationArtifactUrlResolver } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef, ResourceStore } from "@hypit/runtime";
import { higgsfieldRouteForCapability, higgsfieldRoutes } from "./routes.js";
import { HiggsfieldHttpError, HiggsfieldServiceError, higgsfieldRequestFailure } from "./errors.js";

export const higgsfieldProviderModuleRef = { name: "@hypit/provider-higgsfield", version: "1" } as const;

export type CreateHiggsfieldProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly baseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly actionLimits?: import("@hypit/endpoint-kit").EndpointActionLimits;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  /** Publish a referenced Resource at a URL the service can fetch; replaces the presigned upload. */
  readonly publicAssetUrl?: (artifact: BlobRef, artifacts: ResourceStore, fields?: Readonly<Record<string, string | number | boolean>>) => Promise<string>;
};

type Handle = {
  readonly contract: "hypit.higgsfield-operation@1";
  readonly requestId: string;
  readonly statusUrl: string;
  readonly route: string;
  readonly startedAt: number;
  readonly url?: string;
};

/** Content types the presigned upload accepts. https://docs.higgsfield.ai/docs/concepts/file-uploads */
const uploadMediaTypes: readonly string[] = [
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
  "audio/wav", "audio/x-wav", "video/mp4",
];

/** States a request passes through before it is terminal. https://docs.higgsfield.ai/docs/concepts/requests */
const pendingStatuses: readonly string[] = ["queued", "in_progress"];

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}
function apiBaseUrl(value: string): string {
  let trimmed = value.trim();
  while (trimmed.endsWith("/")) trimmed = trimmed.slice(0, -1);
  assert(trimmed.length > 0, "Higgsfield base URL is empty");
  const url = new URL(trimmed);
  assert(url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1",
    "Higgsfield base URL must use HTTPS or loopback");
  return trimmed;
}
/** One address the service returned for its own API; it must stay on the configured host. */
function serviceUrl(value: unknown, baseUrl: string, subject: string): string {
  assert(typeof value === "string" && value.length > 0, `${subject} is missing`);
  const url = new URL(value as string);
  assert(url.origin === new URL(baseUrl).origin, `${subject} points at another host`);
  return url.href;
}
function httpsUrl(value: unknown, subject: string): string {
  assert(typeof value === "string" && /^https:\/\//u.test(value), `${subject} has no HTTPS URL`);
  return value;
}
/** `Authorization: Key KEY_ID:KEY_SECRET`. https://docs.higgsfield.ai/docs/authentication */
function authorization(credentials: Readonly<Record<string, EndpointCredential>>): string {
  const value = credentials.apiKey?.secret;
  assert(typeof value === "string" && value.trim().includes(":"),
    "Higgsfield apiKey credential is unavailable or is not KEY_ID:KEY_SECRET; store the key pair for this Endpoint");
  return `Key ${(value as string).trim()}`;
}
function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function failure(error: unknown): EndpointOutcome {
  return { status: "failed", failure: { code: error instanceof HiggsfieldServiceError ? error.code : "HIGGSFIELD_ERROR", message: failureMessage(error) } };
}

class HiggsfieldClient {
  constructor(readonly baseUrl: string, readonly timeout: number, readonly fetcher: typeof globalThis.fetch) {}

  async json(url: string, auth: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(url, {
        ...init, signal: deadline.signal, headers: { authorization: auth, ...(init.headers ?? {}) },
      }));
      const text = await deadline.wait(response.text());
      if (!response.ok) {
        throw new HiggsfieldHttpError(response.status, response, text, {
          method: init.method ?? "GET", path: new URL(url).pathname,
        });
      }
      let body: unknown;
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch { throw new Error(`Higgsfield returned invalid JSON (${response.status})`); }
      return object(body, "Higgsfield response");
    } finally { deadline.finish(); }
  }

  /**
   * Higgsfield accepts media only by public URL, so a reference is uploaded through its presigned
   * ticket: the account key reaches the API, never the storage URL.
   */
  async upload(artifact: BlobRef, resources: ResourceStore, auth: string): Promise<string> {
    assert(uploadMediaTypes.includes(artifact.mediaType),
      `Higgsfield uploads accept ${uploadMediaTypes.join(", ")}, not ${artifact.mediaType}`);
    const bytes = await resources.get(artifact.resource);
    assert(bytes !== undefined && bytes.byteLength === artifact.size, `Reference Resource ${artifact.resource} is unavailable or has changed`);
    const ticket = await this.json(`${this.baseUrl}/files/generate-upload-url`, auth, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ content_type: artifact.mediaType }),
    });
    const uploadUrl = httpsUrl(ticket.upload_url, "Higgsfield upload_url");
    const publicUrl = httpsUrl(ticket.public_url, "Higgsfield public_url");
    const headers: Record<string, string> = { "content-type": artifact.mediaType };
    for (const [name, value] of Object.entries(object(ticket.upload_headers ?? {}, "Higgsfield upload_headers"))) {
      if (typeof value === "string") headers[name] = value;
    }
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(uploadUrl, {
        method: "PUT", headers, body: new Blob([new Uint8Array(bytes)]), signal: deadline.signal,
      }));
      assert(response.ok, `Higgsfield presigned upload returned HTTP ${response.status} for ${artifact.resource}`);
    } finally { deadline.finish(); }
    return publicUrl;
  }

  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(url, { signal: deadline.signal }));
      if (!response.ok) throw new Error(`Higgsfield asset returned HTTP ${response.status}`);
      return { bytes: new Uint8Array(await deadline.wait(response.arrayBuffer())), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream" };
    } finally { deadline.finish(); }
  }
}

function resolverFor(client: HiggsfieldClient, context: EndpointInvocationContext, publicAssetUrl: CreateHiggsfieldProviderOptions["publicAssetUrl"]): GenerationArtifactUrlResolver {
  const resolved = new Map<string, Promise<string>>();
  return (artifact, fields) => {
    const existing = resolved.get(artifact.resource);
    if (existing !== undefined) return existing;
    const promise = publicAssetUrl === undefined
      ? client.upload(artifact, context.resources, authorization(context.credentials))
      : publicAssetUrl(artifact, context.resources, fields);
    resolved.set(artifact.resource, promise);
    return promise;
  };
}

function endpoint(client: HiggsfieldClient, pollIntervalMs: number, maxOperationMs: number, publicAssetUrl: CreateHiggsfieldProviderOptions["publicAssetUrl"]): AsyncEndpoint {
  return {
    async start(context) {
      try {
        const route = higgsfieldRouteForCapability(context.need.capability);
        assert(route !== undefined, "Higgsfield does not implement this exact capability");
        const request = route.prepare(context.need.constraints);
        await context.reportProgress?.({ phase: `Preparing Higgsfield request: ${request.endpoint}` });
        let body: Record<string, unknown>;
        try {
          body = await request.compile(resolverFor(client, context, publicAssetUrl));
        } catch (error) {
          throw new HiggsfieldServiceError(error instanceof HiggsfieldServiceError ? error.code : "HIGGSFIELD_ERROR",
            `Higgsfield request preparation failed; endpoint=${request.endpoint}; generation not submitted: ${failureMessage(error)}`);
        }
        await context.reportProgress?.({ phase: `Submitting Higgsfield request: ${request.endpoint}` });
        const accepted = await client.json(`${client.baseUrl}/${request.endpoint}`, authorization(context.credentials), {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        });
        assert(typeof accepted.request_id === "string" && accepted.request_id.length > 0, "Higgsfield response has no request_id");
        // The service supplies the polling address; it is used rather than reconstructed.
        const statusUrl = serviceUrl(accepted.status_url, client.baseUrl, "Higgsfield status_url");
        const handle: Handle = {
          contract: "hypit.higgsfield-operation@1", requestId: accepted.request_id, statusUrl,
          route: route.key, startedAt: Date.now(),
        };
        const receipt = { id: handle.requestId };
        await context.checkpoint?.({ handle: canonicalize(handle), receipt });
        return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "submitted" }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context) {
      try {
        const handle = object(context.handle, "Higgsfield handle") as unknown as Handle;
        const route = higgsfieldRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.contract === "hypit.higgsfield-operation@1" && handle.route === route.key, "Higgsfield handle is invalid");
        const receipt = { id: handle.requestId };
        if (Date.now() - handle.startedAt > maxOperationMs) {
          return { status: "failed", receipt, failure: { code: "HIGGSFIELD_OPERATION_TIMEOUT", message: `Higgsfield request ${handle.requestId} exceeded this Provider's operationTimeoutMs (${maxOperationMs}); remote outcome is unknown` } };
        }
        const state = await client.json(handle.statusUrl, authorization(context.credentials));
        const status = String(state.status);
        if (pendingStatuses.includes(status)) {
          return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: status }), receipt };
        }
        const rejected = higgsfieldRequestFailure(state, handle.requestId);
        if (rejected !== undefined) return { ...failure(rejected), receipt };
        // A completed request without its output URL is a service contract violation, not a pending job.
        const url = httpsUrl(object(state.video, "Higgsfield video output").url, "Higgsfield video output");
        return { status: "ready", handle: canonicalize({ ...handle, url }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async collect(context) {
      try {
        const handle = object(context.handle, "Higgsfield handle") as unknown as Handle;
        const route = higgsfieldRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.route === route.key, "Higgsfield collection route differs");
        await context.reportProgress?.({ phase: "Receiving generated video" });
        const downloaded = await client.download(httpsUrl(handle.url, "Higgsfield output"));
        assert(downloaded.mediaType.startsWith("video/"), `Higgsfield output is ${downloaded.mediaType}, not a video`);
        const artifact = await context.resources.put(downloaded.bytes, downloaded.mediaType);
        return { status: "completed", result: { value: route.packageResult([artifact]) }, receipt: { id: handle.requestId } };
      } catch (error) {
        return failure(error);
      }
    },
    async cancel(context) {
      // Cancellation is available only while every job in the request is still queued.
      const handle = object(context.handle, "Higgsfield handle") as unknown as Handle;
      const deadline = requestDeadline(client.timeout);
      try {
        const response = await deadline.wait(client.fetcher(`${client.baseUrl}/requests/${encodeURIComponent(handle.requestId)}/cancel`, {
          method: "POST", signal: deadline.signal, headers: { authorization: authorization(context.credentials) },
        }));
        if (response.ok) return { status: "accepted" };
        return response.status === 400 ? { status: "too-late" } : { status: "unsupported" };
      } finally { deadline.finish(); }
    },
  };
}

export function createHiggsfieldProvider(options: CreateHiggsfieldProviderOptions = {}) {
  const requestTimeoutMs = options.requestTimeoutMs ?? 300_000;
  const operationTimeoutMs = options.operationTimeoutMs ?? 30 * 60_000;
  for (const [name, value] of Object.entries({ requestTimeoutMs, operationTimeoutMs })) {
    assert(Number.isSafeInteger(value) && value > 0, `Higgsfield ${name} must be a positive integer`);
  }
  const client = new HiggsfieldClient(apiBaseUrl(options.baseUrl ?? "https://api.higgsfield.ai"), requestTimeoutMs, options.fetch ?? globalThis.fetch);
  const asyncEndpoint = endpoint(client, options.pollIntervalMs ?? 5_000, operationTimeoutMs, options.publicAssetUrl);
  return defineEndpointPackage({
    module: higgsfieldProviderModuleRef, facet: "gateway", instance: options.instance ?? "higgsfield.default", pool: options.pool ?? options.instance ?? "higgsfield.default",
    pricing: { kind: "page", url: "https://console.higgsfield.ai" },
    credentials: { apiKey: options.apiKey ?? credentialRef("os", "higgsfield.api-key") },
    credentialInputs: { apiKey: { label: "Higgsfield API key as KEY_ID:KEY_SECRET" } },
    defaultConcurrency: options.defaultConcurrency ?? 4,
    ...(options.actionLimits === undefined ? {} : { actionLimits: options.actionLimits }),
    capabilities: higgsfieldRoutes.map((route) => ({
      capability: route.capability, returns: route.returns, lifecycle: "asynchronous" as const, endpoint: asyncEndpoint, capacity: route.capability.name, supports: route.supports,
    })),
  });
}
