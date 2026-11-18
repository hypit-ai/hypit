import { bachPro } from "@hypit/bach";
import { gptImage2, gptImage25Flare, gptImage25Sunburst } from "@hypit/gpt-image";
import { grokImagine15Preview, grokImagineVideo } from "@hypit/grok-imagine";
import { minimaxH3 } from "@hypit/minimax-h3";
import { nanoBanana2, nanoBanana2Lite, nanoBananaPro } from "@hypit/nano-banana";
import { pixverseC1, pixverseV6 } from "@hypit/pixverse";
import { seedance2, seedance2Fast, seedance2Mini, seedance25, seedance25Flash } from "@hypit/seedance";
import { seedream5Lite, seedream5Pro } from "@hypit/seedream";
import { portraitMatting } from "@hypit/volcengine-matting";
import type { ImageRequest, ModelReference, VideoRequest } from "@hypit/execution/model";
import { bindHypiHubJob } from "./jobs.js";
import type { ReportOffering, Selection } from "./catalog.js";
import type { HypiHubClient, HypiHubInputs } from "./client.js";

async function urls(input: HypiHubInputs, refs: readonly ModelReference[] | undefined): Promise<string[] | undefined> {
  if (refs === undefined) return undefined;
  const result: string[] = [];
  for (const ref of refs) result.push(await input.url(ref));
  return result;
}

function videoSelection(model: string, request: VideoRequest): Selection {
  const video = request.referenceVideos?.length ?? 0;
  const audio = request.referenceAudios?.length ?? 0;
  const images = request.referenceImages?.length ?? (request.lastFrame ? 2 : request.firstFrame ? 1 : 0);
  return { model, operation: "videos", variant: {
    operation: request.mode === "text" ? "text-to-video" : request.mode === "frames" ? "image-to-video" : "reference-to-video",
    roles: request.mode === "text" ? ["none"] : request.mode === "frames"
      ? [images === 2 ? "first_last_images" : "first_image"]
      : video || audio ? ["multimodal"] : ["multimodal", "reference_image"],
    images, videos: video, audios: audio,
    resolution: request.resolution,
    ...(request.aspectRatio === undefined ? {} : { aspectRatio: request.aspectRatio }),
    ...(request.duration === undefined ? {} : { duration: request.duration }),
    ...(request.generateAudio === undefined ? {} : { generateAudio: request.generateAudio }),
    ...(request.seed === undefined ? {} : { seed: request.seed }),
  } };
}

async function videoBody(request: VideoRequest, input: HypiHubInputs): Promise<object> {
  return {
    prompt: request.prompt, seconds: request.duration, resolution: request.resolution, aspect_ratio: request.aspectRatio,
    generate_audio: request.generateAudio, web_search: request.webSearch, seed: request.seed,
    first_frame: request.firstFrame === undefined ? undefined : await input.url(request.firstFrame),
    last_frame: request.lastFrame === undefined ? undefined : await input.url(request.lastFrame),
    reference_image_urls: await urls(input, request.referenceImages),
    reference_videos: await urls(input, request.referenceVideos),
    reference_audios: await urls(input, request.referenceAudios),
  };
}

function imageSelection(model: string, request: ImageRequest): Selection {
  const edit = request.mode === "edit";
  return { model, operation: edit ? "image_edits" : "images", variant: {
    operation: edit ? "image-to-image" : "text-to-image",
    roles: [edit ? "reference_images" : "none"], images: request.images?.length ?? 0, videos: 0, audios: 0,
    aspectRatio: request.aspectRatio, mask: request.mask !== undefined,
    ...(request.resolution === undefined ? {} : { resolution: request.resolution }),
    ...(request.background === undefined ? {} : { background: request.background }),
    ...(request.quality === undefined ? {} : { quality: request.quality }),
    ...(request.outputFormat === undefined ? {} : { outputFormat: request.outputFormat }),
    ...(request.n === undefined ? {} : { n: request.n }),
  } };
}

async function imageBody(request: ImageRequest, input: HypiHubInputs): Promise<object> {
  const references = await urls(input, request.images);
  return {
    prompt: request.prompt, aspect_ratio: request.aspectRatio, resolution: request.resolution, quality: request.quality,
    background: request.background, output_format: request.outputFormat, watermark: request.watermark, nsfw_check: request.nsfwCheck,
    n: request.n, reference_images: references?.map(url => ({ url })),
    mask: request.mask === undefined ? undefined : { url: await input.url(request.mask) },
  };
}

const videoModels = [
  [seedance2, "bytedance/seedance-2"], [seedance2Fast, "bytedance/seedance-2-fast"],
  [seedance2Mini, "bytedance/seedance-2-mini"], [seedance25, "bytedance/seedance-2.5"],
  [seedance25Flash, "bytedance/seedance-2.5-flash"],
  [pixverseV6, "pixverse/v6"], [pixverseC1, "pixverse/c1"],
  [grokImagineVideo, "xai/grok-imagine-video"], [grokImagine15Preview, "xai/grok-imagine-video-1.5-preview"],
  [minimaxH3, "minimax/minimax-h3"], [bachPro, "bach/bach-1.0-pro"],
] as const;
const imageModels = [
  [gptImage2, "openai/gpt-image-2", "openai/gpt-image-2"],
  [gptImage25Flare, "openai/gpt-image-2.5-flare-text-to-image", "openai/gpt-image-2.5-flare-image-to-image"],
  [gptImage25Sunburst, "openai/gpt-image-2.5-sunburst-text-to-image", "openai/gpt-image-2.5-sunburst-image-to-image"],
  [nanoBanana2, "google/nano-banana-2", "google/nano-banana-2"],
  [nanoBanana2Lite, "google/nano-banana-2-lite", "google/nano-banana-2-lite"],
  [nanoBananaPro, "google/nano-banana-pro", "google/nano-banana-pro"],
  [seedream5Lite, "bytedance/seedream-5-lite", "bytedance/seedream-5-lite"],
  [seedream5Pro, "bytedance/seedream-5-pro", "bytedance/seedream-5-pro"],
] as const;

export function hypiHubJobs(id: string, client: HypiHubClient, report: ReportOffering) {
  const matting = { model: "matte-portrait-video", operation: "videos" } as const;
  report(portraitMatting.id, [matting]);
  return [
    ...videoModels.map(([capability, model]) => {
      report(capability.id, [{ model, operation: "videos" }]);
      return bindHypiHubJob(id, client, {
        capability, output: "video", select: request => videoSelection(model, request), body: videoBody, mime: () => "video/mp4",
        quoteUsage: request => ({ videos: (request.referenceVideos ?? []).map(reference => reference.resource) }),
      });
    }),
    ...imageModels.map(([capability, text, edit]) => {
      report(capability.id, [{ model: text, operation: "images" }, { model: edit, operation: "image_edits" }]);
      return bindHypiHubJob(id, client, {
        capability, output: "image",
        select: request => imageSelection(request.mode === "text" ? text : edit, request),
        body: imageBody,
        mime: request => request.outputFormat === "jpeg" || request.outputFormat === "jpg" ? "image/jpeg" : `image/${request.outputFormat ?? "png"}`,
      });
    }),
    bindHypiHubJob(id, client, {
      capability: portraitMatting, output: "video",
      select: () => matting,
      quoteUsage: (request, inputs) => {
        const duration = inputs[request.source.resource]?.durationSeconds;
        return duration === undefined ? {} : { duration };
      },
      body: async (request, input) => ({
        ref_video_url: await input.url(request.source), format: request.format, background_color: request.backgroundColor,
      }),
      mime: request => request.format === "MOV" ? "video/quicktime" : `video/${request.format.toLowerCase()}`,
    }),
  ];
}
