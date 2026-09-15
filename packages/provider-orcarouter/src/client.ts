import { requestDeadline } from "@hypit/runtime-kit";

import type { CatalogResult, OrcaRouterCapability } from "./catalog.js";
import { fetchOrcaRouterCatalog } from "./catalog.js";
import type { OrcaRouterCredential } from "./credentials.js";
import { ORCAROUTER_KEY_DASHBOARD } from "./credentials.js";

export class OrcaRouterHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export type OrcaRouterChatMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string | readonly (
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "image_url"; readonly image_url: { readonly url: string } }
  )[];
};

/**
 * The one inference client. It asks the credential only for a Bearer value, so an API-key credential
 * and a PKCE-issued one take exactly the same path to the relay.
 */
export class OrcaRouterClient {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly fetcher: typeof globalThis.fetch;

  constructor(options: {
    readonly baseUrl: string;
    readonly timeout: number;
    readonly fetcher?: typeof globalThis.fetch;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, "");
    this.timeout = options.timeout;
    this.fetcher = options.fetcher ?? globalThis.fetch;
  }

  /** One chat completion. A 401 is terminal for the credential that made the request. */
  async chat(
    credential: OrcaRouterCredential,
    body: { readonly model: string; readonly messages: readonly OrcaRouterChatMessage[] },
  ): Promise<{ readonly text: string }> {
    const token = await credential.token();
    const deadline = requestDeadline(this.timeout, () => new Error("OrcaRouter chat request timed out"));
    try {
      const response = await deadline.wait(this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: deadline.signal,
      }));
      const text = await deadline.wait(response.text());
      if (response.status === 401) {
        // Mark only the exact credential generation that made this request, then stop: a durable
        // OrcaRouter key has no refresh grant, so a rejected one needs a new authorization.
        await credential.reject();
        throw new OrcaRouterHttpError(401,
          `OrcaRouter refused this credential (HTTP 401). Authorize again, or manage keys at ${ORCAROUTER_KEY_DASHBOARD}`);
      }
      if (!response.ok) {
        throw new OrcaRouterHttpError(response.status, `OrcaRouter returned HTTP ${response.status}: ${text.slice(0, 300)}`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("OrcaRouter returned invalid chat JSON");
      }
      return { text: completionText(parsed) };
    } finally {
      deadline.finish();
    }
  }

  /** The catalogue for one control, read with the same credential the chat request uses. */
  async models(credential: OrcaRouterCredential, capability: OrcaRouterCapability,
    modality?: "image" | "audio" | "video"): Promise<CatalogResult> {
    return await fetchOrcaRouterCatalog({
      baseUrl: this.baseUrl,
      apiKey: await credential.token(),
      capability,
      ...(modality === undefined ? {} : { modality }),
      fetch: this.fetcher,
      timeoutMs: this.timeout,
    });
  }
}

function completionText(body: unknown): string {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("OrcaRouter chat response is not an object");
  }
  const choices = (body as { readonly choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new Error("OrcaRouter chat response has no choices");
  const message = (choices[0] as { readonly message?: unknown }).message;
  if (message === null || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("OrcaRouter chat response has no message");
  }
  const content = (message as { readonly content?: unknown }).content;
  if (typeof content === "string") return content;
  // A multimodal reply may arrive as parts; the text parts are joined in order.
  if (Array.isArray(content)) {
    const text = content.flatMap((part) => part !== null && typeof part === "object"
      && (part as { readonly type?: unknown }).type === "text"
      && typeof (part as { readonly text?: unknown }).text === "string"
      ? [(part as { readonly text: string }).text] : []).join("");
    if (text.length > 0) return text;
  }
  throw new Error("OrcaRouter chat response carried no text");
}
