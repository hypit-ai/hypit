import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createHypiHubOAuthConnection,
  type HypiHubOAuthAttempt, type HypiHubOAuthConnection, type HypiHubOAuthStatus, type HypiHubOAuthStore,
} from "@hypit/provider-hypihub";
import { openLocalHypiHubCredentialSlot } from "./hypihub-credential-node.js";

export type OpenNodeHypiHubOAuthConnectionOptions = {
  readonly id?: string;
  readonly store?: HypiHubOAuthStore;
  readonly baseUrl?: string;
  readonly clientId?: string;
  readonly scopes?: readonly string[];
  readonly fetch?: typeof globalThis.fetch;
  readonly requestTimeoutMs?: number;
};

/** Select one credential slot owned by this host. Opening it never launches a browser. */
export function openNodeHypiHubOAuthConnection({
  id = "hypihub", store, ...options
}: OpenNodeHypiHubOAuthConnectionOptions = {}): HypiHubOAuthConnection {
  if (!/^[a-z][a-z0-9.-]{0,191}$/u.test(id)) throw new Error("HypiHub OAuth credential slot id is invalid.");
  const origin = new URL(options.baseUrl ?? "https://hypit.ai").origin;
  const slot = createHash("sha256").update(JSON.stringify(
    options.clientId === undefined ? [origin, id] : [origin, id, options.clientId],
  )).digest("hex");
  return createHypiHubOAuthConnection({ ...options, id: `oauth:${slot}`, store: store ?? openLocalHypiHubCredentialSlot(slot) });
}

export type NodeHypiHubAuthorization = {
  readonly authorizationUrl: string;
  readonly expiresAt: number;
  readonly result: Promise<HypiHubOAuthStatus>;
  submit(codeWithState: string): Promise<HypiHubOAuthStatus>;
  cancel(): void;
};

/** Accept a same-machine browser callback or the hosted page's copyable code#state. */
export async function beginNodeHypiHubAuthorization(
  connection: HypiHubOAuthConnection,
  options: { readonly timeoutMs?: number; readonly manual?: boolean } = {},
): Promise<NodeHypiHubAuthorization> {
  const server = options.manual === true ? undefined : createServer();
  if (server !== undefined) {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
  }
  let attempt: HypiHubOAuthAttempt;
  try {
    attempt = connection.beginAuthorization({
      ...(server === undefined ? {} : { callbackPort: (server.address() as AddressInfo).port }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });
  } catch (error) {
    server?.close();
    throw error;
  }
  let resolve!: (status: HypiHubOAuthStatus) => void;
  let reject!: (error: unknown) => void;
  const result = new Promise<HypiHubOAuthStatus>((success, failure) => { resolve = success; reject = failure; });
  // Callers can submit later, even if the attempt expired in the meantime.
  void result.catch(() => undefined);
  const timer = setTimeout(() => cancel(new Error("HypiHub authorization timed out.")), Math.max(1, attempt.expiresAt - Date.now()));
  let accepting = true;
  server?.once("error", () => cancel(new Error("The HypiHub loopback listener failed.")));

  function close() {
    clearTimeout(timer);
    server?.close();
  }

  function cancel(error: Error) {
    if (!accepting) return;
    accepting = false;
    attempt.cancel();
    close();
    reject(error);
  }

  function complete(state: string, code: string | undefined, error?: string) {
    accepting = false;
    close();
    void attempt.complete({ state, ...(code === undefined ? {} : { code }), ...(error === undefined ? {} : { error }) })
      .then(resolve, reject);
  }

  server?.on("request", (request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("connection", "close");
    const target = new URL(`http://127.0.0.1${request.url?.startsWith("/") ? request.url : "/"}`);
    const state = target.searchParams.get("state");
    if (!accepting || target.pathname !== "/callback" || request.headers.origin !== attempt.callbackOrigin
      || target.searchParams.getAll("state").length !== 1 || !attempt.acceptsState(state)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("access-control-allow-origin", attempt.callbackOrigin);
    if (request.method === "OPTIONS") {
      response.writeHead(204, { "access-control-allow-methods": "GET", "access-control-allow-private-network": "true" }).end();
      return;
    }
    const code = target.searchParams.get("code");
    const error = target.searchParams.get("error");
    if (request.method !== "GET" || state === null || (code === null) === (error === null)
      || target.searchParams.getAll("code").length > 1 || target.searchParams.getAll("error").length > 1) {
      response.writeHead(400).end();
      return;
    }
    response.writeHead(204).end();
    complete(state, code ?? undefined, error ?? undefined);
  });

  return {
    authorizationUrl: attempt.authorizationUrl,
    expiresAt: attempt.expiresAt,
    result,
    async submit(value) {
      const parts = value.trim().split("#");
      const [code, state] = parts;
      if (!accepting || parts.length !== 2 || !code || !state || !attempt.acceptsState(state)) {
        throw new Error("Enter code#state from the page for this HypiHub authorization attempt.");
      }
      complete(state, code);
      return await result;
    },
    cancel: () => cancel(new Error("HypiHub authorization was cancelled.")),
  };
}
