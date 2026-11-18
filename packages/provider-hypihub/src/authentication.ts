import { transport } from "./http.js";

export type HypiHubCredentialSource = {
  /** Stable across token rotation. Used to share upload capacity in this process. */
  readonly id: string;
  readonly origin: string;
  accessToken(rejectedToken?: string): Promise<string>;
  inspectAccess?(): Promise<{ readonly status: "connected"; readonly token: string }
    | { readonly status: "disconnected" | "needs-refresh" | "reconnect" }>;
};

export type HypiHubAuthentication =
  | { readonly apiKey: string; readonly credential?: never }
  | { readonly credential: HypiHubCredentialSource; readonly apiKey?: never };

export function hypiHubBaseUrl(value = "https://hypit.ai"): URL {
  const url = new URL(value);
  if (!(url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    || url.username || url.password || url.search || url.hash) throw new Error("Invalid HypiHub API base URL.");
  return url;
}

/** Retry only when the HypiHub authentication guard explicitly rejected the bearer before dispatch. */
export async function fetchWithHypiHubCredential(
  fetcher: typeof globalThis.fetch,
  source: HypiHubCredentialSource,
  target: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  init.signal?.throwIfAborted();
  const send = async (token: string) => {
    init.signal?.throwIfAborted();
    headers.set("authorization", `Bearer ${token}`);
    return await transport(fetcher(target, { ...init, headers, redirect: "error" }));
  };
  const token = await source.accessToken();
  const response = await send(token);
  const challenge = response.headers.get("www-authenticate") ?? "";
  if (response.status !== 401 || !/^Bearer realm="hypihub",\s*error="invalid_token"(?:\s*,|$)/iu.test(challenge)) {
    return response;
  }
  await response.body?.cancel().catch(() => undefined);
  init.signal?.throwIfAborted();
  return await send(await source.accessToken(token));
}
