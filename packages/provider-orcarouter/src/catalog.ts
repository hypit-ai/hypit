/**
 * The OrcaRouter model catalogue and the capability filters built on it.
 *
 * `GET /v1/models` on the configured inference origin is the only source of truth for which models
 * this account may call. Nothing here invents a capability from a model's name: an entry is offered
 * to a control only when its own metadata proves the endpoint type and, where the control uploads
 * media, the input modality. The small seed below exists so a fresh installation is not empty
 * during a catalogue outage; it is never merged into a successful live response.
 */

/** Bounds keep a catalogue response from consuming unbounded memory or advertising routes we cannot speak. */
export const CATALOG_LIMITS = {
  requestTimeoutMs: 10_000,
  maxBytes: 512 * 1024,
  maxModels: 500,
  maxEndpointTypes: 24,
  maxStringLength: 512,
} as const;

/** Endpoint types that prove an entry can serve an OpenAI-compatible chat request. */
export const CHAT_ENDPOINT_TYPES: readonly string[] = ["openai", "anthropic", "gemini", "openai-response"];

/** Endpoint types that only ever serve something other than chat, even when a chat type is present. */
export const NON_CHAT_ENDPOINT_TYPES: readonly string[] = [
  "image-generation", "openai-video", "jina-rerank", "embeddings", "rerank", "moderation", "audio",
];

export type OrcaRouterCapability = "chat" | "multimodal" | "embedding" | "image" | "video" | "rerank";

export type CatalogModel = {
  /** Vendor-namespaced model ID, preserved exactly as the catalogue returns it. */
  readonly id: string;
  readonly label: string;
  readonly endpointTypes: readonly string[];
  /** `architecture.input_modalities`, or an empty list when the entry does not declare it. */
  readonly inputModalities: readonly string[];
  readonly contextLength?: number;
  readonly maxCompletionTokens?: number;
  /** Declared reasoning-effort ladder. Absent unless the catalogue states one. */
  readonly reasoningEfforts?: readonly string[];
  /** Where the entry came from; the UI labels a degraded catalogue from this. */
  readonly origin: "live" | "seed";
};

/**
 * Verified cold-start seed. These IDs come from the OrcaRouter seed list published with the
 * integration guide, not from a live response, so they carry `origin: "seed"` and conservative
 * metadata: only the GPT-5.5 reasoning ladder is verified, and no seed entry claims media input
 * unless the live catalogue has confirmed it.
 */
export const ORCAROUTER_SEED_MODELS: readonly CatalogModel[] = [
  {
    id: "orcarouter/auto",
    label: "OrcaRouter Auto",
    endpointTypes: [...CHAT_ENDPOINT_TYPES],
    inputModalities: ["text"],
    origin: "seed",
  },
  {
    id: "openai/gpt-5.5",
    label: "OpenAI: GPT-5.5",
    endpointTypes: [...CHAT_ENDPOINT_TYPES],
    inputModalities: ["text", "image"],
    contextLength: 400_000,
    reasoningEfforts: ["low", "medium", "high", "xhigh"],
    origin: "seed",
  },
  {
    id: "anthropic/claude-opus-4.8",
    label: "Anthropic: Claude Opus 4.8",
    endpointTypes: [...CHAT_ENDPOINT_TYPES],
    inputModalities: ["text"],
    contextLength: 200_000,
    origin: "seed",
  },
  {
    id: "google/gemini-3.5-flash",
    label: "Google: Gemini 3.5 Flash",
    endpointTypes: [...CHAT_ENDPOINT_TYPES],
    inputModalities: ["text"],
    contextLength: 1_000_000,
    origin: "seed",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek: DeepSeek V4 Pro",
    endpointTypes: ["openai", "openai-response"],
    inputModalities: ["text"],
    contextLength: 1_048_576,
    origin: "seed",
  },
];

/** The official catalogue endpoint, for evidence and documentation. */
export const ORCAROUTER_CATALOG_URL = "https://api.orcarouter.ai/v1/models";
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function boundedString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= CATALOG_LIMITS.maxStringLength
    ? value
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => boundedString(item))
    .filter((item): item is string => item !== undefined)
    .slice(0, limit);
}

/**
 * Parse one catalogue response. Unusable records are dropped rather than repaired: an entry without
 * a usable ID or without a declared endpoint type cannot be filtered honestly later.
 */
export function parseCatalogResponse(body: unknown): CatalogModel[] {
  const root = body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : undefined;
  const data = root?.data;
  assert(Array.isArray(data), "OrcaRouter model catalogue has no data array");
  const models: CatalogModel[] = [];
  for (const raw of data.slice(0, CATALOG_LIMITS.maxModels)) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const id = boundedString(entry.id);
    if (id === undefined) continue;
    const endpointTypes = stringList(entry.supported_endpoint_types, CATALOG_LIMITS.maxEndpointTypes);
    const architecture = entry.architecture !== null && typeof entry.architecture === "object" && !Array.isArray(entry.architecture)
      ? entry.architecture as Record<string, unknown>
      : undefined;
    const reasoning = architecture?.reasoning !== null && typeof architecture?.reasoning === "object" && !Array.isArray(architecture.reasoning)
      ? architecture.reasoning as Record<string, unknown>
      : undefined;
    const efforts = stringList(reasoning?.efforts ?? entry.reasoning_efforts, 8);
    const contextLength = positiveInteger(entry.context_length) ?? positiveInteger(
      (entry.top_provider as Record<string, unknown> | undefined)?.context_length,
    );
    const maxCompletionTokens = positiveInteger(entry.max_completion_tokens) ?? positiveInteger(
      (entry.top_provider as Record<string, unknown> | undefined)?.max_completion_tokens,
    );
    models.push({
      id,
      label: boundedString(entry.name) ?? id,
      endpointTypes,
      inputModalities: stringList(architecture?.input_modalities, 8),
      ...(contextLength === undefined ? {} : { contextLength }),
      ...(maxCompletionTokens === undefined ? {} : { maxCompletionTokens }),
      ...(efforts.length === 0 ? {} : { reasoningEfforts: efforts }),
      origin: "live",
    });
  }
  return models;
}

/** Text controls accept only entries that prove a chat-capable endpoint and no chat-incompatible one. */
function isChatModel(model: CatalogModel): boolean {
  const types = new Set(model.endpointTypes);
  if (!CHAT_ENDPOINT_TYPES.some((type) => types.has(type))) return false;
  return !NON_CHAT_ENDPOINT_TYPES.some((type) => types.has(type));
}

/**
 * Filter one catalogue for one control. `multimodal` additionally requires the entry to declare the
 * exact non-text modality the control uploads; an entry that declares nothing fails closed.
 */
export function filterCatalog(
  models: readonly CatalogModel[],
  capability: OrcaRouterCapability,
  modality?: "image" | "audio" | "video",
): CatalogModel[] {
  return models.filter((model) => {
    const types = new Set(model.endpointTypes);
    switch (capability) {
      case "chat":
        return isChatModel(model);
      case "multimodal":
        return isChatModel(model)
          && modality !== undefined
          && model.inputModalities.includes(modality);
      case "embedding":
        return types.has("embeddings") || types.has("embedding");
      case "image":
        return types.has("image-generation");
      case "video":
        return types.has("openai-video");
      case "rerank":
        return types.has("jina-rerank");
      default:
        return false;
    }
  });
}

export type CatalogResult = {
  readonly models: readonly CatalogModel[];
  /** `live` when the response was accepted in full; `seed` when the catalogue could not be read. */
  readonly source: "live" | "seed";
  readonly detail?: string;
};

export type FetchCatalogOptions = {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly capability: OrcaRouterCapability;
  readonly modality?: "image" | "audio" | "video";
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
};

/** The catalogue path under an inference base that already ends in `/v1`. */
const MODELS_PATH = "models";

/**
 * Read the catalogue for one capability. A failure is reported, never repaired with seed entries:
 * the caller decides whether to show the verified seed and label it as degraded.
 */
export async function fetchOrcaRouterCatalog(options: FetchCatalogOptions): Promise<CatalogResult> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const url = new URL(`${options.baseUrl.replace(/\/+$/u, "")}/${MODELS_PATH}`);
  url.searchParams.set("capability", options.capability === "multimodal" ? "chat" : options.capability);
  const deadline = AbortSignal.timeout(options.timeoutMs ?? CATALOG_LIMITS.requestTimeoutMs);
  let response: Response;
  let text: string;
  try {
    response = await fetcher(url.toString(), {
      headers: { authorization: `Bearer ${options.apiKey}`, accept: "application/json" },
      signal: deadline,
    });
    text = await response.text();
  } catch (error) {
    return { models: [], source: "seed", detail: `catalogue request failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!response.ok) {
    return { models: [], source: "seed", detail: `catalogue returned HTTP ${response.status}` };
  }
  if (text.length > CATALOG_LIMITS.maxBytes) {
    return { models: [], source: "seed", detail: "catalogue response exceeded the accepted size" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { models: [], source: "seed", detail: "catalogue response was not JSON" };
  }
  try {
    return { models: filterCatalog(parseCatalogResponse(parsed), options.capability, options.modality), source: "live" };
  } catch (error) {
    return { models: [], source: "seed", detail: error instanceof Error ? error.message : String(error) };
  }
}
