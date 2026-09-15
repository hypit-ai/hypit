import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

import { orcaRouterAcquisition } from "@hypit/provider-orcarouter";

export type AcquireConnectOptions = {
  readonly authBaseUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  /** Called once with the URL the user must open, before the exchange waits for the code. */
  readonly onAuthorizeUrl?: (url: string) => void;
  /** Resolves with the code the consent screen displayed, or undefined when the attempt is released. */
  readonly code: Promise<string | undefined>;
  readonly open?: (url: string) => void;
};

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Run the OrcaRouter out-of-band authorization up to the point where the consent screen owes us a
 * code, then exchange it. The verifier is generated here, is sent only on the exchange request, and
 * is never placed in a URL, a log or an error message.
 */
export async function acquireConnectCode(options: AcquireConnectOptions): Promise<string> {
  const acquisition = orcaRouterAcquisition({
    ...(options.authBaseUrl === undefined ? {} : { authBaseUrl: options.authBaseUrl }),
    ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
  });
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));
  const authorize = new URL(acquisition.authorizationEndpoint);
  for (const [name, value] of Object.entries(acquisition.authorizeParams ?? {})) authorize.searchParams.set(name, value);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  options.onAuthorizeUrl?.(authorize.toString());
  options.open?.(authorize.toString());

  const code = (await options.code)?.trim();
  if (code === undefined || code.length === 0) {
    throw new Error("The OrcaRouter authorization was cancelled or timed out before a code arrived");
  }

  const exchange = acquisition.exchange!;
  const fetcher = options.fetch ?? globalThis.fetch;
  const deadline = AbortSignal.timeout(acquisition.requestTimeoutMs);
  let response: Response;
  let body: string;
  try {
    response = await fetcher(acquisition.tokenEndpoint, {
      method: "POST",
      headers: exchange.encoding === "json"
        ? { "content-type": "application/json" }
        : { "content-type": "application/x-www-form-urlencoded" },
      body: exchange.encoding === "json"
        ? JSON.stringify({ ...exchange.fields, code, code_verifier: verifier })
        : new URLSearchParams({ ...exchange.fields, code, code_verifier: verifier }).toString(),
      signal: deadline,
    });
    body = await response.text();
  } catch (error) {
    if (deadline.aborted) throw new Error("The OrcaRouter code exchange timed out; no credential was stored");
    throw error;
  }
  if (!response.ok) {
    throw new Error(`OrcaRouter code exchange failed (HTTP ${response.status}). `
      + "The code may have expired or already been used; start a new authorization.");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error("OrcaRouter returned an unreadable exchange response");
  }
  const key = parsed[exchange.credentialField ?? "access_token"];
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("OrcaRouter returned no key; authorize again from the OrcaRouter panel");
  }
  if (exchange.requiredScope !== undefined && parsed.scope !== exchange.requiredScope) {
    throw new Error(`OrcaRouter granted scope ${JSON.stringify(parsed.scope ?? null)}, not ${JSON.stringify(exchange.requiredScope)}; `
      + "the account or workspace role does not permit this grant");
  }
  return key;
}

/** Open the user's browser at the authorization URL, ignoring a machine with no opener. */
export function openInBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(command, args, { stdio: "ignore", detached: true, windowsHide: true }).unref();
  } catch {
    // A display-less machine still shows the URL for the user to copy.
  }
}
