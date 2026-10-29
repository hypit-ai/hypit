import { EndpointServiceError } from "@hypit/hypit/endpoint";
import { EndpointHttpError, retryAfterMs } from "@hypit/hypit/endpoint/http";

/** BeatAPI's `{ error: { code, message, request_id, retry_after_seconds } }` envelope and terminal task errors. */
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

// Responses may mention a hosted result URL. Keep the reason, not its access capability.
export function safeBeatApiReason(value: string): string {
  return value.replace(/https?:\/\/\S+/giu, "[redacted-url]");
}

// Download and upload targets are signed URLs whose query is an access capability.
function signedUrlTarget(path: string): string {
  return /^https?:\/\//iu.test(path) ? path.replace(/[?#].*$/su, "") : path;
}

export class BeatApiServiceError extends EndpointServiceError {}

export class BeatApiHttpError extends EndpointHttpError {
  constructor(status: number, response: { readonly headers: Headers }, bodyText: string,
    request: { readonly method: string; readonly path: string; readonly model?: string }) {
    let body: Record<string, unknown> | undefined;
    try { body = record(JSON.parse(bodyText)); } catch { /* Non-JSON gateway failures still have HTTP evidence. */ }
    const error = record(body?.error);
    const code = text(error?.code) ?? "BEATAPI_HTTP_ERROR";
    const reason = text(error?.message) ?? (error === undefined ? text(bodyText.slice(0, 2000)) : undefined);
    const requestId = text(error?.request_id) ?? text(response.headers.get("x-request-id"));
    const serviceRetryAfter = typeof error?.retry_after_seconds === "number" ? Math.round(error.retry_after_seconds * 1000) : undefined;
    const retryAfter = serviceRetryAfter ?? retryAfterMs(response.headers);
    const facts = [
      `BeatAPI HTTP ${status}`, code, `${request.method} ${signedUrlTarget(request.path)}`,
      ...(request.model === undefined ? [] : [`model=${request.model}`]),
      ...(requestId === undefined ? [] : [`request=${requestId}`]),
      ...(retryAfter === undefined ? [] : [`retry-after=${retryAfter}ms`]),
    ];
    super(code, `${facts.join("; ")}${reason === undefined ? "" : `: ${safeBeatApiReason(reason)}`}`,
      status, retryAfter);
  }
}

/** A terminal `failed` task; `undefined` otherwise. */
export function beatApiTaskFailure(task: Record<string, unknown>, id: string): BeatApiServiceError | undefined {
  if (task.status !== "failed") return undefined;
  const code = text(task.error_code) ?? "BEATAPI_TASK_FAILED";
  const reason = text(task.error_message);
  return new BeatApiServiceError(code,
    `BeatAPI task ${id} failed; ${code}${reason === undefined ? "" : `: ${safeBeatApiReason(reason)}`}`);
}
