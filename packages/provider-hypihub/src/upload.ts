import { requestDeadline } from "@hypit/runtime-kit";
import { createHash } from "node:crypto";

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

function assertHTTPS(value: string, subject: string): void {
  let protocol = "";
  try { protocol = new URL(value).protocol; }
  catch { throw new Error(`${subject} is invalid`); }
  assert(protocol === "https:", `${subject} must use HTTPS`);
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/giu, "[redacted-url]").slice(0, 300);
}

export type HypiHubUploaderOptions = {
  readonly baseUrl: string;
  readonly requestTimeoutMs: number;
  readonly uploadPartTimeoutMs: number;
  readonly uploadPartAttempts: number;
  readonly fetch: typeof globalThis.fetch;
};

export type HypiHubUploadInput = {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly filename?: string;
  readonly purpose?: string;
};

type PartDeclaration = {
  readonly part_number: number;
  readonly bytes: number;
  /** Required by the signed S3 transport; never used as a Hypit Resource identity. */
  readonly checksum_sha256: string;
};

type CompletedPart = {
  readonly part_number: number;
  readonly etag: string;
  readonly checksum_sha256: string;
};

/** Provider-private transport for HypiHub's negotiated regional multipart upload. */
export class HypiHubUploader {
  readonly #baseUrl: string;
  readonly #requestTimeoutMs: number;
  readonly #uploadPartTimeoutMs: number;
  readonly #uploadPartAttempts: number;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: HypiHubUploaderOptions) {
    this.#baseUrl = apiBaseUrl(options.baseUrl);
    this.#requestTimeoutMs = requiredInteger(options.requestTimeoutMs, "HypiHub request timeout");
    this.#uploadPartTimeoutMs = requiredInteger(options.uploadPartTimeoutMs, "HypiHub upload part timeout");
    this.#uploadPartAttempts = requiredInteger(options.uploadPartAttempts, "HypiHub upload part attempts");
    assert(this.#uploadPartAttempts <= 8, "HypiHub upload part attempts must be within 1..8");
    this.#fetch = options.fetch;
  }

  async #json(path: string, apiKey: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const deadline = requestDeadline(this.#requestTimeoutMs);
    try {
      const response = await deadline.wait(this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
        signal: deadline.signal,
        headers: { authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
      }));
      const text = await deadline.wait(response.text());
      let body: unknown = {};
      try { body = text.length === 0 ? {} : JSON.parse(text); }
      catch { throw new Error(`HypiHub returned invalid JSON (${response.status})`); }
      if (!response.ok) {
        throw new Error(`HypiHub returned HTTP ${response.status}: ${safeMessage(text)}`);
      }
      return object(body, "HypiHub response");
    } finally {
      deadline.finish();
    }
  }

  async #signParts(
    uploadId: string,
    declarations: readonly PartDeclaration[],
    apiKey: string,
  ): Promise<Map<number, Record<string, unknown>>> {
    const response = await this.#json(`/files/uploads/${encodeURIComponent(uploadId)}/parts`, apiKey, {
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
    return signed;
  }

  #signedHeaders(value: unknown, declaration: PartDeclaration): Record<string, string> {
    const raw = object(value, "HypiHub signed upload headers");
    const headers: Record<string, string> = {};
    for (const [name, headerValue] of Object.entries(raw)) {
      assert(typeof headerValue === "string", `HypiHub signed upload header ${name} is invalid`);
      headers[name.toLowerCase()] = headerValue;
    }
    assert(headers["content-length"] === String(declaration.bytes),
      "HypiHub signed a different part size");
    assert(headers["x-amz-checksum-sha256"] === declaration.checksum_sha256,
      "HypiHub signed a different part checksum");
    return headers;
  }

  async #putPart(
    uploadId: string,
    declaration: PartDeclaration,
    initial: Record<string, unknown>,
    bytes: Uint8Array,
    apiKey: string,
  ): Promise<CompletedPart> {
    let signed = initial;
    for (let attempt = 1; attempt <= this.#uploadPartAttempts; attempt += 1) {
      if (attempt > 1) {
        signed = (await this.#signParts(uploadId, [declaration], apiKey)).get(declaration.part_number) ?? {};
      }
      const deadline = requestDeadline(this.#uploadPartTimeoutMs);
      try {
        const url = requiredString(signed.url, "HypiHub signed upload URL");
        assertHTTPS(url, "HypiHub signed upload URL");
        const body = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(body).set(bytes);
        const response = await deadline.wait(this.#fetch(url, {
          method: "PUT",
          headers: this.#signedHeaders(signed.headers, declaration),
          body,
          signal: deadline.signal,
        }));
        if (!response.ok) throw new Error(`S3 rejected upload part with HTTP ${response.status}`);
        const etag = response.headers.get("etag");
        assert(etag !== null && etag.length > 0,
          `HypiHub upload part ${declaration.part_number} returned no ETag`);
        const returnedChecksum = response.headers.get("x-amz-checksum-sha256");
        assert(returnedChecksum === null || returnedChecksum === declaration.checksum_sha256,
          `HypiHub upload part ${declaration.part_number} returned a different checksum`);
        return {
          part_number: declaration.part_number,
          etag,
          checksum_sha256: declaration.checksum_sha256,
        };
      } catch {
        if (attempt === this.#uploadPartAttempts) {
          throw new Error(`HypiHub upload part ${declaration.part_number} failed after ${attempt} attempts`);
        }
      } finally {
        deadline.finish();
      }
    }
    throw new Error(`HypiHub upload part ${declaration.part_number} failed`);
  }

  async #uploadParts(
    bytes: Uint8Array,
    apiKey: string,
    policy: Record<string, unknown>,
  ): Promise<string> {
    const uploadId = requiredString(policy.upload_id, "HypiHub upload id");
    const partSize = requiredInteger(policy.part_size, "HypiHub upload part size");
    const partCount = requiredInteger(policy.part_count, "HypiHub upload part count");
    const concurrency = requiredInteger(policy.concurrency, "HypiHub upload concurrency");
    assert(concurrency <= 8, "HypiHub upload concurrency exceeds 8");
    assert(partCount <= 10_000, "HypiHub upload part count exceeds 10000");
    assert(partCount === Math.ceil(bytes.byteLength / partSize),
      "HypiHub upload part count differs from the file size");

    const declarations = Array.from({ length: partCount }, (_, index): PartDeclaration => {
      const part = bytes.subarray(index * partSize, Math.min((index + 1) * partSize, bytes.byteLength));
      return {
        part_number: index + 1,
        bytes: part.byteLength,
        checksum_sha256: createHash("sha256").update(part).digest("base64"),
      };
    });

    try {
      const signed = await this.#signParts(uploadId, declarations, apiKey);
      const completed = new Array<CompletedPart>(partCount);
      let cursor = 0;
      const worker = async (): Promise<void> => {
        while (cursor < partCount) {
          const index = cursor;
          cursor += 1;
          const declaration = declarations[index];
          assert(declaration !== undefined, "HypiHub upload part declaration is missing");
          const capability = signed.get(declaration.part_number);
          assert(capability !== undefined, `HypiHub upload part ${declaration.part_number} was not signed`);
          const part = bytes.subarray(index * partSize, Math.min((index + 1) * partSize, bytes.byteLength));
          completed[index] = await this.#putPart(uploadId, declaration, capability, part, apiKey);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, partCount) }, worker));
      const response = await this.#json(`/files/uploads/${encodeURIComponent(uploadId)}/complete`, apiKey, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parts: completed }),
      });
      const url = requiredString(response.url, "HypiHub upload URL");
      assertHTTPS(url, "HypiHub upload URL");
      return url;
    } catch (error) {
      try {
        await this.#json(`/files/uploads/${encodeURIComponent(uploadId)}`, apiKey, { method: "DELETE" });
      } catch {
        // The upload already failed; cancellation is best-effort cleanup, not recovery.
      }
      // A signed transport URL may be present in a lower-level failure. Do not
      // retain that failure as a public cause after the upload has been cancelled.
      throw new Error(safeMessage(error));
    }
  }

  async upload(input: HypiHubUploadInput, apiKey: string): Promise<string> {
    assert(input.bytes.byteLength > 0, "HypiHub reference Resource is empty");
    // The current HypiHub upload protocol asks for a whole-file transport checksum.
    // It is not persisted by Hypit and never participates in Resource identity or reuse.
    const transportChecksum = createHash("sha256").update(input.bytes).digest("hex");
    const policy = await this.#json("/files/uploads", apiKey, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: input.filename ?? `reference.${extension(input.mediaType)}`,
        bytes: input.bytes.byteLength,
        mime_type: input.mediaType,
        purpose: input.purpose ?? "reference",
        sha256: transportChecksum,
        head_base64: Buffer.from(input.bytes.subarray(0, 512)).toString("base64"),
      }),
    });
    assert(policy.upload_mode === "s3_multipart", "HypiHub returned an unknown upload mode");
    return await this.#uploadParts(input.bytes, apiKey, policy);
  }
}
