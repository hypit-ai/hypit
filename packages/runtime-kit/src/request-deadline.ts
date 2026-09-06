/** A deadline covers headers and body consumption even when a transport ignores abort. */
export function requestDeadline(timeoutMs: number, error: () => Error = () => new Error("Request timed out")) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("Request timeout must be a positive integer");
  const controller = new AbortController();
  let reject!: (reason: Error) => void;
  const expired = new Promise<never>((_resolve, fail) => { reject = fail; });
  const timer = setTimeout(() => {
    const reason = error();
    reject(reason);
    controller.abort(reason);
  }, timeoutMs);
  return {
    signal: controller.signal,
    wait: async <T>(work: Promise<T>): Promise<T> => await Promise.race([work, expired]),
    finish: (): void => clearTimeout(timer),
  };
}
