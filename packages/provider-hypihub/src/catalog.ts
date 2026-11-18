import { HypiHubClient, record } from "./client.js";
import { HypiHubServiceError } from "./errors.js";

export type Operation = "images" | "image_edits" | "videos" | "audio_speech" | "transcriptions";
export type Offering = { readonly model: string; readonly operation: Operation };
export type ReportOffering = (capability: string, offerings: readonly Offering[]) => void;
const paths: Record<Operation, string> = {
  images: "/images/generations", image_edits: "/images/edits", videos: "/videos",
  audio_speech: "/audio/speech", transcriptions: "/audio/transcriptions",
};
export const operationPath = (operation: Operation): string => paths[operation];

export type Selection = Offering & {
  readonly variant?: {
    readonly operation: string;
    readonly roles: readonly string[];
    readonly images: number;
    readonly videos: number;
    readonly audios: number;
    readonly mask?: boolean;
    readonly resolution?: string;
    readonly aspectRatio?: string;
    readonly duration?: number;
    readonly generateAudio?: boolean;
    readonly background?: string;
    readonly quality?: string;
    readonly outputFormat?: string;
    readonly n?: number;
    readonly seed?: number;
  };
};

function inList(value: string | undefined, allowed: unknown): boolean {
  return value === undefined || Array.isArray(allowed) && allowed.some(item =>
    typeof item === "string" && item.toLowerCase() === value.toLowerCase());
}

function inRange(value: number | undefined, min: unknown, max: unknown): boolean {
  return value === undefined || (typeof min !== "number" || value >= min) && (typeof max !== "number" || value <= max);
}

function fitsVariant(raw: unknown, selected: NonNullable<Selection["variant"]>): boolean {
  const candidate = record(raw, "catalogue variant");
  if (candidate.operation !== selected.operation || !selected.roles.some(role => role === candidate.reference_role)
    || !inRange(selected.images, candidate.images_min, candidate.images_max)
    || selected.videos > (typeof candidate.videos_max === "number" ? candidate.videos_max : 0)
    || selected.audios > (typeof candidate.audios_max === "number" ? candidate.audios_max : 0)
    || !inRange(selected.images + selected.videos + selected.audios, undefined, candidate.references_max)
    || !inRange(selected.images + (selected.n ?? 1), undefined, candidate.images_and_outputs_max)
    || (selected.mask && candidate.mask !== true)) return false;
  const params = record(candidate.parameters, "catalogue parameters");
  const controls = params.controls === undefined ? {} : record(params.controls, "catalogue controls");
  return inList(selected.resolution, params.resolutions ?? (params.resolution ? [params.resolution] : []))
    && inList(selected.aspectRatio, params.aspect_ratios)
    && inList(selected.background, params.backgrounds)
    && inList(selected.quality === "auto" ? undefined : selected.quality, params.quality ? [params.quality] : [])
    && inList(selected.outputFormat, params.output_formats)
    && inRange(selected.duration, params.seconds_min, params.seconds_max)
    && inRange(selected.n, params.n_min, params.n_max)
    && (selected.generateAudio !== true || params.generate_audio === true)
    && (selected.seed === undefined || controls.seed === "supported" || controls.seed === "forwarded_unreviewed");
}

export async function verifyOffering(client: HypiHubClient, selection: Selection, signal: AbortSignal): Promise<void> {
  const modelPath = selection.model.split("/").map(encodeURIComponent).join("/");
  const card = await client.json(`/models/${modelPath}`, signal);
  if (!Array.isArray(card.endpoints) || !card.endpoints.includes(selection.operation)) {
    throw new HypiHubServiceError("hypihub-model-operation-unavailable",
      `The selected HypiHub account does not list ${selection.operation} for ${selection.model}.`);
  }
  if (selection.variant === undefined || card.specification === undefined) return;
  const spec = record(card.specification, "catalogue specification");
  const variants = selection.operation === "videos" ? spec.video_variants : spec.image_variants;
  if (Array.isArray(variants) && !variants.some(candidate => fitsVariant(candidate, selection.variant!))) {
    throw new HypiHubServiceError("hypihub-input-unsupported",
      `${selection.model} does not list a matching ${selection.variant.operation} variant for this request on the selected account.`);
  }
}
