/** Pollo's `{ errorCode, message, code, requestId }` envelope and generation `failMsg`, kept at the service boundary. */
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

// Responses may mention a signed asset URL. Keep the reason, not its access capability.
export function safePolloReason(value: string): string {
  return value.replace(/https?:\/\/\S+/giu, "[redacted-url]");
}

export class PolloServiceError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export class PolloHttpError extends PolloServiceError {
  constructor(readonly status: number, bodyText: string, request: { readonly method: string; readonly path: string }) {
    let body: Record<string, unknown> | undefined;
    try { body = record(JSON.parse(bodyText)); } catch { /* Non-JSON gateway failures still have HTTP evidence. */ }
    const code = text(body?.errorCode) ?? "POLLO_HTTP_ERROR";
    const reason = text(body?.message) ?? (body === undefined ? text(bodyText.slice(0, 2000)) : undefined);
    const requestId = text(body?.requestId);
    const facts = [
      `Pollo HTTP ${status}`, code, `${request.method} ${request.path}`,
      ...(requestId === undefined ? [] : [`request=${requestId}`]),
    ];
    super(code, `${facts.join("; ")}${reason === undefined ? "" : `: ${safePolloReason(reason)}`}`);
  }
}

/** The first failed generation of a task; `undefined` when none failed. */
export function polloTaskFailure(generations: readonly Record<string, unknown>[], id: string): PolloServiceError | undefined {
  const failed = generations.find((generation) => generation.status === "failed");
  if (failed === undefined) return undefined;
  const reason = text(failed.failMsg);
  return new PolloServiceError("POLLO_TASK_FAILED",
    `Pollo task ${id} failed${reason === undefined ? "" : `: ${safePolloReason(reason)}`}`);
}
