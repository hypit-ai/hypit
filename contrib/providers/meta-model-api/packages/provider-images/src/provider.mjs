import { canonicalize, defineEndpoint } from "@hypit/hypit/endpoint";
import { generationTypes, sealGeneratedImageSet } from "@hypit/generation";
import { editImage, generateImage, MUSE_SIZES } from "./meta-api.mjs";

/**
 * Hypit project Provider for Meta Model API's Muse Image (muse-image-1.0).
 *
 * Fulfills the existing `@hypit/gpt-image@1#gpt-image-2` capability, so authors keep writing
 * ordinary image requests and only the route changes. Muse answers synchronously, so the capability
 * is `immediate` instead of start/poll/collect. Reference images route to /images/edits.
 */
export const providerModule = { name: "@example/provider-meta-images", version: "1" };
export const capability = { module: { name: "@hypit/gpt-image", version: "1" }, name: "gpt-image-2" };

const MAX_REFERENCES = 4;

function portsOf(request) {
  return request.constraints?.ports ?? {};
}

function firstText(values) {
  const first = values?.[0];
  return typeof first === "string" && first.length > 0 ? first : undefined;
}

function artifactsOf(values) {
  if (!Array.isArray(values)) return [];
  return values.map((item) => {
    const artifact = item?.artifact ?? item;
    return { resource: artifact?.resource, mediaType: artifact?.mediaType ?? "image/png" };
  }).filter((artifact) => typeof artifact.resource === "string");
}

function support(request) {
  const ports = portsOf(request);
  const ratio = firstText(ports.aspectRatio) ?? "1:1";
  if (!(ratio in MUSE_SIZES)) {
    return { status: "unsupported", reason: `Muse Image supports ${Object.keys(MUSE_SIZES).join(", ")}` };
  }
  // Muse Image has no transparency: `background: "transparent"` is rejected by the service with a
  // 400, and every response is opaque. Refuse it here so the Build fails before it is paid for.
  const background = firstText(ports.background) ?? "auto";
  if (background === "transparent") {
    return {
      status: "unsupported",
      reason: "Muse Image always returns an opaque background (background: \"transparent\" is rejected); "
        + "ask for \"opaque\" or \"auto\" and cut the subject out afterwards",
    };
  }
  const references = (ports.images?.length ?? 0)
    + (request.pendingInputs?.filter((slot) => slot.input === "images").length ?? 0);
  if (references > MAX_REFERENCES) {
    return { status: "unsupported", reason: `Muse Image accepts at most ${MAX_REFERENCES} reference images` };
  }
  if (references > 0 && request.pendingInputs?.some((slot) => slot.input === "images")) {
    return { status: "supported" };
  }
  if (firstText(ports.prompt) === undefined) {
    return { status: "unsupported", reason: "Muse Image requires a prompt" };
  }
  return { status: "supported" };
}

export function createMetaImageProvider(options) {
  async function handler(context) {
    const ports = portsOf(context.need);
    const prompt = firstText(ports.prompt);
    if (prompt === undefined) throw new Error("Muse Image requires a prompt");
    const ratio = firstText(ports.aspectRatio) ?? "1:1";
    const size = MUSE_SIZES[ratio];
    if (size === undefined) throw new Error(`Muse Image supports ${Object.keys(MUSE_SIZES).join(", ")}`);
    // Guard the same rule at execution time: a transparent request must never be sent, because an
    // image that silently comes back opaque breaks the authored requirement.
    if ((firstText(ports.background) ?? "auto") === "transparent") {
      throw new Error("Muse Image has no transparent background; use \"opaque\" or \"auto\" and cut the subject out afterwards");
    }
    const apiKey = context.credentials.apiKey?.secret;
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new Error("Muse Image API key credential is unavailable for this Endpoint");
    }

    const images = [];
    for (const artifact of artifactsOf(ports.images)) {
      const bytes = await context.resources.get(artifact.resource);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
        throw new Error(`Muse Image reference ${artifact.resource} is unavailable`);
      }
      images.push({ bytes, mediaType: artifact.mediaType });
    }

    const model = options.model ?? "muse-image-1.0";
    await context.reportProgress?.({
      phase: images.length === 0
        ? `Requesting ${model} at ${ratio}`
        : `Requesting ${model} at ${ratio} with ${images.length} reference image(s)`,
    });
    const common = {
      baseUrl: options.baseUrl,
      model,
      apiKey,
      prompt,
      size,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    };
    const image = images.length === 0
      ? await generateImage(common)
      : await editImage({ ...common, images });

    await context.reportProgress?.({ phase: "Storing generated image" });
    const artifact = await context.resources.put(image.bytes, image.mediaType);
    return { value: { kind: "inline", value: canonicalize(sealGeneratedImageSet({ images: [artifact] })) } };
  }

  return defineEndpoint({
    instance: options.instance,
    pool: options.pool,
    credentials: { apiKey: options.apiKey },
    credentialInputs: { apiKey: { label: "Meta Model API key" } },
    defaultConcurrency: options.concurrency ?? 2,
    pricing: { kind: "page", url: "https://dev.meta.ai/docs/pricing-rate-limits" },
    capabilities: [{
      lifecycle: "immediate",
      capability,
      returns: generationTypes.imageSet,
      supports: support,
      handler,
    }],
  });
}
