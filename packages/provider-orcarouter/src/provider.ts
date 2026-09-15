import type {
  AsyncEndpoint, EndpointCredential, EndpointFulfillment, EndpointRequest, EndpointSupport, ResourceStore,
} from "@hypit/endpoint-kit";
import { defineEndpointPackage } from "@hypit/endpoint-kit";
import { orcaRouterCapabilities, orcaRouterTypes } from "@hypit/orcarouter";
import { imageDataUrl } from "@hypit/orcarouter";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef } from "@hypit/runtime";
import type { RuntimeDoctorDiagnostic } from "@hypit/runtime-kit";

import { OrcaRouterClient } from "./client.js";
import type { OrcaRouterChatMessage } from "./client.js";
import {
  ORCAROUTER_KEY_DASHBOARD, apiKeyCredentialAdapter, createOrcaRouterCredential, orcaRouterAcquisition,
  pkceCredentialAdapter,
} from "./credentials.js";
import type { OrcaRouterCredential, OrcaRouterCredentialAdapter } from "./credentials.js";

export const orcaRouterProviderModuleRef = { name: "@hypit/provider-orcarouter", version: "1" } as const;

/** Public OrcaRouter origins. Authentication and inference are deliberately different hosts. */
export const ORCAROUTER_AUTH_BASE_URL = "https://www.orcarouter.ai";
export const ORCAROUTER_API_BASE_URL = "https://api.orcarouter.ai/v1";
export const ORCAROUTER_DEFAULT_ENDPOINT = "orcarouter.default";

/** The capability the Provider fulfills; the Model package owns its name and result type. */
export const orcaRouterCapability = orcaRouterCapabilities.generate;

export type CreateOrcaRouterProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  /** Inference and model-discovery base. Never derived from the authorization base. */
  readonly baseUrl?: string;
  /** Authorization and code-exchange base. Never derived from the inference base. */
  readonly authBaseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly requestTimeoutMs?: number;
  readonly oauthRequestTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
};

export type OrcaRouterOrigins = {
  readonly apiBaseUrl: string;
  readonly authBaseUrl: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Remote origins require HTTPS; plain HTTP is permitted only on loopback. */
function normalizeOrigin(value: string, subject: string): string {
  const trimmed = value.trim().replace(/\/+$/u, "");
  assert(trimmed.length > 0, `${subject} is empty`);
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${subject} must be an absolute URL`);
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  assert(url.protocol === "https:" || (loopback && url.protocol === "http:"),
    `${subject} must use HTTPS, or HTTP on loopback`);
  return trimmed;
}

/**
 * Resolve both origins from the environment. An explicit per-origin override wins, then the shared
 * self-hosted `ORCA_BASE_URL`, then the public default. Neither origin is ever derived from the
 * other: the relay is at `/v1` and authentication is not.
 */
export function orcaRouterOrigins(environment: Readonly<Record<string, string | undefined>> = process.env): OrcaRouterOrigins {
  const shared = environment.ORCA_BASE_URL;
  const authExplicit = environment.ORCA_AUTH_BASE_URL;
  const apiExplicit = environment.ORCA_API_BASE_URL;
  const apiBaseUrl = normalizeOrigin(apiExplicit ?? shared ?? ORCAROUTER_API_BASE_URL, "OrcaRouter API base");
  return {
    // A self-hosted deployment may state its relay base with or without the /v1 suffix.
    apiBaseUrl: /\/v1$/u.test(apiBaseUrl) ? apiBaseUrl : `${apiBaseUrl}/v1`,
    authBaseUrl: normalizeOrigin(authExplicit ?? shared ?? ORCAROUTER_AUTH_BASE_URL, "OrcaRouter auth base"),
  };
}

function stored(request: EndpointRequest): Record<string, unknown> {
  const value = request.constraints;
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "OrcaRouter chat request must be an object");
  return value as Record<string, unknown>;
}

function credentialSlot(credentials: Readonly<Record<string, EndpointCredential>>): EndpointCredential {
  const value = credentials.apiKey?.secret;
  assert(typeof value === "string" && value.length > 0,
    "OrcaRouter login is unavailable; run hypit auth login orcarouter.default");
  return credentials.apiKey!;
}

function guidedMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /HTTP 401\b|needs authorization|login is unavailable/iu.test(message)
    ? `${message}. Authorize again with hypit auth login ${ORCAROUTER_DEFAULT_ENDPOINT}, or manage keys at ${ORCAROUTER_KEY_DASHBOARD}`
    : message;
}

async function referenceDataUrl(artifact: BlobRef, resources: ResourceStore): Promise<string> {
  const bytes = await resources.get(artifact.resource);
  assert(bytes !== undefined, `OrcaRouter reference image ${artifact.resource} is unavailable`);
  assert(bytes.byteLength === artifact.size, `OrcaRouter reference image ${artifact.resource} size differs`);
  return imageDataUrl(artifact, bytes);
}

/** OpenAI-compatible chat body; attached images become data URLs on one user message. */
export function orcaRouterChatBody(model: string, prompt: string, images: readonly string[]): {
  readonly model: string;
  readonly messages: readonly OrcaRouterChatMessage[];
} {
  if (images.length === 0) return { model, messages: [{ role: "user", content: prompt }] };
  return {
    model,
    messages: [{
      role: "user",
      content: [
        { type: "text" as const, text: prompt },
        ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ],
    }],
  };
}

export function createOrcaRouterProvider(options: CreateOrcaRouterProviderOptions = {}) {
  const instance = options.instance ?? ORCAROUTER_DEFAULT_ENDPOINT;
  const pool = options.pool ?? instance;
  const origins = orcaRouterOrigins({
    ...process.env,
    ...(options.baseUrl === undefined ? {} : { ORCA_API_BASE_URL: options.baseUrl }),
    ...(options.authBaseUrl === undefined ? {} : { ORCA_AUTH_BASE_URL: options.authBaseUrl }),
  });
  const requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
  const credentialRefForSlot = options.apiKey ?? credentialRef("os", "orcarouter.apiKey");
  const client = new OrcaRouterClient({
    baseUrl: origins.apiBaseUrl,
    timeout: requestTimeoutMs,
    ...(options.fetch === undefined ? {} : { fetcher: options.fetch }),
  });

  /**
   * Both entry points over the one credential slot. They share the slot, the inference client and
   * the catalogue; only how the key was obtained differs.
   */
  function adapters(credentials: Readonly<Record<string, EndpointCredential>>): readonly OrcaRouterCredentialAdapter[] {
    const slot = credentials.apiKey;
    const shared = {
      secret: slot?.secret ?? "",
      ref: credentialRefForSlot,
      ...(slot?.replace === undefined ? {} : { replace: slot.replace }),
    };
    return [apiKeyCredentialAdapter(shared), pkceCredentialAdapter(shared)];
  }

  /** The credential for one call, whichever entry point produced it. */
  function credentialFor(credentials: Readonly<Record<string, EndpointCredential>>): OrcaRouterCredential {
    const slot = credentialSlot(credentials);
    const credential = createOrcaRouterCredential({
      secret: slot.secret,
      ref: credentialRefForSlot,
      ...(slot.replace === undefined ? {} : { replace: slot.replace }),
    });
    assert(credential !== undefined,
      "OrcaRouter credential is unreadable; authorize again with hypit auth login " + ORCAROUTER_DEFAULT_ENDPOINT);
    return credential;
  }

  const chatEndpoint: AsyncEndpoint = {
    async start(context) {
      const request = stored(context.command.need);
      const model = typeof request.model === "string" ? request.model : "";
      const prompt = typeof request.prompt === "string" ? request.prompt : "";
      assert(model.length > 0, "OrcaRouter chat request carries no model");
      assert(prompt.length > 0, "OrcaRouter chat request carries no prompt");
      const images = Array.isArray(request.images) ? request.images as readonly BlobRef[] : [];
      const credential = credentialFor(context.credentials);
      const urls: string[] = [];
      for (const image of images) urls.push(await referenceDataUrl(image, context.resources));
      await context.reportProgress?.({ phase: `orcarouter:${model}` });
      const reply = await client.chat(credential, orcaRouterChatBody(model, prompt, urls));
      const result: EndpointFulfillment = {
        value: { kind: "inline", value: canonicalize({ text: reply.text }) as unknown as CanonicalValue },
      };
      return { status: "completed", result };
    },
    async poll() {
      // A chat completion is one request and one response; nothing is left to poll.
      throw new Error("OrcaRouter chat requests complete in a single response");
    },
  };

  /**
   * Declared support. A model that is absent, unnamespaced, or asked to carry more references than
   * the relay accepts is refused before any request is sent; the catalogue, not this check, decides
   * which models a control may offer.
   */
  function supports(request: EndpointRequest): EndpointSupport {
    const body = stored(request);
    if (typeof body.model !== "string" || body.model.trim().length === 0) {
      return { status: "unsupported", reason: "OrcaRouter requires the catalogue model ID to call" };
    }
    if (!body.model.includes("/")) {
      return {
        status: "unsupported",
        reason: `OrcaRouter model ${body.model} is missing its vendor namespace, for example anthropic/claude-opus-4.8`,
      };
    }
    if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
      return { status: "unsupported", reason: "OrcaRouter requires a prompt" };
    }
    if (Array.isArray(body.images) && body.images.length > MAX_REFERENCE_IMAGES) {
      return { status: "unsupported", reason: `OrcaRouter accepts at most ${MAX_REFERENCE_IMAGES} reference images per request` };
    }
    return { status: "supported" };
  }

  const endpoint = defineEndpointPackage({
    module: orcaRouterProviderModuleRef,
    facet: "gateway",
    instance,
    pool,
    credentials: { apiKey: credentialRefForSlot },
    credentialInputs: {
      apiKey: {
        // Both entry points are named apart wherever they can appear: paste a key, or sign in.
        label: "OrcaRouter - API (paste sk-orca-…) · OrcaRouter - Auth (hypit auth login)",
        kind: "secret",
        acquisition: orcaRouterAcquisition({
          authBaseUrl: origins.authBaseUrl,
          requestTimeoutMs: options.oauthRequestTimeoutMs ?? 30_000,
        }),
      },
    },
    ...(options.defaultConcurrency === undefined ? {} : { defaultConcurrency: options.defaultConcurrency }),
    capabilities: [{
      capability: orcaRouterCapability,
      returns: orcaRouterTypes.chat,
      lifecycle: "asynchronous" as const,
      endpoint: chatEndpoint,
      supports,
      capacity: "orcarouter-chat",
    }],
    // The Provider's own published rate page; Hypit never copies or interprets the rates.
    pricing: { kind: "page", url: "https://www.orcarouter.ai/pricing" },
  });
  return {
    endpoint,
    origins,
    adapters,
    credentialFor,
    // Exposed for callers that read the catalogue or chat through this exact configured instance.
    client,
    diagnose: async (context: {
      readonly credentials: Readonly<Record<string, { readonly secret: string }>>;
      readonly capabilities?: readonly import("@hypit/protocol").CapabilityRef[];
    }): Promise<readonly RuntimeDoctorDiagnostic[]> => {
      const diagnostics: RuntimeDoctorDiagnostic[] = [{
        severity: "info",
        code: "ORCAROUTER_ORIGINS",
        message: `inference ${origins.apiBaseUrl}; authorization ${origins.authBaseUrl}`,
      }];
      const secret = context.credentials.apiKey?.secret;
      if (typeof secret !== "string" || secret.length === 0) {
        diagnostics.push({
          severity: "warning",
          code: "ORCAROUTER_CREDENTIAL_MISSING",
          message: "No OrcaRouter credential is configured. Paste an sk-orca-… key, or authorize with "
            + `hypit auth login ${instance}.`,
        });
      }
      return diagnostics;
    },
  };
}

export const MAX_REFERENCE_IMAGES = 8;

export type { OrcaRouterCredential, OrcaRouterCredentialAdapter };
