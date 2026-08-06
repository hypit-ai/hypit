import {
  geminiOmniEndpoints,
  verifyGeminiOmniRequest,
} from "@svml/gemini-omni";
import type { GeminiOmniRequest } from "@svml/gemini-omni";
import {
  gptImageEndpoints,
  verifyGptImage2Request,
} from "@svml/gpt-image";
import type { GptImage2Request } from "@svml/gpt-image";
import {
  grokImagineEndpoints,
  verifyGrokImagineRequest,
} from "@svml/grok-imagine";
import type { GrokImagineRequest } from "@svml/grok-imagine";
import {
  minimaxH3Endpoints,
  verifyMinimaxH3Request,
} from "@svml/minimax-h3";
import type { MinimaxH3Request } from "@svml/minimax-h3";
import {
  nanoBananaEndpoints,
  verifyNanoBananaRequest,
} from "@svml/nano-banana";
import type { NanoBananaRequest } from "@svml/nano-banana";
import { canonicalize } from "@svml/protocol";
import type {
  BlobRef,
  CanonicalValue,
  CapabilityRef,
  TypeRef,
} from "@svml/protocol";
import {
  seedanceEndpoints,
  verifySeedanceRequest,
} from "@svml/seedance";
import type { SeedanceRequest } from "@svml/seedance";
import {
  seedreamEndpoints,
  verifySeedreamRequest,
} from "@svml/seedream";
import type { SeedreamRequest } from "@svml/seedream";

export type KieArtifactUrlResolver = (artifact: BlobRef) => Promise<string>;

export type KieTask = {
  readonly model: string;
  readonly input: CanonicalValue;
  readonly result: "image" | "video";
};

export type KieModelAdapter = {
  readonly key: string;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly result: "image" | "video";
  verify(value: unknown): void;
  task(value: unknown, resolve: KieArtifactUrlResolver): Promise<KieTask>;
};

function capabilityKey(ref: CapabilityRef): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

async function urls(values: readonly BlobRef[] | undefined, resolve: KieArtifactUrlResolver): Promise<string[]> {
  return values === undefined ? [] : await Promise.all(values.map(resolve));
}

function adapter(
  key: string,
  endpoint: { readonly capability: CapabilityRef; readonly returns: TypeRef },
  result: "image" | "video",
  verify: (value: unknown) => void,
  task: (value: unknown, resolve: KieArtifactUrlResolver) => Promise<KieTask>,
): KieModelAdapter {
  return { key, capability: endpoint.capability, returns: endpoint.returns, result, verify, task };
}

const seedanceAdapters = ([
  ["standard", "bytedance/seedance-2", "seedance-2"],
  ["fast", "bytedance/seedance-2-fast", "seedance-2-fast"],
  ["mini", "bytedance/seedance-2-mini", "seedance-2-mini"],
] as const).map(([key, kieModel, authorModel]) => adapter(
  `seedance.${key}`,
  seedanceEndpoints[key]!,
  "video",
  (value) => verifySeedanceRequest(value, authorModel),
  async (value, resolve) => {
    verifySeedanceRequest(value, authorModel);
    const request = value as SeedanceRequest;
    const modeInput: Record<string, CanonicalValue> = {};
    if (request.mode.kind === "frames") {
      modeInput.first_frame_url = await resolve(request.mode.firstFrame);
      if (request.mode.lastFrame !== undefined) modeInput.last_frame_url = await resolve(request.mode.lastFrame);
    } else if (request.mode.kind === "reference") {
      const groups = {
        image: request.mode.items.filter((item) => item.kind === "image").map((item) => item.artifact),
        video: request.mode.items.filter((item) => item.kind === "video").map((item) => item.artifact),
        audio: request.mode.items.filter((item) => item.kind === "audio").map((item) => item.artifact),
      };
      if (groups.image.length > 0) modeInput.reference_image_urls = await urls(groups.image, resolve);
      if (groups.video.length > 0) modeInput.reference_video_urls = await urls(groups.video, resolve);
      if (groups.audio.length > 0) modeInput.reference_audio_urls = await urls(groups.audio, resolve);
    }
    return {
      model: kieModel,
      result: "video",
      input: canonicalize({
        prompt: request.prompt,
        ...modeInput,
        return_last_frame: false,
        generate_audio: request.generateAudio,
        resolution: request.resolution,
        aspect_ratio: request.aspectRatio,
        duration: request.durationSec,
        web_search: request.webSearch,
      }),
    };
  },
));

const minimaxAdapters = ([
  ["text", "minimax-h3/text-to-video"],
  ["frames", "minimax-h3/image-to-video"],
  ["reference", "minimax-h3/reference-to-video"],
] as const).map(([mode, kieModel]) => adapter(
  `minimax-h3.${mode}`,
  minimaxH3Endpoints[mode]!,
  "video",
  (value) => verifyMinimaxH3Request(value, mode),
  async (value, resolve) => {
    verifyMinimaxH3Request(value, mode);
    const request = value as MinimaxH3Request;
    const input: Record<string, CanonicalValue> = {
      prompt: request.prompt,
      duration: request.durationSec,
    };
    if (request.mode === "text") input.aspect_ratio = request.aspectRatio;
    if (request.mode === "frames") {
      input.first_frame_url = await resolve(request.firstFrame);
      if (request.lastFrame !== undefined) input.last_frame_url = await resolve(request.lastFrame);
    }
    if (request.mode === "reference") {
      input.aspect_ratio = request.aspectRatio;
      const images = request.references.filter((item) => item.kind === "image").map((item) => item.artifact);
      const videos = request.references.filter((item) => item.kind === "video").map((item) => item.artifact);
      const audios = request.references.filter((item) => item.kind === "audio").map((item) => item.artifact);
      if (images.length > 0) input.reference_image_urls = await urls(images, resolve);
      if (videos.length > 0) input.reference_video_urls = await urls(videos, resolve);
      if (audios.length > 0) input.reference_audio_urls = await urls(audios, resolve);
    }
    return {
      model: kieModel,
      input: canonicalize(input),
      result: "video",
    };
  },
));

const geminiAdapter = adapter(
  "gemini-omni.video",
  geminiOmniEndpoints.video!,
  "video",
  verifyGeminiOmniRequest,
  async (value, resolve) => {
    verifyGeminiOmniRequest(value);
    const request = value as GeminiOmniRequest;
    const input: Record<string, CanonicalValue> = {
      prompt: request.prompt,
      duration: String(request.durationSec),
      aspect_ratio: request.aspectRatio,
      resolution: request.resolution,
    };
    if (request.seed !== undefined) input.seed = request.seed;
    if (request.images !== undefined) input.image_urls = await urls(request.images, resolve);
    if (request.audioIds !== undefined) input.audio_ids = [...request.audioIds];
    if (request.characterIds !== undefined) input.character_ids = [...request.characterIds];
    if (request.videos !== undefined) {
      input.video_list = await Promise.all(request.videos.map(async (video) => ({
        url: await resolve(video.artifact),
        start: video.startSec,
        ends: video.endSec,
      })));
    }
    return {
      model: "gemini-omni-video",
      input: canonicalize(input),
      result: "video",
    };
  },
);

const grokAdapters = (["text", "image", "preview-1.5"] as const).map((mode) => adapter(
  `grok-imagine.${mode}`,
  grokImagineEndpoints[mode]!,
  "video",
  (value) => verifyGrokImagineRequest(value, mode),
  async (value, resolve) => {
    verifyGrokImagineRequest(value, mode);
    const request = value as GrokImagineRequest;
    const preview = request.mode === "preview-1.5";
    const input: Record<string, CanonicalValue> = {
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio,
      resolution: request.resolution,
      duration: preview ? request.durationSec : String(request.durationSec),
    };
    if (!preview) input.mode = "normal";
    if (request.mode === "image") {
      input.image_urls = await urls(request.images, resolve);
      if (request.sourceTaskId !== undefined) input.task_id = request.sourceTaskId;
    } else if (request.mode === "preview-1.5" && request.images !== undefined) {
      input.image_urls = await urls(request.images, resolve);
    }
    return {
      model: request.mode === "text" ? "grok-imagine/text-to-video"
        : request.mode === "image" ? "grok-imagine/image-to-video" : "grok-imagine-video-1-5-preview",
      input: canonicalize(input),
      result: "video",
    };
  },
));

const gptImageAdapters = (["text", "image"] as const).map((mode) => adapter(
  `gpt-image-2.${mode}`,
  gptImageEndpoints[mode]!,
  "image",
  (value) => verifyGptImage2Request(value, mode),
  async (value, resolve) => {
    verifyGptImage2Request(value, mode);
    const request = value as GptImage2Request;
    const input: Record<string, CanonicalValue> = {
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio,
    };
    if (request.mode === "image") input.input_urls = await urls(request.images, resolve);
    return {
      model: request.mode === "text" ? "gpt-image-2-text-to-image" : "gpt-image-2-image-to-image",
      input: canonicalize(input),
      result: "image",
    };
  },
));

const nanoAdapters = (["v2", "pro"] as const).map((key) => adapter(
  `nano-banana.${key}`,
  nanoBananaEndpoints[key]!,
  "image",
  (value) => verifyNanoBananaRequest(value, key === "v2" ? "nano-banana-2" : "nano-banana-pro"),
  async (value, resolve) => {
    const model = key === "v2" ? "nano-banana-2" : "nano-banana-pro";
    verifyNanoBananaRequest(value, model);
    const request = value as NanoBananaRequest;
    return {
      model,
      result: "image",
      input: canonicalize({
        prompt: request.prompt,
        image_input: await urls(request.images, resolve),
        aspect_ratio: request.aspectRatio,
        resolution: request.resolution,
        output_format: request.outputFormat,
      }),
    };
  },
));

const seedreamAdapters = (["text", "image"] as const).map((mode) => adapter(
  `seedream.${mode}`,
  seedreamEndpoints[mode]!,
  "image",
  (value) => verifySeedreamRequest(value, mode),
  async (value, resolve) => {
    verifySeedreamRequest(value, mode);
    const request = value as SeedreamRequest;
    const input: Record<string, CanonicalValue> = {
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio,
      quality: request.quality,
      output_format: request.outputFormat,
      nsfw_checker: request.nsfwCheck,
    };
    if (request.mode === "image") input.image_urls = await urls(request.images, resolve);
    return {
      model: request.mode === "text" ? "seedream/5-lite-text-to-image" : "seedream/5-lite-image-to-image",
      input: canonicalize(input),
      result: "image",
    };
  },
));

export const kieModelCatalog: readonly KieModelAdapter[] = [
  ...seedanceAdapters,
  ...minimaxAdapters,
  geminiAdapter,
  ...grokAdapters,
  ...gptImageAdapters,
  ...nanoAdapters,
  ...seedreamAdapters,
];

const catalogByCapability = new Map(kieModelCatalog.map((item) => [capabilityKey(item.capability), item]));

export function kieAdapterForCapability(capability: CapabilityRef): KieModelAdapter | undefined {
  return catalogByCapability.get(capabilityKey(capability));
}

export function verifyKieModelCatalog(): void {
  if (catalogByCapability.size !== kieModelCatalog.length) throw new Error("KIE model catalog repeats a capability");
  kieModelCatalog.forEach((item) => {
    if (item.key.trim().length === 0) throw new Error("KIE model catalog contains an empty key");
  });
}
