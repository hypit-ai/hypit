import type { EndpointSupport } from "@hypit/hypit/endpoint";
import { selectHtmlArtifacts, selectHtmlSurfaces, selectHtmlVideoSources } from "@hypit/html-program";
import type { HtmlFrameRequest, HtmlRasterRequest } from "@hypit/html-program";
import type { FrameSpan } from "@hypit/timeline";
import type { PictureInterpretation } from "@hypit/media";
import type { HtmlRenderer } from "./electron.js";

function sdrSourcePictureRejection(picture: PictureInterpretation, label: string): string | undefined {
  const imageLike = picture.colorPrimaries === "bt709" && picture.colorTransfer === "srgb"
    && picture.colorMatrix === "rgb" && picture.colorRange === "full";
  const videoLike = picture.colorPrimaries === "bt709" && picture.colorTransfer === "bt709"
    && picture.colorMatrix === "bt709" && picture.colorRange === "limited";
  if (picture.bitDepth !== 8 || (!imageLike && !videoLike)) {
    return `${label} is outside the local HTML Provider's exact 8-bit SDR source support`;
  }
  return undefined;
}

function stillPictureRejection(picture: PictureInterpretation, label: string): string | undefined {
  const imageLike = picture.colorPrimaries === "bt709" && picture.colorTransfer === "srgb"
    && picture.colorMatrix === "rgb" && picture.colorRange === "full";
  if (picture.bitDepth !== 8 || !imageLike) {
    return `${label} is outside the local HTML Provider's exact 8-bit sRGB still-picture support`;
  }
  return undefined;
}

function requestFrameSelection(request: HtmlRasterRequest | HtmlFrameRequest): readonly FrameSpan[] | undefined {
  if ("delivery" in request) return request.range === undefined ? undefined : [request.range];
  const spans: FrameSpan[] = [];
  for (const frame of request.frames) {
    const previous = spans.at(-1);
    if (previous?.endFrameExclusive === frame) spans[spans.length - 1] = {
      startFrame: previous.startFrame,
      endFrameExclusive: frame + 1,
    };
    else spans.push({ startFrame: frame, endFrameExclusive: frame + 1 });
  }
  return spans;
}

function programRejection(request: HtmlRasterRequest | HtmlFrameRequest): string | undefined {
  const selection = requestFrameSelection(request);
  for (const artifact of selectHtmlArtifacts(request.program, selection)) {
    if (artifact.kind === "picture") {
      const reason = stillPictureRejection(artifact.picture, `Picture ${artifact.id}`);
      if (reason !== undefined) return reason;
    }
  }
  for (const source of selectHtmlVideoSources(request.program, selection)) {
    if (source.kind === "media") {
      const picture = source.source.interpretation.picture;
      const reason = sdrSourcePictureRejection(picture, `Video source ${source.id}`);
      if (reason !== undefined) return reason;
    }
  }
  for (const surface of selectHtmlSurfaces(request.program, selection)) {
    const reason = surface.surface.timing.kind === "still"
      ? stillPictureRejection(surface.surface.picture, `Surface ${surface.artifactId}`)
      : sdrSourcePictureRejection(surface.surface.picture, `Surface ${surface.artifactId}`);
    if (reason !== undefined) return reason;
  }
  return undefined;
}

/** Exact request subset implemented by the current encoded-visual execution paths. */
export function localHtmlRasterRejection(request: HtmlRasterRequest, _renderer: HtmlRenderer): string | undefined {
  const program = programRejection(request);
  if (program !== undefined) return program;
  const picture = request.delivery.picture;
  const encoding = request.delivery.encoding;
  if (picture.colorPrimaries !== "bt709" || picture.colorTransfer !== "bt709"
    || picture.colorMatrix !== "bt709" || picture.colorRange !== "limited" || picture.bitDepth !== 8
    || encoding.codec !== "h264" || encoding.pixelFormat !== "yuv420p") {
    return "The local HTML Provider currently implements only opaque BT.709 8-bit H.264/yuv420p delivery";
  }
  return undefined;
}

/** Exact request subset implemented by the current Chromium PNG execution path. */
export function localHtmlFrameRejection(request: HtmlFrameRequest): string | undefined {
  const program = programRejection(request);
  if (program !== undefined) return program;
  const picture = request.picture;
  if (picture.colorPrimaries !== "bt709" || picture.colorTransfer !== "srgb"
    || picture.colorMatrix !== "rgb" || picture.colorRange !== "full" || picture.bitDepth !== 8) {
    return "The local HTML Provider currently implements only opaque sRGB 8-bit PNG frame delivery";
  }
  return undefined;
}

export function endpointSupport(reason: string | undefined): EndpointSupport {
  return reason === undefined ? { status: "supported" } : { status: "unsupported", reason };
}

export function assertLocalHtmlRasterSupport(request: HtmlRasterRequest, renderer: HtmlRenderer): void {
  const reason = localHtmlRasterRejection(request, renderer);
  if (reason !== undefined) throw new Error(reason);
}

export function assertLocalHtmlFrameSupport(request: HtmlFrameRequest): void {
  const reason = localHtmlFrameRejection(request);
  if (reason !== undefined) throw new Error(reason);
}
