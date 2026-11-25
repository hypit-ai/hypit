/** A non-success HTTP response. It is evidence, not by itself a service verdict. */
export class EndpointHttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

/** The HTTP attempt produced no response: connection failure, interrupted read, or timeout. */
export class EndpointTransportError extends Error {
  readonly code: string | undefined;
  readonly timeout: true | undefined;

  constructor(message: string, options: ErrorOptions & { readonly code?: string; readonly timeout?: true } = {}) {
    super(message, options);
    this.code = options.code;
    this.timeout = options.timeout;
  }
}

/** A successful HTTP response whose body cannot be interpreted by the Provider. */
export class EndpointResponseError extends Error {}

type FailureDetail = {
  readonly message: string;
  readonly code?: string;
};

/** Preserve the useful chain hidden behind Node's generic `fetch failed` message. */
function transportDetail(error: unknown): FailureDetail {
  const messages: string[] = [];
  let code: string | undefined;
  let current: unknown = error;
  const visited = new Set<object>();
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    const currentCode = (current as { readonly code?: unknown }).code;
    if (code === undefined && typeof currentCode === "string" && currentCode.length > 0) code = currentCode;
    const message = current.message.trim();
    if (message.length > 0 && messages.at(-1) !== message) messages.push(message);
    current = current.cause;
  }
  if (messages.length === 0) messages.push(String(error));
  const detail = code === undefined || messages.some((message) => message.includes(code))
    ? messages.join(": ")
    : `${messages.join(": ")}: ${code}`;
  return { message: detail, ...(code === undefined ? {} : { code }) };
}

/** Convert a rejected HTTP send/read into structured transport evidence. */
export function endpointTransportError(error: unknown): EndpointTransportError {
  if (error instanceof EndpointTransportError) return error;
  const detail = transportDetail(error);
  return new EndpointTransportError(detail.message, {
    cause: error,
    ...(detail.code === undefined ? {} : { code: detail.code }),
  });
}

/** Observe a rejected HTTP send/read without deciding the Endpoint action's outcome. */
export async function transport<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    throw endpointTransportError(error);
  }
}

export type RequestDeadline = {
  readonly signal: AbortSignal;
  readonly wait: <T>(work: Promise<T>) => Promise<T>;
};

/**
 * Bound one Provider-owned HTTP exchange, including response-body consumption, and always release
 * the timer. This helper performs no request and makes no retry or service-verdict decision.
 */
export async function withRequestDeadline<T>(
  timeoutMs: number,
  work: (deadline: RequestDeadline) => Promise<T>,
  timeoutError: () => EndpointTransportError = () => new EndpointTransportError(
    "Request timed out",
    { timeout: true },
  ),
): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("Request timeout must be a positive integer");
  }
  const controller = new AbortController();
  let reject!: (reason: EndpointTransportError) => void;
  const expired = new Promise<never>((_resolve, fail) => { reject = fail; });
  const timer = setTimeout(() => {
    const reason = timeoutError();
    reject(reason);
    controller.abort(reason);
  }, timeoutMs);
  const wait = async <Value>(request: Promise<Value>): Promise<Value> => await transport(
    Promise.race([request, expired]),
  );
  try {
    return await work({ signal: controller.signal, wait });
  } finally {
    clearTimeout(timer);
  }
}

/** The wait a `Retry-After` header asks for, in milliseconds: delay-seconds or an HTTP-date. */
export function retryAfterMs(headers: Headers, now = Date.now()): number | undefined {
  const value = headers.get("retry-after")?.trim();
  if (value === undefined || value.length === 0) return undefined;
  // Date.parse reads number-like text such as "1.5" or "-1" as a past calendar date, which
  // would erase the wait; an HTTP-date always names its weekday and month.
  const delay = /^\d+(?:\.\d+)?$/u.test(value) ? Number(value) * 1000
    : /[a-z]/iu.test(value) ? Date.parse(value) - now : Number.NaN;
  return Number.isFinite(delay) ? Math.max(0, Math.round(delay)) : undefined;
}
