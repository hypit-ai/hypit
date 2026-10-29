import type { EndpointSupport } from "@hypit/hypit/endpoint";
import type { HtmlFrameRequest, HtmlRasterRequest } from "@hypit/html-program";
import type { PictureInterpretation } from "@hypit/media";
import type { HtmlRenderer } from "./electron.js";

function sdrSourcePictureRejection(picture: PictureInterpretation, label: string): string | undefined {
  const imageLike = picture.colorPrimaries === "bt709" && picture.colorTransfer === "srgb"
    && picture.colorMatrix === "rgb" && picture.colorRange === "full";
  const videoLike = picture.colorPrimaries === "bt709" && picture.colorTransfer === "bt709"
    && picture.colorMatrix === "bt709" && picture.colorRange === "limited";
  if (picture.bitDepth !== 8 || (!imageLike && !videoLike) || picture.alphaMode === "premultiplied") {
    return `${label} is outside the local HTML Provider's exact 8-bit SDR source support`;
  }
  return undefined;
}

export function isLocalHtmlPq10Source(picture: PictureInterpretation): boolean {
  return picture.colorPrimaries === "bt2020" && picture.colorTransfer === "pq"
    && picture.colorMatrix === "bt2020-ncl" && picture.colorRange === "limited"
    && picture.bitDepth === 10 && picture.alphaMode === "opaque";
}

function isHdrWorking(request: HtmlRasterRequest | HtmlFrameRequest): boolean {
  const picture = request.program.picture;
  return picture.colorPrimaries === "bt709" && picture.colorTransfer === "linear"
    && Number.isFinite(picture.referenceWhiteNits) && picture.referenceWhiteNits > 0
    && picture.alphaMode === "premultiplied";
}

function isSdrWorking(request: HtmlRasterRequest | HtmlFrameRequest): boolean {
  const picture = request.program.picture;
  return picture.colorPrimaries === "bt709" && picture.colorTransfer === "srgb"
    && picture.referenceWhiteNits === 100 && picture.alphaMode === "premultiplied";
}

function programRejection(request: HtmlRasterRequest | HtmlFrameRequest, hdr: boolean): string | undefined {
  if (hdr ? !isHdrWorking(request) : !isSdrWorking(request)) {
    return hdr
      ? "The local HTML HDR10 pipeline requires a linear BT.709 working picture with explicit reference white"
      : "The local HTML SDR pipeline requires the sRGB BT.709 100-nit working picture";
  }
  for (const artifact of request.program.artifacts) {
    if (artifact.picture !== undefined) {
      // Browser image presentation is currently exact only for the SDR source
      // subset. HDR still-image presentation must close its own browser path
      // before it enters this Provider's support set.
      const reason = sdrSourcePictureRejection(artifact.picture, `Picture ${artifact.id}`);
      if (reason !== undefined) return reason;
    }
  }
  for (const source of request.program.videoSources) {
    if (source.kind === "media") {
      const picture = source.source.interpretation.picture;
      const reason = hdr && isLocalHtmlPq10Source(picture)
        ? undefined
        : sdrSourcePictureRejection(picture, `Video source ${source.id}`);
      if (reason !== undefined) return reason;
    }
  }
  for (const surface of request.program.surfaces) {
    const reason = sdrSourcePictureRejection(surface.surface.picture, `Surface ${surface.artifactId}`);
    if (reason !== undefined) return reason;
  }
  return undefined;
}

function isHdr10Delivery(request: HtmlRasterRequest): boolean {
  const picture = request.delivery.picture;
  const encoding = request.delivery.encoding;
  return picture.colorPrimaries === "bt2020" && picture.colorTransfer === "pq"
    && picture.colorMatrix === "bt2020-ncl" && picture.colorRange === "limited"
    && picture.bitDepth === 10 && encoding.codec === "hevc" && encoding.pixelFormat === "yuv420p10le"
    && request.delivery.hdrStaticMetadata !== undefined;
}

export function isLocalHtmlHdr10Request(request: HtmlRasterRequest): boolean {
  return isHdrWorking(request) && isHdr10Delivery(request);
}

/** Exact request subset implemented by the current encoded-visual execution paths. */
export function localHtmlRasterRejection(request: HtmlRasterRequest, renderer: HtmlRenderer): string | undefined {
  const hdr = isHdr10Delivery(request);
  const program = programRejection(request, hdr);
  if (program !== undefined) return program;
  if (hdr) {
    if (request.program.processPasses > 0) {
      return "The local HTML HDR10 pipeline does not yet implement Visual Process input surfaces";
    }
    return renderer === "electron"
      ? undefined
      : "The local HTML HDR10 pipeline requires the explicitly selected Electron renderer";
  }
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
  const program = programRejection(request, false);
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
