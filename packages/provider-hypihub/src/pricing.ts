import type { EndpointQuote, JsonValue, QuoteInputs } from "@hypit/execution";
import { record, type HypiHubClient } from "./client.js";
import { verifyOffering, type Selection } from "./catalog.js";
import { HypiHubHttpError } from "./errors.js";

export async function quoteHypiHub(
  client: HypiHubClient, selection: Selection, inputs: QuoteInputs, signal: AbortSignal,
  usage: { readonly text?: string; readonly audio?: string; readonly videos?: readonly string[]; readonly duration?: number } = {},
): Promise<EndpointQuote> {
  await verifyOffering(client, selection, signal);
  const path = `/pricing?model=${encodeURIComponent(selection.model)}`;
  let scheme;
  try { scheme = await client.json(path, signal); }
  catch (error) {
    if (error instanceof HypiHubHttpError && (error.code === "pricing_unavailable" || error.status === 422)) {
      return { kind: "unavailable", reason: error.message };
    }
    throw error;
  }
  const card = record(scheme.pricing, "pricing scheme");
  const pricing = card as JsonValue;
  const { model, variant } = selection;
  const pricingOnly = (missing: string[]): EndpointQuote =>
    ({ kind: "pricing", model, source: client.base + path, pricing, missing });
  const units: Record<string, number> = { requests: 1 };
  const dimensions: Record<string, string | string[]> = {};
  const flags: string[] = [];
  const missing: string[] = [];
  if (variant?.generateAudio === false && card.media !== null && typeof card.media === "object"
    && "audio" in card.media && card.media.audio === true) {
    missing.push("an estimate for explicitly disabled default audio");
  }
  if (variant?.resolution !== undefined) dimensions.resolution = variant.resolution;
  if (variant?.quality !== undefined) dimensions.quality = variant.quality;
  if (variant?.generateAudio) flags.push("audio");
  if (variant?.images) units.input_images = variant.images;
  if (selection.operation === "images" || selection.operation === "image_edits") units.images = variant?.n ?? 1;
  const duration = variant?.duration ?? usage.duration;
  if (duration !== undefined) units.seconds = duration;
  if (usage.text !== undefined) {
    units.characters = Array.from(usage.text).length;
    units.text_bytes = Buffer.byteLength(usage.text);
  }
  if (usage.audio !== undefined) {
    const duration = inputs[usage.audio]?.durationSeconds;
    if (duration !== undefined) units.audio_seconds = duration;
  }
  if (usage.videos?.length) {
    flags.push("reference_video");
    const durations = usage.videos.map(name => inputs[name]?.durationSeconds);
    if (durations.every(duration => duration !== undefined)) {
      units.input_seconds = durations.reduce((sum, duration) => sum + duration, 0);
    } else if (card.per_input_second_usd !== undefined || card.media_rates !== undefined) {
      missing.push("reference video duration");
    }
  }
  if (flags.length > 0) dimensions.flags = flags;
  if (card.free !== true) {
    switch (card.mode) {
      case "per_request":
      case "per_image": break;
      case "per_second":
        if (units.seconds === undefined) missing.push("output duration");
        break;
      case "per_audio_second":
        if (units.audio_seconds === undefined) missing.push("audio duration");
        break;
      case "per_character":
        if (usage.text === undefined) missing.push("text length");
        break;
      case "per_token": missing.push("billed tokens"); break;
      case "per_megapixel": missing.push("billed megapixels"); break;
      default: missing.push("metering units for this pricing mode");
    }
  }
  if (missing.length > 0) return pricingOnly(missing);
  const quotePath = "/pricing/quote";
  let quote;
  try {
    quote = await client.json(quotePath, signal, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, units, dimensions, model_operation: variant?.operation,
        first_frame: variant?.roles.includes("first_image") || variant?.roles.includes("first_last_images") }),
    });
  } catch (error) {
    if (error instanceof HypiHubHttpError && ["invalid_dimensions", "invalid_units"].includes(error.code)) {
      return pricingOnly([error.message]);
    }
    if (error instanceof HypiHubHttpError && error.code === "pricing_unavailable") {
      return { kind: "unavailable", reason: error.message };
    }
    throw error;
  }
  const { estimated_usd: usd, estimated_credits: credits } = quote;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0
    || typeof credits !== "number" || !Number.isFinite(credits) || credits < 0) {
    throw new Error("HypiHub returned an invalid price estimate.");
  }
  return { kind: "estimate", model, source: client.base + quotePath, pricing: record(quote.pricing, "quoted pricing") as JsonValue,
    estimatedUSD: usd, estimatedCredits: credits, units: record(quote.units, "quoted units") as JsonValue,
    dimensions: record(quote.dimensions, "quoted dimensions") as JsonValue };
}
