import { EndpointResponseError, withRequestDeadline } from "./http.js";
import { createHash } from "node:crypto";

import { HypiHubHttpError, HypiHubServiceError, safeHypiHubReason } from "./errors.js";
import { HypiHubOAuthError } from "./oauth.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, subject: string): string {
  assert(typeof value === "string" && value.length > 0, `${subject} is missing`);
  return value;
}

function requiredInteger(value: unknown, subject: string): number {
  assert(typeof value === "number" && Number.isSafeInteger(value) && value > 0, `${subject} is invalid`);
  return value;
}

function extension(mediaType: string): string {
  const known: Readonly<Record<string, string>> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
    "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a",
  };
  return known[mediaType.toLowerCase()] ?? "bin";
}

function apiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/u, "");
  assert(trimmed.length > 0, "HypiHub upload base URL is empty");
  return `${trimmed.replace(/\/(?:v1beta|v1)$/iu, "")}/v1`;
}

export type HypiHubUploaderOptions = {
  readonly baseUrl: string;
  readonly requestTimeoutMs: number;
  /** Whole files per origin/credential in this process. Defaults to 8; any positive safe integer. */
  readonly uploadConcurrency?: number;
  readonly uploadPartTimeoutMs?: number;
  readonly uploadPartAttempts?: number;
  readonly fetch: typeof globalThis.fetch;
  readonly authenticatedFetch: typeof globalThis.fetch;
  readonly credentialId: string;
  /** Optional diagnostic sink. Messages exclude credentials and signed URLs. */
  readonly logger?: (message: string) => void;
};

export type HypiHubUploadInput = {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly filename?: string;
  readonly purpose?: string;
  readonly isPersonReference?: boolean;
};

type PartDeclaration = {
  readonly part_number: number;
  readonly bytes: number;
  readonly checksum_sha256: string;
};

type CompletedPart = {
  readonly part_number: number;
  readonly etag: string;
  readonly checksum_sha256: string;
};

function assertHTTPS(value: string, subject: string): void {
  let protocol = "";
  try { protocol = new URL(value).protocol; }
  catch { throw new Error(`${subject} is invalid`); }
  assert(protocol === "https:", `${subject} must use HTTPS`);
}

// A provider can upload references from several operations/uploader instances.
// Bound whole file sessions, independently of each file's S3 part concurrency.
type UploadGate = { active: number; limits: Map<number, number>; waiting: (() => void)[] };
const uploadGates = new Map<string, UploadGate>();
function drainUploadGate(gate: UploadGate): void {
  const limit = Math.min(...gate.limits.keys());
  while (gate.active < limit && gate.waiting.length > 0) {
    gate.active += 1;
    gate.waiting.shift()!();
  }
}
async function acquireUploadSlot(origin: string, credentialId: string, limit: number): Promise<() => void> {
  const key = `${origin}:${credentialId}`;
  let gate = uploadGates.get(key);
  if (gate === undefined) { gate = { active: 0, limits: new Map(), waiting: [] }; uploadGates.set(key, gate); }
  // Instances sharing a credential share capacity. The strictest outstanding
  // caller wins; a lower limit drains existing work without cancelling it.
  gate.limits.set(limit, (gate.limits.get(limit) ?? 0) + 1);
  await new Promise<void>((resolve) => { gate.waiting.push(resolve); drainUploadGate(gate); });
  return () => {
    gate.active -= 1;
    const remaining = (gate.limits.get(limit) ?? 1) - 1;
    if (remaining === 0) gate.limits.delete(limit); else gate.limits.set(limit, remaining);
    drainUploadGate(gate);
    if (gate.active === 0 && gate.waiting.length === 0) uploadGates.delete(key);
  };
}

/** Uploads media using the transfer mode negotiated by the selected HypiHub service. */
export class HypiHubUploader {
  readonly baseUrl: string;
  readonly requestTimeout: number;
  readonly uploadConcurrency: number;
  readonly uploadPartTimeout: number;
  readonly uploadPartAttempts: number;
  readonly fetcher: typeof globalThis.fetch;
  readonly authenticatedFetch: typeof globalThis.fetch;
  readonly credentialId: string;
  readonly logger: (message: string) => void;

  constructor(options: HypiHubUploaderOptions) {
    this.baseUrl = apiBaseUrl(options.baseUrl);
    this.requestTimeout = requiredInteger(options.requestTimeoutMs, "HypiHub upload request timeout");
    this.uploadConcurrency = requiredInteger(options.uploadConcurrency ?? 8, "HypiHub uploadConcurrency");
    this.uploadPartTimeout = requiredInteger(options.uploadPartTimeoutMs ?? 5 * 60_000,
      "HypiHub upload part timeout");
    this.uploadPartAttempts = requiredInteger(options.uploadPartAttempts ?? 3,
      "HypiHub upload part attempts");
    assert(this.uploadPartAttempts <= 8, "HypiHub upload part attempts must be within 1..8");
    this.fetcher = options.fetch;
    this.authenticatedFetch = options.authenticatedFetch;
    this.credentialId = options.credentialId;
    this.logger = options.logger ?? (() => {});
  }

  private log(message: string): void { this.logger(message); }

  private elapsed(startedAt: number): string { return `${Date.now() - startedAt}ms`; }

  private safeReason(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return safeHypiHubReason(message);
  }

  private async json(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const existingSession = /^\/files\/uploads\/[^/]+(?:\/(?:parts|complete))?$/u.test(path);
    const deadline = Date.now() + (existingSession ? Math.min(this.requestTimeout, 120_000) : this.requestTimeout);
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.jsonOnce(path, init, Math.max(1, deadline - Date.now()));
      } catch (error) {
        if (error instanceof HypiHubOAuthError) throw error;
        const http = error instanceof HypiHubHttpError ? error : undefined;
        // Existing-session operations are idempotent. A new session may only
        // be retried after an explicit 429 rejection, never an unknown result.
        const retryable = http !== undefined
          ? ([408, 429, 500, 502, 503, 504].includes(http.status)
            || (http.status === 409 && http.code === "upload_incomplete"))
          : existingSession;
        const rejectedCreate = path === "/files/uploads" && http?.status === 429;
        if (attempt >= 3 || !retryable || (!existingSession && !rejectedCreate)
          || http?.code === "upload_daily_limit" || http?.code === "upload_storage_limit") throw error;
        const delay = http?.retryAfterMs ?? 500 * 2 ** attempt;
        // Respect a server's retry time; do not shorten it to fit our budget.
        if (Date.now() + delay >= deadline) throw error;
        this.log(`upload control retry method=${init.method ?? "GET"} path=${path} attempt=${attempt + 2} delay_ms=${delay}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async jsonOnce(path: string, init: RequestInit, timeoutMs: number): Promise<Record<string, unknown>> {
    return await withRequestDeadline(timeoutMs, async ({ signal, wait }) => {
      const response = await wait(this.authenticatedFetch(`${this.baseUrl}${path}`, {
        ...init,
        signal, redirect: "error",
      }));
      const text = await wait(response.text());
      let body: unknown = {};
      try { body = text.length === 0 ? {} : JSON.parse(text); }
      catch {
        if (response.ok) throw new EndpointResponseError(`HypiHub returned invalid JSON (${response.status})`);
      }
      if (!response.ok) {
        throw new HypiHubHttpError(response.status, response, text, {
          method: init.method ?? "GET", url: `${this.baseUrl}${path}`,
        });
      }
      return object(body, "HypiHub response");
    });
  }

  private async signParts(uploadId: string, declarations: readonly PartDeclaration[]): Promise<Map<number, Record<string, unknown>>> {
    // HypiHub accepts at most 128 part declarations per signing request.
    if (declarations.length > 128) {
      const signed = new Map<number, Record<string, unknown>>();
      for (let offset = 0; offset < declarations.length; offset += 128) {
        for (const [number, part] of await this.signParts(uploadId, declarations.slice(offset, offset + 128))) {
          signed.set(number, part);
        }
      }
      return signed;
    }
    const startedAt = Date.now();
    this.log(`part signing started upload=${uploadId} parts=${declarations.length}`);
    const response = await this.json(`/files/uploads/${encodeURIComponent(uploadId)}/parts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts: declarations }),
    });
    assert(Array.isArray(response.parts), "HypiHub part signing response has no parts");
    const signed = new Map<number, Record<string, unknown>>();
    for (const raw of response.parts) {
      const item = object(raw, "HypiHub signed upload part");
      const partNumber = requiredInteger(item.part_number, "HypiHub signed upload part number");
      assertHTTPS(requiredString(item.url, "HypiHub signed upload URL"), "HypiHub signed upload URL");
      object(item.headers, "HypiHub signed upload headers");
      signed.set(partNumber, item);
    }
    assert(signed.size === declarations.length, "HypiHub signed an incomplete part set");
    this.log(`part signing completed upload=${uploadId} parts=${declarations.length} elapsed=${this.elapsed(startedAt)}`);
    return signed;
  }

  private signedHeaders(value: unknown, declaration: PartDeclaration): Record<string, string> {
    const raw = object(value, "HypiHub signed upload headers");
    const headers = new Map<string, string>();
    for (const [name, headerValue] of Object.entries(raw)) {
      assert(typeof headerValue === "string", `HypiHub signed upload header ${name} is invalid`);
      headers.set(name.toLowerCase(), headerValue);
    }
    const contentLength = requiredString(headers.get("content-length"), "HypiHub signed Content-Length");
    const checksum = requiredString(headers.get("x-amz-checksum-sha256"), "HypiHub signed checksum");
    assert(contentLength === String(declaration.bytes), "HypiHub signed a different part size");
    assert(checksum === declaration.checksum_sha256, "HypiHub signed a different part checksum");
    return { "content-length": contentLength, "x-amz-checksum-sha256": checksum };
  }

  private async putPart(uploadId: string, declaration: PartDeclaration, initial: Record<string, unknown>, body: Uint8Array): Promise<CompletedPart> {
    let capability = initial;
    for (let attempt = 0; attempt < this.uploadPartAttempts; attempt += 1) {
      if (attempt > 0) {
        const refreshed = await this.signParts(uploadId, [declaration]);
        capability = refreshed.get(declaration.part_number) ?? {};
      }
      const startedAt = Date.now();
      this.log(`part upload started upload=${uploadId} part=${declaration.part_number} bytes=${declaration.bytes} attempt=${attempt + 1}`);
      try {
        return await withRequestDeadline(this.uploadPartTimeout, async ({ signal, wait }) => {
          const url = requiredString(capability.url, "HypiHub signed upload URL");
          assertHTTPS(url, "HypiHub signed upload URL");
          const payload = new ArrayBuffer(body.byteLength);
          new Uint8Array(payload).set(body);
          const response = await wait(this.fetcher(url, {
            method: "PUT",
            headers: this.signedHeaders(capability.headers, declaration),
            body: payload,
            signal, redirect: "error",
          }));
          if (!response.ok) throw new Error(`S3 rejected upload part ${declaration.part_number} with HTTP ${response.status}`);
          const etag = response.headers.get("etag");
          assert(etag !== null && etag.length > 0, `S3 upload part ${declaration.part_number} returned no ETag`);
          const verified = response.headers.get("x-amz-checksum-sha256");
          assert(verified === null || verified === declaration.checksum_sha256,
            `S3 upload part ${declaration.part_number} returned a different checksum`);
          this.log(`part upload completed upload=${uploadId} part=${declaration.part_number} bytes=${declaration.bytes} attempt=${attempt + 1} elapsed=${this.elapsed(startedAt)}`);
          return {
            part_number: declaration.part_number,
            etag,
            checksum_sha256: declaration.checksum_sha256,
          };
        });
      } catch (error) {
        this.log(`part upload failed upload=${uploadId} part=${declaration.part_number} attempt=${attempt + 1} elapsed=${this.elapsed(startedAt)} reason=${this.safeReason(error)}`);
        if (attempt + 1 < this.uploadPartAttempts) {
          this.log(`part upload retry scheduled upload=${uploadId} part=${declaration.part_number} next_attempt=${attempt + 2}`);
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    }
    // A presigned URL is a temporary credential, so never include the fetcher's URL-bearing error.
    throw new Error(`S3 upload part ${declaration.part_number} failed after ${this.uploadPartAttempts} attempts`);
  }

  private async uploadDirect(bytes: Uint8Array, policy: Record<string, unknown>): Promise<string> {
    const uploadId = requiredString(policy.upload_id, "HypiHub upload id");
    try {
      const partSize = requiredInteger(policy.part_size, "HypiHub upload part size");
      const partCount = requiredInteger(policy.part_count, "HypiHub upload part count");
      const requestedConcurrency = requiredInteger(policy.concurrency, "HypiHub upload concurrency");
      assert(requestedConcurrency <= 8, "HypiHub upload concurrency exceeds 8");
      assert(partCount <= 10_000, "HypiHub upload part count exceeds 10000");
      assert(partCount === Math.ceil(bytes.byteLength / partSize), "HypiHub upload part count differs from the file size");
      const declarations = Array.from({ length: partCount }, (_, index) => {
        const start = index * partSize;
        const part = bytes.subarray(start, Math.min(start + partSize, bytes.byteLength));
        return {
          part_number: index + 1,
          bytes: part.byteLength,
          checksum_sha256: createHash("sha256").update(part).digest("base64"),
        };
      });
      this.log(`multipart upload negotiated upload=${uploadId} bytes=${bytes.byteLength} part_size=${partSize} parts=${partCount} concurrency=${requestedConcurrency}`);
      const signed = await this.signParts(uploadId, declarations);
      const completed = new Array<CompletedPart>(partCount);
      let cursor = 0;
      let workerFailed = false;
      const worker = async (): Promise<void> => {
        while (!workerFailed && cursor < partCount) {
          const index = cursor;
          cursor += 1;
          const declaration = declarations[index];
          assert(declaration !== undefined, "HypiHub upload part declaration is missing");
          const start = index * partSize;
          const body = bytes.subarray(start, Math.min(start + partSize, bytes.byteLength));
          const capability = signed.get(declaration.part_number);
          assert(capability !== undefined, `HypiHub upload part ${declaration.part_number} was not signed`);
          try { completed[index] = await this.putPart(uploadId, declaration, capability, body); }
          catch (error) { workerFailed = true; throw error; }
        }
      };
      // Let in-flight part requests settle before cancellation; otherwise a
      // surviving worker can keep uploading into a session we just aborted.
      const results = await Promise.allSettled(Array.from({ length: Math.min(requestedConcurrency, partCount) }, worker));
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      const completeStartedAt = Date.now();
      this.log(`multipart complete started upload=${uploadId} parts=${partCount}`);
      const response = await this.json(`/files/uploads/${encodeURIComponent(uploadId)}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parts: completed }),
      });
      const url = requiredString(response.url, "HypiHub direct upload URL");
      assert(/^https:\/\//iu.test(url), "HypiHub direct upload returned no HTTPS URL");
      this.log(`multipart complete finished upload=${uploadId} parts=${partCount} elapsed=${this.elapsed(completeStartedAt)}`);
      return url;
    } catch (error) {
      this.log(`multipart upload failed upload=${uploadId} reason=${this.safeReason(error)}`);
      try { await this.json(`/files/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" }); }
      catch (cancelError) {
        if (!(cancelError instanceof HypiHubHttpError && (cancelError.status === 404
          || (cancelError.status === 409 && cancelError.code === "upload_completed")))) {
          this.log(`upload cancellation still pending upload=${uploadId} reason=${this.safeReason(cancelError)}`);
        }
      }
      throw error instanceof HypiHubServiceError || error instanceof HypiHubHttpError || error instanceof HypiHubOAuthError
        ? error
        : new HypiHubServiceError("HYPIHUB_UPLOAD_FAILED",
          `HypiHub reference upload failed before generation submission: ${this.safeReason(error)}`);
    }
  }

  async upload(input: HypiHubUploadInput): Promise<string> {
    const release = await acquireUploadSlot(this.baseUrl, this.credentialId, this.uploadConcurrency);
    try { return await this.uploadWithSlot(input); }
    finally { release(); }
  }

  private async uploadWithSlot(input: HypiHubUploadInput): Promise<string> {
    assert(input.bytes.byteLength > 0, "HypiHub reference Resource is empty");
    const startedAt = Date.now();
    // Required wire checksum, not a Resource identity or a reuse key.
    const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
    this.log(`upload started bytes=${input.bytes.byteLength} mime=${input.mediaType}`);
    let policy: Record<string, unknown>;
    const policyStartedAt = Date.now();
    this.log(`upload session request started bytes=${input.bytes.byteLength} mime=${input.mediaType}`);
    try {
      policy = await this.json("/files/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: input.filename ?? `reference.${extension(input.mediaType)}`,
          bytes: input.bytes.byteLength,
          mime_type: input.mediaType,
          purpose: input.purpose ?? "reference",
          ...(input.isPersonReference === undefined ? {} : { is_person_reference: input.isPersonReference }),
          sha256: checksumSha256,
          head_base64: Buffer.from(input.bytes.subarray(0, 512)).toString("base64"),
        }),
      });
      this.log(`upload session request finished elapsed=${this.elapsed(policyStartedAt)}`);
    } catch (error) {
      this.log(`upload session request failed elapsed=${this.elapsed(policyStartedAt)} reason=${this.safeReason(error)}`);
      throw error;
    }
    assert(policy.upload_mode === "s3_multipart" || policy.upload_mode === "api_multipart",
      "HypiHub returned an unknown upload mode");
    const result = policy.upload_mode === "api_multipart"
      ? await this.uploadApi(input, policy)
      : await this.uploadDirect(input.bytes, policy);
    this.log(`upload finished bytes=${input.bytes.byteLength} mime=${input.mediaType} elapsed=${this.elapsed(startedAt)}`);
    return result;
  }

  private async uploadApi(input: HypiHubUploadInput, policy: Record<string, unknown>): Promise<string> {
    const endpoint = new URL(requiredString(policy.endpoint, "HypiHub file upload endpoint"), this.baseUrl);
    assert(endpoint.href === `${this.baseUrl}/files`, "HypiHub file upload endpoint must belong to the selected service");
    if (policy.max_bytes !== undefined) {
      assert(input.bytes.byteLength <= requiredInteger(policy.max_bytes, "HypiHub file upload byte limit"),
        "HypiHub reference exceeds the negotiated file upload byte limit");
    }
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(input.bytes)], { type: input.mediaType }),
      input.filename ?? `reference.${extension(input.mediaType)}`);
    form.set("purpose", input.purpose ?? "reference");
    if (input.isPersonReference !== undefined) form.set("is_person_reference", String(input.isPersonReference));
    const response = await this.json("/files", { method: "POST", body: form });
    const url = requiredString(response.url, "HypiHub file upload URL");
    assertHTTPS(url, "HypiHub file upload URL");
    return url;
  }
}
