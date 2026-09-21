import { EndpointHttpError, EndpointServiceError } from "@hypit/endpoint-kit";

/** HiAPI's `{ code, message, error_code }` envelope and task `error` object, kept at the service boundary. */
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

// Responses may mention a signed asset URL. Keep the reason, not its access capability.
export function safeHiApiReason(value: string): string {
  return value.replace(/https?:\/\/\S+/giu, "[redacted-url]");
}

export class HiApiServiceError extends EndpointServiceError {}

export class HiApiHttpError extends EndpointHttpError {
  constructor(status: number, response: { readonly headers: Headers }, bodyText: string,
    request: { readonly method: string; readonly path: string; readonly model?: string }) {
    let body: Record<string, unknown> | undefined;
    try { body = record(JSON.parse(bodyText)); } catch { /* Non-JSON gateway failures still have HTTP evidence. */ }
    const code = text(body?.error_code) ?? "HIAPI_HTTP_ERROR";
    const reason = text(body?.message) ?? (body === undefined ? text(bodyText.slice(0, 2000)) : undefined);
    const requestId = text(response.headers.get("x-request-id"));
    const facts = [
      `HiAPI HTTP ${status}`, code, `${request.method} ${request.path}`,
      ...(request.model === undefined ? [] : [`model=${request.model}`]),
      ...(requestId === undefined ? [] : [`request=${requestId}`]),
    ];
    super(code, `${facts.join("; ")}${reason === undefined ? "" : `: ${safeHiApiReason(reason)}`}`, status);
  }
}

/** A terminal `fail` task; `undefined` otherwise. */
export function hiApiTaskFailure(task: Record<string, unknown>, id: string): HiApiServiceError | undefined {
  if (task.status !== "fail") return undefined;
  const error = record(task.error);
  const code = text(error?.code) ?? "HIAPI_TASK_FAILED";
  const reason = text(error?.message);
  return new HiApiServiceError(code,
    `HiAPI task ${id} failed; ${code}${reason === undefined ? "" : `: ${safeHiApiReason(reason)}`}`);
}
