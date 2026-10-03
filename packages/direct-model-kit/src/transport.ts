import type {
  EndpointInvocationContext,
  ResourceStore,
} from "@hypit/endpoint-kit";
import { EndpointTransportError } from "@hypit/endpoint-kit";
import { requestDeadline } from "@hypit/runtime-kit";
import type { BlobRef } from "@hypit/protocol";
export function assert(v: unknown, m: string): asserts v {
  if (!v) throw new Error(m);
}
export function object(
  v: unknown,
  label = "response",
): Record<string, unknown> {
  assert(
    v !== null && typeof v === "object" && !Array.isArray(v),
    `Invalid ${label}`,
  );
  return v as Record<string, unknown>;
}
export function clean(message: string, key = ""): string {
  return (key ? message.split(key).join("[REDACTED_SECRET]") : message)
    .replace(/https?:\/\/[^\s"'<>]+/gu, "[URL]")
    .slice(0, 1200);
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}
export class Client {
  readonly base: string;
  constructor(
    readonly service: string,
    base: string,
    readonly authHeader: string,
    readonly bearer: boolean,
    readonly timeout = 300000,
    readonly fetcher: typeof fetch = fetch,
  ) {
    const url = new URL(base);
    assert(
      !url.username && !url.password && !url.search && !url.hash,
      "API base URL must not contain credentials, query or fragment",
    );
    assert(
      url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)),
      "API base URL must use HTTPS or loopback",
    );
    this.base = base.replace(/\/+$/, "");
  }
  async request(
    path: string,
    key: string,
    init: RequestInit = {},
  ): Promise<{ bytes: Uint8Array; type: string; headers: Headers }> {
    assert(
      path.startsWith("/") && !path.startsWith("//"),
      "API path must be relative",
    );
    assert(key.length > 0, `${this.service} API key unavailable`);
    return this.fetchBytes(
      this.base + path,
      {
        ...init,
        redirect: "error",
        headers: {
          ...init.headers,
          [this.authHeader]: this.bearer ? `Bearer ${key}` : key,
        },
      },
      key,
      128 * 1024 * 1024,
    );
  }
  private async fetchBytes(
    url: string,
    init: RequestInit,
    key: string,
    max: number,
  ) {
    const deadline = requestDeadline(
      this.timeout,
      () =>
        new EndpointTransportError(
          `${this.service} request timed out; remote submission outcome may be unknown`,
        ),
    );
    try {
      const response = await deadline.wait(
        this.fetcher(url, { ...init, signal: deadline.signal }),
      );
      assert(
        Number(response.headers.get("content-length") ?? 0) <= max,
        "Response exceeds byte limit",
      );
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = response.body?.getReader();
      if (reader) {
        try {
          while (true) {
            const r = await deadline.wait(reader.read());
            if (r.done) break;
            total += r.value.byteLength;
            assert(total <= max, "Response exceeds byte limit");
            chunks.push(r.value);
          }
        } catch (e) {
          await reader.cancel().catch(() => {});
          throw e;
        } finally {
          reader.releaseLock();
        }
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      if (!response.ok) {
        let detail: Record<string, unknown> = {};
        try {
          const j = object(JSON.parse(new TextDecoder().decode(bytes)));
          const value = j.error ?? j.detail ?? j;
          detail =
            typeof value === "object" && value !== null && !Array.isArray(value)
              ? object(value)
              : {};
        } catch {}
        const code = String(
            detail.code ?? detail.status ?? `HTTP_${response.status}`,
          ),
          message = clean(
            String(
              detail.message ?? `Request failed with HTTP ${response.status}`,
            ),
            key,
          );
        const retry = response.headers.get("retry-after");
        const ms =
          retry === null
            ? undefined
            : /^\d+(\.\d+)?$/.test(retry)
              ? Number(retry) * 1000
              : Math.max(0, Date.parse(retry) - Date.now());
        throw new ApiError(
          response.status,
          clean(code, key),
          `${this.service}: ${message}`,
          ms !== undefined && Number.isFinite(ms) ? ms : undefined,
        );
      }
      return {
        bytes,
        type:
          response.headers.get("content-type")?.split(";")[0]?.trim() ??
          "application/octet-stream",
        headers: response.headers,
      };
    } catch (e) {
      if (e instanceof ApiError || e instanceof EndpointTransportError) throw e;
      throw new Error(
        `${this.service}: ${clean(e instanceof Error ? e.message : String(e), key)}`,
      );
    } finally {
      deadline.finish();
    }
  }
  async json(path: string, key: string, init: RequestInit = {}) {
    const r = await this.request(path, key, init);
    try {
      return object(JSON.parse(new TextDecoder().decode(r.bytes)));
    } catch {
      throw new Error(`${this.service}: invalid JSON response`);
    }
  }
  async download(
    url: string,
    kind: "image" | "video" | "audio",
    resources: ResourceStore,
  ): Promise<BlobRef> {
    const u = new URL(url);
    assert(
      u.protocol === "https:" && !u.username && !u.password,
      "Asset URL must use HTTPS without credentials",
    );
    // No authorization headers and no redirects to an unvalidated destination.
    const data = await this.fetchBytes(
      url,
      { redirect: "error" },
      "",
      512 * 1024 * 1024,
    );
    assert(
      data.bytes.length > 0 && data.type.startsWith(`${kind}/`),
      `Expected ${kind} media, received ${data.type}`,
    );
    return resources.put(data.bytes, data.type);
  }
}
export function keyFor(context: EndpointInvocationContext) {
  const key = context.credentials.apiKey?.secret;
  assert(typeof key === "string" && key.length > 0, "API key unavailable");
  return key;
}
export async function bytesFor(
  blob: BlobRef,
  context: EndpointInvocationContext,
  max = 25 * 1024 * 1024,
) {
  assert(
    blob.size > 0 && blob.size <= max,
    `Reference exceeds supported byte size (${max})`,
  );
  const bytes = await context.resources.get(blob.resource);
  assert(
    bytes && bytes.byteLength === blob.size,
    "Reference bytes unavailable or changed",
  );
  return bytes;
}
export const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
