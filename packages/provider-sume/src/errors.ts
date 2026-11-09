import { EndpointServiceError } from "@hypit/hypit/endpoint";
import { EndpointHttpError, retryAfterMs } from "@hypit/hypit/endpoint/http";

/** Sume's `{ error: { code, message, request_id, retry_after_seconds, details } }` envelope and failed jobs. */
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

// Responses may carry a signed upload or result URL. Keep the reason, not its access capability.
export function safeSumeReason(value: string): string {
  return value.replace(/https?:\/\/\S+/giu, "[redacted-url]");
}

export class SumeServiceError extends EndpointServiceError {}

export class SumeHttpError extends EndpointHttpError {
  constructor(status: number, response: { readonly headers: Headers }, bodyText: string,
    request: { readonly method: string; readonly path: string; readonly model?: string }) {
    let body: Record<string, unknown> | undefined;
    try { body = record(JSON.parse(bodyText)); } catch { /* Non-JSON gateway failures still have HTTP evidence. */ }
    const error = record(body?.error);
    const code = text(error?.code) ?? "SUME_HTTP_ERROR";
    const reason = text(error?.message) ?? (error === undefined ? text(bodyText.slice(0, 2000)) : undefined);
    const details = error?.details === undefined ? undefined : JSON.stringify(error.details).slice(0, 1000);
    const requestId = text(error?.request_id) ?? text(response.headers.get("x-sume-request-id"));
    const serviceRetryAfter = typeof error?.retry_after_seconds === "number" ? Math.round(error.retry_after_seconds * 1000) : undefined;
    const retryAfter = serviceRetryAfter ?? retryAfterMs(response.headers);
    const facts = [
      `Sume HTTP ${status}`, code, `${request.method} ${request.path}`,
      ...(request.model === undefined ? [] : [`model=${request.model}`]),
      ...(requestId === undefined ? [] : [`request=${requestId}`]),
      ...(retryAfter === undefined ? [] : [`retry-after=${retryAfter}ms`]),
    ];
    const message = [reason, details].filter((item) => item !== undefined).join(" ");
    super(code, `${facts.join("; ")}${message.length === 0 ? "" : `: ${safeSumeReason(message)}`}`,
      status, retryAfter);
  }
}

/** A terminal `failed` or `canceled` job; `undefined` otherwise. */
export function sumeJobFailure(status: string, job: Record<string, unknown> | undefined, id: string): SumeServiceError | undefined {
  if (status !== "failed" && status !== "canceled") return undefined;
  const error = record(job?.error);
  const code = text(error?.code) ?? text(error?.public_reason) ?? (status === "canceled" ? "SUME_JOB_CANCELED" : "SUME_JOB_FAILED");
  const upstream = text(record(error?.details)?.provider_error_message);
  const reason = [text(error?.message) ?? text(job?.error), upstream].filter((item) => item !== undefined).join(" ") || undefined;
  return new SumeServiceError(code,
    `Sume job ${id} ${status}; ${code}${reason === undefined ? "" : `: ${safeSumeReason(reason)}`}`);
}
