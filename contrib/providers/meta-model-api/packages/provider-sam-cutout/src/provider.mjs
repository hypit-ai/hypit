import { canonicalize, defineEndpoint } from "@hypit/hypit/endpoint";
import { generationTypes, sealGeneratedVideoSet } from "@hypit/generation";
import { cutoutVideo, DEFAULT_CONCEPT, DEFAULT_MODEL } from "./sam-video.mjs";

/**
 * Hypit project Provider for SAM 3.1 (Meta Model API) as a portrait-cutout video service.
 *
 * Fulfills the existing `@hypit/volcengine-matting@1#matte-portrait-video` capability: authors keep
 * writing `<matte:Portrait source={...} format="WEBM"/>` and only the backend changes. SAM 3.1
 * segments and tracks the configured concept (default "person") through the clip; each frame's mask
 * becomes the frame's alpha channel.
 *
 * Honestly narrower than the model contract in one respect: the concept is Endpoint configuration,
 * not an authored attribute, because the capability carries no prompt port. That is why `supports()`
 * refuses only what this service cannot do at all — a source that is not a video.
 */
export const providerModule = { name: "@example/provider-sam-cutout", version: "1" };
export const capability = {
  module: { name: "@hypit/volcengine-matting", version: "1" },
  name: "matte-portrait-video",
};

/**
 * Same service, but the concept is an authored port instead of Endpoint configuration:
 * `@hypit/sam-cutout@1#sam-3.1-cutout` carries `prompt`, so a run chooses what to keep.
 */
export const cutoutCapability = {
  module: { name: "@hypit/sam-cutout", version: "1" },
  name: "sam-3.1-cutout",
};

// Both are real: VP9 writes alpha out of band (alpha_mode=1) and ProRes 4444 writes it in band.
// The transport re-decodes the result and refuses to return a clip whose alpha plane is missing.
const FORMATS = ["WEBM", "MOV"];

function portsOf(request) {
  return request.constraints?.ports ?? {};
}

function firstText(values) {
  const first = values?.[0];
  return typeof first === "string" && first.length > 0 ? first : undefined;
}

function sourceArtifactOf(ports) {
  const first = ports.source?.[0];
  const artifact = first?.artifact ?? first;
  return typeof artifact?.resource === "string"
    ? { resource: artifact.resource, mediaType: artifact.mediaType ?? "video/mp4" }
    : undefined;
}

function support(request, options, { requirePrompt = false } = {}) {
  const ports = portsOf(request);
  if (requirePrompt) {
    const prompt = firstText(ports.prompt);
    if (prompt === undefined) {
      return { status: "unsupported", reason: "SAM cutout requires a prompt naming the object to keep" };
    }
    if (prompt.length > 2000) {
      return { status: "unsupported", reason: "SAM cutout prompt is longer than the 2000 character port" };
    }
  }
  const format = firstText(ports.format) ?? "WEBM";
  if (!FORMATS.includes(format)) {
    return { status: "unsupported", reason: `SAM cutout writes ${FORMATS.join(" or ")}` };
  }
  if (request.pendingInputs?.some((slot) => slot.input === "source")) {
    return { status: "supported" };
  }
  const source = sourceArtifactOf(ports);
  if (source === undefined) {
    return { status: "unsupported", reason: "SAM cutout needs one source video" };
  }
  if (!String(source.mediaType).startsWith("video/")) {
    return { status: "unsupported", reason: `SAM cutout needs a video source, got ${source.mediaType}` };
  }
  return { status: "supported" };
}

export function createSamMatteProvider(options) {
  async function handler(context) {
    const ports = portsOf(context.need);
    // A prompt on the Need wins; otherwise fall back to the Endpoint's configured concept.
    const concept = firstText(ports.prompt) ?? options.concept;
    if (concept === undefined) throw new Error("SAM cutout needs a concept: prompt on the Need or concept on the Endpoint");
    const format = firstText(ports.format) ?? "WEBM";
    if (!FORMATS.includes(format)) throw new Error(`SAM cutout writes ${FORMATS.join(" or ")}`);
    const source = sourceArtifactOf(ports);
    if (source === undefined) throw new Error("SAM cutout needs one source video artifact");

    const apiKey = context.credentials?.apiKey?.secret;
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new Error("SAM cutout API key credential is unavailable for this Endpoint");
    }

    const bytes = await context.resources.get(source.resource);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      throw new Error(`SAM cutout source ${source.resource} is unavailable`);
    }

    await context.reportProgress?.({
      phase: `Segmenting "${concept}" through ${options.model} (${format}${options.compatibilityCopy === true ? "+MOV" : ""})`,
    });

    const result = await cutoutVideo({
      sourceBytes: bytes,
      sourceMediaType: source.mediaType,
      concept,
      format,
      apiKey,
      baseUrl: options.baseUrl,
      model: options.model,
      ...(options.fetch === undefined ? {} : { fetchImpl: options.fetch }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      compatibilityCopy: options.compatibilityCopy === true,
    });

    // Surface the measured facts of the run instead of a bare "done": mask coverage, carried
    // frames and the source probe decide whether the picture can be trusted.
    await context.reportProgress?.({
      phase: `Cutout ${result.report.composedFrames} frame(s) from ${result.report.maskRecords} mask record(s)`,
      detail: result.report,
    });

    await context.reportProgress?.({ phase: "Storing cutout video" });
    // Primary first: Hypit's primary-video producer picks the first Artifact, and any compatibility
    // copy follows so a consumer that cannot read WebM alpha still has a usable file.
    const artifacts = [await context.resources.put(result.bytes, result.mediaType)];
    for (const extra of result.extras ?? []) {
      artifacts.push(await context.resources.put(extra.bytes, extra.mediaType));
    }
    return { value: { kind: "inline", value: canonicalize(sealGeneratedVideoSet({ videos: artifacts })) } };
  }

  return defineEndpoint({
    instance: options.instance,
    pool: options.pool,
    credentials: { apiKey: options.apiKey },
    credentialInputs: { apiKey: { label: "Meta Model API key" } },
    defaultConcurrency: options.concurrency ?? 1,
    pricing: { kind: "page", url: "https://dev.meta.ai/docs/pricing-rate-limits" },
    capabilities: [{
      lifecycle: "immediate",
      capability,
      returns: generationTypes.videoSet,
      supports: (request) => support(request, options),
      handler,
    }, {
      lifecycle: "immediate",
      capability: cutoutCapability,
      returns: generationTypes.videoSet,
      supports: (request) => support(request, options, { requirePrompt: true }),
      handler,
    }],
  });
}

export { DEFAULT_CONCEPT, DEFAULT_MODEL };
