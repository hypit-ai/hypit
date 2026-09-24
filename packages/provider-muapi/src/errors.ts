import { EndpointHttpError, EndpointServiceError } from "@hypit/endpoint-kit";

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Keep signed output URLs out of user-visible provider diagnostics. */
export function safeMuApiReason(value: string): string {
  return value.replace(/https?:\/\/\S+/giu, "[redacted-url]");
}

export class MuApiServiceError extends EndpointServiceError {}

export class MuApiHttpError extends EndpointHttpError {
  constructor(status: number, response: { readonly headers: Headers }, bodyText: string,
    request: { readonly method: string; readonly path: string; readonly model?: string }) {
    let body: Record<string, unknown> | undefined;
    try { body = record(JSON.parse(bodyText)); } catch { /* Non-JSON failures still have HTTP evidence. */ }
    const code = text(body?.code) ?? text(body?.error_code) ?? "MUAPI_HTTP_ERROR";
    const reason = text(body?.message) ?? text(body?.error) ?? (body === undefined ? text(bodyText.slice(0, 2000)) : undefined);
    const requestId = text(response.headers.get("x-request-id"));
    const facts = [
      `MuAPI HTTP ${status}`, code, `${request.method} ${request.path}`,
      ...(request.model === undefined ? [] : [`model=${request.model}`]),
      ...(requestId === undefined ? [] : [`request=${requestId}`]),
    ];
    super(code, `${facts.join("; ")}${reason === undefined ? "" : `: ${safeMuApiReason(reason)}`}`, status);
  }
}

function errorReason(value: unknown): string | undefined {
  const objectValue = record(value);
  return text(objectValue?.message) ?? text(objectValue?.error) ?? text(value);
}

/** A terminal failed task; undefined for pending or successful results. */
export function muApiTaskFailure(task: Record<string, unknown>, id: string): MuApiServiceError | undefined {
  if (task.status !== "failed" && task.status !== "fail" && task.status !== "error") return undefined;
  const reason = errorReason(task.error) ?? errorReason(task.message);
  return new MuApiServiceError("MUAPI_TASK_FAILED",
    `MuAPI task ${id} failed${reason === undefined ? "" : `: ${safeMuApiReason(reason)}`}`);
}
