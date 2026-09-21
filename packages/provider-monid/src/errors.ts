import { EndpointHttpError, EndpointServiceError } from "@hypit/endpoint-kit";

/** Monid's `{ code, message }` error envelope and run outcome fields, kept at the service boundary. */
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

// Responses may mention a signed asset URL. Keep the reason, not its access capability.
export function safeMonidReason(value: string): string {
  return value.replace(/https?:\/\/\S+/giu, "[redacted-url]");
}

export class MonidServiceError extends EndpointServiceError {}

export class MonidHttpError extends EndpointHttpError {
  constructor(status: number, response: { readonly headers: Headers }, bodyText: string,
    request: { readonly method: string; readonly path: string }) {
    let body: Record<string, unknown> | undefined;
    try { body = record(JSON.parse(bodyText)); } catch { /* Non-JSON gateway failures still have HTTP evidence. */ }
    const reason = text(body?.message) ?? (body === undefined ? text(bodyText.slice(0, 2000)) : undefined);
    const requestId = text(response.headers.get("x-request-id"));
    const facts = [
      `Monid HTTP ${status}`, `${request.method} ${request.path}`,
      ...(requestId === undefined ? [] : [`request=${requestId}`]),
    ];
    super("MONID_HTTP_ERROR", `${facts.join("; ")}${reason === undefined ? "" : `: ${safeMonidReason(reason)}`}`, status);
  }
}

export const monidTerminalStatuses = ["COMPLETED", "FAILED", "BLOCKED", "STOPPED", "TIMED_OUT"] as const;

/**
 * A run that ended without provider output: a non-COMPLETED terminal status, or COMPLETED with a
 * provider HTTP error. `undefined` while the run is pending or when the provider answered 2xx.
 */
export function monidRunFailure(run: Record<string, unknown>, id: string): MonidServiceError | undefined {
  const status = String(run.status);
  if (status !== "COMPLETED") {
    if (!monidTerminalStatuses.includes(status as typeof monidTerminalStatuses[number])) return undefined;
    const reason = text(run.reason);
    return new MonidServiceError(`MONID_RUN_${status}`,
      `Monid run ${id} ${status}${reason === undefined ? "" : `: ${safeMonidReason(reason)}`}`);
  }
  const provider = record(run.providerResponse);
  const httpStatus = typeof provider?.httpStatus === "number" ? provider.httpStatus : 200;
  if (httpStatus < 400) return undefined;
  const error = record(provider?.error);
  const detail = text(error?.message) ?? text(record(error?.error)?.message) ?? text(provider?.error);
  return new MonidServiceError("MONID_PROVIDER_ERROR",
    `Monid run ${id} completed with provider HTTP ${httpStatus}${detail === undefined ? "" : `: ${safeMonidReason(detail)}`}`);
}
