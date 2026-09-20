/** Higgsfield's `{ detail }` HTTP envelope and the terminal request states it reports. */
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

// Responses may quote a signed input or output URL. Keep the reason, not its access capability.
export function safeHiggsfieldReason(value: string): string {
  return value.replace(/https?:\/\/\S+/giu, "[redacted-url]");
}

export class HiggsfieldServiceError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export class HiggsfieldHttpError extends HiggsfieldServiceError {
  constructor(readonly status: number, response: { readonly headers: Headers }, bodyText: string,
    request: { readonly method: string; readonly path: string }) {
    let body: Record<string, unknown> | undefined;
    try { body = record(JSON.parse(bodyText)); } catch { /* Non-JSON gateway failures still have HTTP evidence. */ }
    const reason = text(body?.detail) ?? text(body?.message)
      ?? (body === undefined ? text(bodyText.slice(0, 2000)) : undefined);
    const requestId = text(response.headers.get("x-request-id"));
    const facts = [
      `Higgsfield HTTP ${status}`, `${request.method} ${request.path}`,
      ...(requestId === undefined ? [] : [`request=${requestId}`]),
    ];
    super(`HIGGSFIELD_HTTP_${status}`,
      `${facts.join("; ")}${reason === undefined ? "" : `: ${safeHiggsfieldReason(reason)}`}`);
  }
}

/**
 * A terminal state other than `completed`; `undefined` while the request is still queued or
 * running. `nsfw` and `canceled` are ordinary terminal outcomes with their own reasons.
 */
export function higgsfieldRequestFailure(state: Record<string, unknown>, id: string): HiggsfieldServiceError | undefined {
  const status = String(state.status);
  if (status === "queued" || status === "in_progress" || status === "completed") return undefined;
  const reason = text(state.error) ?? text(record(state.error)?.message);
  return new HiggsfieldServiceError(`HIGGSFIELD_${status.toUpperCase()}`,
    `Higgsfield request ${id} ended ${status}${reason === undefined ? "" : `: ${safeHiggsfieldReason(reason)}`}`);
}
