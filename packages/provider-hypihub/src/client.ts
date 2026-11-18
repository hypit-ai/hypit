import { createHash } from "node:crypto";
import type { ExecutionResourceSource } from "@hypit/execution";
import type { ProviderContext, ProviderFailure, ProviderPending } from "@hypit/execution/provider";
import type { ModelReference } from "@hypit/execution/model";
import { HypiHubHttpError, HypiHubServiceError, safeHypiHubReason } from "./errors.js";
import { EndpointResponseError, EndpointTransportError, transport } from "./http.js";
import { HypiHubUploader } from "./upload.js";
import { fetchWithHypiHubCredential, hypiHubBaseUrl, type HypiHubAuthentication, type HypiHubCredentialSource } from "./authentication.js";
import { HypiHubOAuthError } from "./oauth.js";

export type HypiHubOptions = HypiHubAuthentication & {
  readonly id: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly uploadConcurrency?: number;
};

export function record(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new EndpointResponseError(`Invalid HypiHub ${subject}.`);
  }
  return value as Record<string, unknown>;
}

export function failed(error: unknown, code: string): ProviderFailure {
  const specific = error instanceof HypiHubServiceError || error instanceof HypiHubHttpError || error instanceof HypiHubOAuthError
    ? error.code : code;
  return { status: "failed", failure: { code: specific, message: safeHypiHubReason(error instanceof Error ? error.message : String(error)) } };
}

export function transient(error: unknown): boolean {
  return error instanceof EndpointTransportError
    || error instanceof HypiHubHttpError && (error.status === 408 || error.status === 429 || error.status >= 500);
}

export function rejectedSubmission(error: unknown): boolean {
  return error instanceof HypiHubOAuthError || error instanceof HypiHubHttpError && error.status >= 400 && error.status < 500
    && ![408, 409, 425].includes(error.status);
}

function positive(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) throw new Error(`${label} must be a positive timeout or count.`);
  return value;
}

function mediaType(response: Response, fallback: string): string {
  const declared = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
  return !declared || declared === "application/octet-stream" ? fallback : declared;
}

async function* streamBody(body: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = body.getReader();
  try {
    while (true) {
      const chunk = await transport(reader.read());
      if (chunk.done) return;
      yield chunk.value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function readBytes(input: ExecutionResourceSource, max: number, signal: AbortSignal): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of input.bytes) {
    signal.throwIfAborted();
    size += chunk.byteLength;
    if (size > max) throw new Error(`HypiHub reference exceeds ${max} bytes.`);
    chunks.push(chunk);
  }
  if (size === 0) throw new Error("HypiHub reference is empty.");
  return Buffer.concat(chunks, size);
}

export class HypiHubClient {
  readonly base: string;
  readonly interval: number;
  readonly operationTimeout: number;
  readonly #requestTimeout: number;
  readonly #uploadConcurrency: number;
  readonly #credential: HypiHubCredentialSource;
  readonly #authenticatedFetch: typeof globalThis.fetch;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: HypiHubOptions) {
    const url = hypiHubBaseUrl(options.baseUrl);
    this.base = url.href.replace(/\/+$/u, "").replace(/\/v1$/u, "") + "/v1";
    this.interval = positive(options.pollIntervalMs ?? 5_000, "HypiHub poll interval");
    this.operationTimeout = positive(options.operationTimeoutMs ?? 30 * 60_000, "HypiHub operation timeout");
    this.#requestTimeout = positive(options.requestTimeoutMs ?? 5 * 60_000, "HypiHub request timeout");
    this.#uploadConcurrency = positive(options.uploadConcurrency ?? 4, "HypiHub upload concurrency");
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (options.credential === undefined) {
      const key = options.apiKey.trim();
      if (key === "") throw new Error("HypiHub needs an API key.");
      this.#credential = {
        id: `api-key:${createHash("sha256").update(key).digest("hex")}`,
        origin: url.origin,
        accessToken: async () => key,
        inspectAccess: async () => ({ status: "connected", token: key }),
      };
      this.#authenticatedFetch = (target, init) => {
        const headers = new Headers(init?.headers);
        headers.set("authorization", `Bearer ${key}`);
        return transport(this.#fetch(target, { ...init, headers, redirect: "error" }));
      };
    } else {
      if (options.credential.origin !== url.origin) throw new Error("The OAuth connection belongs to a different HypiHub origin.");
      this.#credential = options.credential;
      this.#authenticatedFetch = (target, init) => fetchWithHypiHubCredential(
        this.#fetch, this.#credential, String(target), init ?? {},
      );
    }
  }

  inspectAccess() {
    return this.#credential.inspectAccess?.();
  }

  async inspectCatalogue(token: string, signal: AbortSignal) {
    const target = `${this.base}/models`;
    const response = await transport(this.#fetch(target, { redirect: "error",
      headers: { authorization: `Bearer ${token}` }, signal }));
    if (!response.ok) {
      const body = await transport(response.text()).catch(() => "");
      throw new HypiHubHttpError(response.status, response, body, { method: "GET", url: target });
    }
    return record(await transport(response.json()), "model catalogue");
  }

  pending(error?: unknown, progress?: string): ProviderPending {
    return { status: "pending", retryAfterMs: Math.max(1, Math.ceil(
      (error instanceof HypiHubHttpError ? error.retryAfterMs : undefined) ?? this.interval)),
      ...(progress === undefined ? {} : { progress }) };
  }

  credentialPending(error: unknown): ProviderPending | undefined {
    if (!(error instanceof HypiHubOAuthError)) return undefined;
    return this.pending(error, error.code === "hypihub-authorization-required"
      ? "Reconnect the HypiHub account to resume this task" : "Waiting for HypiHub authorization");
  }

  async response(path: string, signal: AbortSignal, init: RequestInit = {}, onResponse?: (response: Response) => Promise<void>) {
    const target = `${this.base}${path}`;
    const response = await this.#authenticatedFetch(target, { ...init,
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.#requestTimeout)]) });
    if (onResponse !== undefined) await onResponse(response);
    if (response.ok) return response;
    const body = await transport(response.text()).catch(() => "");
    throw new HypiHubHttpError(response.status, response, body, { method: init.method ?? "GET", url: target });
  }

  async json(path: string, signal: AbortSignal, init?: RequestInit, onResponse?: (response: Response) => Promise<void>) {
    const response = await this.response(path, signal, init, onResponse);
    return record(await transport(response.json()), "response");
  }

  post(body: object, invocation: string): RequestInit {
    return { method: "POST", headers: { "content-type": "application/json", "idempotency-key": invocation,
      "x-request-id": invocation }, body: JSON.stringify(body) };
  }

  async download(urlValue: unknown, signal: AbortSignal, fallback: string): Promise<ExecutionResourceSource> {
    if (typeof urlValue !== "string") throw new EndpointResponseError("HypiHub asset has no download URL.");
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || url.username || url.password) throw new EndpointResponseError("Invalid HypiHub asset URL.");
    const response = await transport(this.#fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(this.#requestTimeout)]) }));
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new HypiHubHttpError(response.status, response, "", { method: "GET", url: url.origin });
    }
    return this.resource(response, fallback);
  }

  resource(response: Response, fallback: string): ExecutionResourceSource {
    if (response.body === null) throw new EndpointResponseError("HypiHub media response is empty.");
    return { mediaType: mediaType(response, fallback), bytes: streamBody(response.body) };
  }

  /** Opens invocation-owned bytes once per resource and classification, in request order. */
  inputs(context: ProviderContext) {
    const uploaded = new Map<string, Promise<string>>();
    const scopedFetch = (fetcher: typeof globalThis.fetch): typeof globalThis.fetch =>
      (url, init) => fetcher(url, { ...init, signal: AbortSignal.any([
        context.signal, ...(init?.signal ? [init.signal] : []),
      ]) });
    const uploader = new HypiHubUploader({
      baseUrl: this.base, requestTimeoutMs: this.#requestTimeout, uploadConcurrency: this.#uploadConcurrency,
      credentialId: this.#credential.id,
      fetch: scopedFetch(this.#fetch),
      authenticatedFetch: scopedFetch(this.#authenticatedFetch),
    });
    return {
      url: async (ref: ModelReference): Promise<string> => {
        const key = JSON.stringify([ref.resource, ref.personReference ?? null]);
        let work = uploaded.get(key);
        if (work === undefined) {
          const source = context.openInput(ref.resource);
          work = readBytes(source, 200 * 1024 * 1024, context.signal).then(bytes => uploader.upload({
            bytes, mediaType: source.mediaType,
            ...(ref.personReference === undefined ? {} : { isPersonReference: ref.personReference }),
          }));
          uploaded.set(key, work);
        }
        return await work;
      },
      inline: async (ref: ModelReference, maxBytes: number): Promise<string> => {
        const source = context.openInput(ref.resource);
        const bytes = await readBytes(source, maxBytes, context.signal);
        return `data:${source.mediaType};base64,${bytes.toString("base64")}`;
      },
    };
  }
}

export type HypiHubInputs = ReturnType<HypiHubClient["inputs"]>;
