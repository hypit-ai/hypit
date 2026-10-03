import { EndpointHttpError, EndpointServiceError, retryAfterMs } from "@hypit/endpoint-kit";

/** HypiHub's public error envelope, kept at the service boundary. */
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

// Responses may mention a signed asset URL. Keep the reason, not its access capability.
export function safeHypiHubReason(value: string): string {
  return value.replace(/https?:\/\/\S+/giu, "[redacted-url]");
}

export class HypiHubServiceError extends EndpointServiceError {}

export class HypiHubHttpError extends EndpointHttpError {
  constructor(status: number, response: { readonly headers: Headers }, bodyText: string,
    request: { readonly method: string; readonly url: string; readonly model?: string }) {
    let body: Record<string, unknown> | undefined;
    try { body = record(JSON.parse(bodyText)); } catch { /* Non-JSON gateway failures still have HTTP evidence. */ }
    const error = record(body?.error);
    const flatError = text(body?.error);
    const code = text(error?.code)
      ?? (flatError !== undefined && /^[a-z][a-z0-9_]*$/iu.test(flatError) ? flatError : "HYPIHUB_HTTP_ERROR");
    const reason = text(error?.message) ?? text(body?.error_description)
      ?? (flatError !== code ? flatError : undefined)
      ?? (body === undefined ? text(bodyText.slice(0, 2000)) : undefined);
    const url = new URL(request.url);
    const model = request.model ?? url.searchParams.get("model")
      ?? (url.pathname.includes("/models/") ? decodeURIComponent(url.pathname.split("/models/")[1]!) : undefined);
    const requestId = text(response.headers.get("x-request-id"));
    const retryAfter = text(response.headers.get("retry-after"));
    const facts = [
      `HypiHub HTTP ${status}`, code, `${request.method} ${url.origin}${url.pathname}`,
      ...(model == null ? [] : [`model=${model}`]),
      ...(requestId === undefined ? [] : [`request=${requestId}`]),
      ...(retryAfter === undefined ? [] : [`retry-after=${retryAfter}`]),
    ];
    super(code, `${facts.join("; ")}${reason === undefined ? "" : `: ${safeHypiHubReason(reason)}`}`
      + (body === undefined && bodyText.length > 2000 ? " [response excerpt truncated]" : ""),
    status, retryAfterMs(response.headers));
  }
}

const billingRejection = /insufficient(?:\s|_)?credits|credits(?:\s|_)?insufficient|balance\s+isn't\s+enough/iu;

/**
 * A terminal job always carries an id the service created, so a billing code on it means the
 * service's own precheck rejected the job after submission — a sequence users read as their
 * balance actually being spent down, which real incidents have contradicted.
 */
function rejectedByBillingPrecheck(code: string, reason: string | undefined): boolean {
  return code === "402" || billingRejection.test(code)
    || (reason !== undefined && billingRejection.test(reason));
}

export function hypiHubJobFailure(job: Record<string, unknown>, id: string): HypiHubServiceError | undefined {
  const status = job.status;
  if (!["failed", "queue_expired", "canceled", "cancelled"].includes(String(status))) return undefined;
  const error = record(job.error);
  const code = text(job.error_code) ?? text(error?.code) ?? "HYPIHUB_JOB_FAILED";
  const reason = text(job.error) ?? text(error?.message) ?? text(job.message) ?? text(job.reason) ?? text(job.detail);
  const model = text(job.model);
  const message = `HypiHub job ${id} ${status}; ${code}${model === undefined ? "" : `; model=${model}`}`
    + (reason === undefined ? "" : `: ${safeHypiHubReason(reason)}`);
  if (!rejectedByBillingPrecheck(code, reason)) return new HypiHubServiceError(code, message);
  return new HypiHubServiceError(code, `${message}${/[.!?;]$/u.test(message) ? "" : "."} `
    + "HypiHub accepted this job and gave it an id before its billing precheck rejected it, so the rejection"
    + " happened after submission; Hypit performs no balance check of its own. If the account balance covers"
    + " the model card's estimate, share this job id with official@hypit.ai so the credit-ledger reservation"
    + " can be inspected.");
}
