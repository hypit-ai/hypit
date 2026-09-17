/** TokenDance relays each protocol's own error body; keep the code, the message and the HTTP facts. */
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

// Responses may mention a signed asset URL. Keep the reason, not its access capability.
export function safeTokenDanceReason(value: string): string {
  return value.replace(/https?:\/\/\S+/giu, "[redacted-url]");
}

export class TokenDanceServiceError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export class TokenDanceHttpError extends TokenDanceServiceError {
  constructor(readonly status: number, response: { readonly headers: Headers }, bodyText: string,
    request: { readonly method: string; readonly path: string; readonly model?: string }) {
    let body: Record<string, unknown> | undefined;
    try { body = record(JSON.parse(bodyText)); } catch { /* Non-JSON gateway failures still have HTTP evidence. */ }
    const error = record(body?.error);
    const code = text(error?.code) ?? text(error?.type) ?? text(body?.code) ?? "TOKENDANCE_HTTP_ERROR";
    const reason = text(error?.message) ?? text(body?.message)
      ?? (body === undefined ? text(bodyText.slice(0, 2000)) : undefined);
    const requestId = text(response.headers.get("x-request-id"));
    const facts = [
      `TokenDance HTTP ${status}`, code, `${request.method} ${request.path}`,
      ...(request.model === undefined ? [] : [`model=${request.model}`]),
      ...(requestId === undefined ? [] : [`request=${requestId}`]),
    ];
    super(code, `${facts.join("; ")}${reason === undefined ? "" : `: ${safeTokenDanceReason(reason)}`}`);
  }
}

/** A terminal task body from either protocol; `undefined` when the task did not fail. */
export function tokenDanceTaskFailure(task: Record<string, unknown>, id: string): TokenDanceServiceError | undefined {
  const status = String(task.status);
  if (!["failed", "cancelled", "canceled", "expired"].includes(status)) return undefined;
  const error = record(task.error);
  const code = text(error?.code) ?? "TOKENDANCE_TASK_FAILED";
  const reason = text(error?.message) ?? text(task.error);
  return new TokenDanceServiceError(code,
    `TokenDance task ${id} ${status}; ${code}${reason === undefined ? "" : `: ${safeTokenDanceReason(reason)}`}`);
}
