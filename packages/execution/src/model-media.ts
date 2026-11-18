import type { Capability, InvocationInputs } from "./model.js";

type MediaKind = "image" | "video" | "audio";
export type ModelReference = { readonly resource: string; readonly personReference?: boolean };

export function modelObject(value: unknown, subject: string, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(name => !fields.includes(name))) {
    throw new Error(`${subject} must be an object with fields ${fields.join(", ")}.`);
  }
  return value as Record<string, unknown>;
}

export function modelText(value: unknown, subject: string, max = 20_000): string {
  if (typeof value !== "string" || value.trim().length === 0 || [...value].length > max) {
    throw new Error(`${subject} must contain 1–${max} characters.`);
  }
  return value;
}

export function modelOption<T extends string>(value: unknown, subject: string, values: readonly T[]): T {
  const found = values.find(item => item === value);
  if (found === undefined) throw new Error(`${subject} must be one of ${values.join(", ")}.`);
  return found;
}

export function modelNumber(value: unknown, subject: string, min: number, max: number, whole = true): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (whole && !Number.isInteger(value))
    || value < min || value > max) throw new Error(`${subject} must be ${whole ? "a whole number" : "a number"} from ${min} to ${max}.`);
  return value;
}

export function modelBoolean(value: unknown, subject: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${subject} must be a boolean.`);
  return value;
}

export function readModelReference(value: unknown, field: string, classified = false): ModelReference {
  const input = modelObject(value, field, classified ? ["resource", "personReference"] : ["resource"]);
  if (typeof input.resource !== "string" || !/^[a-z][a-z0-9.-]{0,191}$/u.test(input.resource)) {
    throw new Error(`${field} must name an Invocation input resource.`);
  }
  return { resource: input.resource,
    ...(classified ? { personReference: modelBoolean(input.personReference, `${field}.personReference`) } : {}) };
}

export function readModelReferences(
  value: unknown, field: string, max: number, classified = false,
): readonly ModelReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error(`${field} accepts up to ${max} references.`);
  return value.map((item, index) => readModelReference(item, `${field}[${index}]`, classified));
}

export function requireModelInputs(
  inputs: InvocationInputs,
  references: readonly (readonly [ref: ModelReference, media: MediaKind, formats?: readonly string[]])[],
): void {
  const named = new Set<string>();
  for (const [ref, media, formats] of references) {
    const input = Object.hasOwn(inputs, ref.resource) ? inputs[ref.resource] : undefined;
    if (input === undefined || !input.mediaType.startsWith(`${media}/`)
      || (formats !== undefined && !formats.includes(input.mediaType)) || input.size === 0) {
      throw new Error(`Invocation input ${ref.resource} must supply ${formats?.join(" or ") ?? media} bytes.`);
    }
    named.add(ref.resource);
  }
  for (const name of Object.keys(inputs)) {
    if (!named.has(name)) throw new Error(`Unexpected Invocation input ${name}.`);
  }
}

export function mediaOutput(kind: MediaKind): Capability["outputs"] {
  const field = `${kind}s`;
  return {
    [kind]: {
      type: `@hypit/execution/generated-${field}`,
      read(value, resources) {
        const names = modelObject(value, `Generated ${field}`, [field])[field];
        if (!Array.isArray(names) || names.length === 0 || new Set(names).size !== names.length
          || names.length !== Object.keys(resources).length) throw new Error(`Expected named ${kind} output resources.`);
        for (const name of names) {
          if (typeof name !== "string" || !Object.hasOwn(resources, name)
            || !resources[name]!.mediaType.startsWith(`${kind}/`) || resources[name]!.size === 0) {
            throw new Error(`Generated ${kind} contains an invalid resource.`);
          }
        }
        return { [field]: names as string[] };
      },
    },
  };
}

type ModelIdentity = { readonly package: string; readonly model: string; readonly title: string };
export type VideoRequest = {
  readonly mode: "text" | "frames" | "references";
  readonly prompt: string;
  readonly duration?: number;
  readonly resolution: string;
  readonly aspectRatio?: string;
  readonly generateAudio?: boolean;
  readonly webSearch?: boolean;
  readonly seed?: number;
  readonly firstFrame?: ModelReference;
  readonly lastFrame?: ModelReference;
  readonly referenceImages?: readonly ModelReference[];
  readonly referenceVideos?: readonly ModelReference[];
  readonly referenceAudios?: readonly ModelReference[];
};

type VideoDefinition = ModelIdentity & {
  readonly duration: readonly [min: number, max: number];
  readonly textDuration?: readonly [min: number, max: number];
  readonly fractionalDuration?: boolean;
  readonly automaticDuration?: boolean;
  readonly sourceDuration?: boolean;
  readonly resolutions: readonly string[];
  readonly defaultResolution: string;
  readonly aspectRatios: readonly string[];
  readonly frameRatios?: readonly string[];
  readonly defaultAspectRatio?: string;
  readonly defaultFrameRatio?: string;
  readonly audio?: boolean;
  readonly webSearch?: boolean;
  readonly seed?: boolean;
  readonly promptLimit?: number;
  readonly firstFrame?: boolean;
  readonly lastFrame?: boolean;
  readonly references?: readonly [images: number, videos: number, audios: number];
  readonly classifiedVisuals?: boolean;
  readonly audioNeedsVisual?: boolean;
};

export function defineVideoModel(definition: VideoDefinition): Capability<VideoRequest> {
  const { firstFrame, lastFrame, references, classifiedVisuals, audioNeedsVisual, sourceDuration } = definition;
  const fields = ["mode", "prompt", "duration", "resolution", "aspectRatio"];
  if (firstFrame) fields.push("firstFrame");
  if (lastFrame) fields.push("lastFrame");
  if (references?.[0]) fields.push("referenceImages");
  if (references?.[1]) fields.push("referenceVideos");
  if (references?.[2]) fields.push("referenceAudios");
  if (definition.audio !== undefined) fields.push("generateAudio");
  if (definition.webSearch) fields.push("webSearch");
  if (definition.seed) fields.push("seed");
  const modes = ["text", ...(firstFrame ? ["frames" as const] : []), ...(references ? ["references" as const] : [])] as const;
  return {
    id: `${definition.package}/${definition.model}`,
    title: definition.title,
    outputs: mediaOutput("video"),
    readRequest(value) {
      const request = modelObject(value, definition.title, fields);
      const mode = modelOption(request.mode, "Video mode", modes);
      const frames = mode === "frames" ? {
        firstFrame: readModelReference(request.firstFrame, "firstFrame", classifiedVisuals),
        ...(request.lastFrame === undefined ? {} : { lastFrame: readModelReference(request.lastFrame, "lastFrame", classifiedVisuals) }),
      } : {};
      if (mode !== "frames" && (request.firstFrame !== undefined || request.lastFrame !== undefined)) {
        throw new Error("First and last frame fields require frames mode.");
      }
      const images = readModelReferences(request.referenceImages, "referenceImages", references?.[0] ?? 0, classifiedVisuals);
      const videos = readModelReferences(request.referenceVideos, "referenceVideos", references?.[1] ?? 0, classifiedVisuals);
      const audios = readModelReferences(request.referenceAudios, "referenceAudios", references?.[2] ?? 0);
      if ((mode === "references") !== (images.length + videos.length + audios.length > 0)) {
        throw new Error("References mode requires one or more references. Supply references only in that mode.");
      }
      if (audioNeedsVisual && audios.length > 0 && images.length + videos.length === 0) {
        throw new Error("Audio references require at least one image or video reference.");
      }
      const webSearch = request.webSearch === undefined ? undefined : modelBoolean(request.webSearch, "webSearch");
      if (webSearch === true && mode !== "text") throw new Error("Web search requires text mode.");
      const [min, max] = mode === "text" ? definition.textDuration ?? definition.duration : definition.duration;
      const sourceControlsDuration = sourceDuration && videos.length > 0;
      if (sourceControlsDuration && request.duration !== undefined) throw new Error("The reference video determines duration.");
      const duration = sourceControlsDuration ? undefined : definition.automaticDuration && request.duration === -1
        ? -1 : modelNumber(request.duration, "Duration", min, max, !definition.fractionalDuration);
      const ratio = request.aspectRatio ?? (mode === "frames" ? definition.defaultFrameRatio : definition.defaultAspectRatio);
      return {
        mode, prompt: modelText(request.prompt, "Prompt", definition.promptLimit),
        resolution: modelOption(request.resolution ?? definition.defaultResolution, "Resolution", definition.resolutions),
        ...(duration === undefined ? {} : { duration }),
        ...(ratio === undefined ? {} : { aspectRatio: modelOption(ratio, "Aspect ratio",
          mode === "frames" ? definition.frameRatios ?? definition.aspectRatios : definition.aspectRatios) }),
        ...(definition.audio === undefined ? {} : { generateAudio: modelBoolean(request.generateAudio ?? definition.audio, "generateAudio") }),
        ...(webSearch === undefined ? {} : { webSearch }),
        ...(request.seed === undefined ? {} : { seed: modelNumber(request.seed, "Seed", -1, 2_147_483_647) }),
        ...frames,
        ...(images.length === 0 ? {} : { referenceImages: images }),
        ...(videos.length === 0 ? {} : { referenceVideos: videos }),
        ...(audios.length === 0 ? {} : { referenceAudios: audios }),
      };
    },
    checkInputs(request, inputs) {
      const images = [request.firstFrame, request.lastFrame, ...(request.referenceImages ?? [])].filter(ref => ref !== undefined);
      requireModelInputs(inputs, [
        ...images.map(ref => [ref, "image"] as const),
        ...(request.referenceVideos ?? []).map(ref => [ref, "video"] as const),
        ...(request.referenceAudios ?? []).map(ref => [ref, "audio", ["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3"]] as const),
      ]);
    },
  };
}

export type ImageRequest = {
  readonly mode: "text" | "edit";
  readonly prompt: string;
  readonly aspectRatio: string;
  readonly resolution?: string;
  readonly quality?: string;
  readonly background?: string;
  readonly outputFormat?: string;
  readonly n?: number;
  readonly watermark?: boolean;
  readonly nsfwCheck?: boolean;
  readonly images?: readonly ModelReference[];
  readonly mask?: ModelReference;
};

type ImageDefinition = ModelIdentity & {
  readonly aspectRatios: readonly string[];
  readonly defaultAspectRatio?: string;
  readonly resolutions?: readonly string[];
  readonly defaultResolution?: string;
  readonly quality?: readonly string[];
  readonly defaultQuality?: string;
  readonly backgrounds?: readonly string[];
  readonly formats?: readonly string[];
  readonly promptLimit?: number;
  readonly references: number;
  readonly outputs?: number;
  readonly imagesAndOutputs?: number;
  readonly mask?: boolean;
  readonly watermark?: boolean;
  readonly nsfwCheck?: boolean;
};

export function defineImageModel(definition: ImageDefinition): Capability<ImageRequest> {
  const fields = ["mode", "prompt", "aspectRatio", "images"];
  if (definition.resolutions) fields.push("resolution");
  if (definition.quality) fields.push("quality");
  if (definition.backgrounds) fields.push("background");
  if (definition.formats) fields.push("outputFormat");
  if (definition.outputs) fields.push("n");
  if (definition.mask) fields.push("mask");
  if (definition.watermark) fields.push("watermark");
  if (definition.nsfwCheck) fields.push("nsfwCheck");
  return {
    id: `${definition.package}/${definition.model}`,
    title: definition.title,
    outputs: mediaOutput("image"),
    readRequest(value) {
      const request = modelObject(value, definition.title, fields);
      const mode = modelOption(request.mode, "Image mode", ["text", "edit"] as const);
      const images = readModelReferences(request.images, "images", definition.references);
      if ((mode === "edit") !== (images.length > 0)) throw new Error("Edit mode requires reference images. Supply images only in edit mode.");
      const mask = request.mask === undefined ? undefined : readModelReference(request.mask, "mask");
      if (mask !== undefined && mode !== "edit") throw new Error("A mask requires edit mode.");
      const n = definition.outputs === undefined ? undefined : modelNumber(request.n ?? 1, "Image count", 1, definition.outputs);
      if (definition.imagesAndOutputs !== undefined && images.length + (n ?? 1) > definition.imagesAndOutputs) {
        throw new Error(`The sum of input and output images may not exceed ${definition.imagesAndOutputs}.`);
      }
      const resolution = request.resolution ?? definition.defaultResolution;
      const quality = request.quality ?? definition.defaultQuality;
      return {
        mode, prompt: modelText(request.prompt, "Prompt", definition.promptLimit),
        aspectRatio: modelOption(request.aspectRatio ?? definition.defaultAspectRatio ?? "1:1", "Aspect ratio", definition.aspectRatios),
        ...(resolution === undefined ? {} : { resolution: modelOption(resolution, "Resolution", definition.resolutions!) }),
        ...(quality === undefined ? {} : { quality: modelOption(quality, "Quality", definition.quality!) }),
        ...(request.background === undefined ? {} : { background: modelOption(request.background, "Background", definition.backgrounds!) }),
        ...(request.outputFormat === undefined ? {} : { outputFormat: modelOption(request.outputFormat, "Output format", definition.formats!) }),
        ...(request.watermark === undefined ? {} : { watermark: modelBoolean(request.watermark, "Watermark") }),
        ...(request.nsfwCheck === undefined ? {} : { nsfwCheck: modelBoolean(request.nsfwCheck, "NSFW check") }),
        ...(n === undefined ? {} : { n }),
        ...(images.length === 0 ? {} : { images }),
        ...(mask === undefined ? {} : { mask }),
      };
    },
    checkInputs(request, inputs) {
      requireModelInputs(inputs, [
        ...(request.images ?? []).map(ref => [ref, "image"] as const),
        ...(request.mask === undefined ? [] : [[request.mask, "image", ["image/png"]] as const]),
      ]);
    },
  };
}
