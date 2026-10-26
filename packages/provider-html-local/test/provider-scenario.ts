import { sealComposition, sealPresentVisualTrack } from "@hypit/composition";
import { EndpointRegistry } from "@hypit/executor";
import type { EndpointRegistration } from "@hypit/executor";
import type { ImmediateEndpointHandler } from "@hypit/endpoint";
import { installEndpoint } from "@hypit/endpoint";
import { compileHtmlProgram, htmlProgramCapabilities, htmlRasterRequest } from "@hypit/html-program";
import { mediaTypes, sealVisualDeliverySpec, sealVisualPictureSpec } from "@hypit/media";
import type { ImagePictureSpec, VisualDeliverySpec } from "@hypit/media";
import type { CompositableSurfaceRef } from "@hypit/media";
import type { Need } from "@hypit/protocol";
import { sealTimeline } from "@hypit/timeline";
import { createLocalHtmlProvider } from "../src/index.js";

export function htmlProviderDocument(surface?: CompositableSurfaceRef) {
  const timeline = sealTimeline({ id: "test-space", frameCount: 12, frameRate: { numerator: 12, denominator: 1 } });
  const track = sealPresentVisualTrack({ timelineId: "test-space", visualIr: "hypit.visual-ir@1", id: "provider-fixture",
    presents: [{ id: "card", span: { startFrame: 0, endFrameExclusive: 12 }, root:
      { id: "background", kind: "box", children: [
        ...(surface === undefined ? [] : [{
          id: "surface", kind: "surface" as const, surface,
          style: [
            { name: "position" as const, value: "absolute" }, { name: "left" as const, value: "0px" },
            { name: "top" as const, value: "0px" }, { name: "width" as const, value: "1px" },
            { name: "height" as const, value: "1px" },
          ],
        }]),
      ], style: [
        { name: "position", value: "absolute" }, { name: "inset", value: 0 }, { name: "background", value: "#261447" },
      ] } }],
  });
  return compileHtmlProgram(sealComposition({
    id: "local-html-provider-fixture",
    canvas: { width: 160, height: 96, clearColor: "#000000" },
    visual: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) }, audio: [],
  }), timeline);
}

export function htmlProviderDelivery(
  quality: VisualDeliverySpec["encoding"]["quality"] = "standard",
): VisualDeliverySpec {
  return sealVisualDeliverySpec({
    picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alpha: { mode: "opaque", matte: "#000000" } },
    encoding: { codec: "h264", pixelFormat: "yuv420p", quality },
  });
}

export function htmlProviderPicture(): ImagePictureSpec {
  return sealVisualPictureSpec({
    colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
    colorRange: "full", bitDepth: 8, alpha: { mode: "opaque", matte: "#000000" },
  });
}

export function htmlProviderNeed(document = htmlProviderDocument()): Need {
  return {
    id: "need:local-html-fixture",
    capability: htmlProgramCapabilities.rasterizeVisual,
    returns: mediaTypes.timelineVisual,
    constraints: htmlRasterRequest(document, htmlProviderDelivery()),
    result: "record:local-html-fixture",
  };
}

export async function htmlProviderHandler(request: Need): Promise<{
  readonly handler: ImmediateEndpointHandler;
  readonly registration: EndpointRegistration;
}> {
  const registry = new EndpointRegistry();
  await installEndpoint(createLocalHtmlProvider({
    workers: 2,
    defaultConcurrency: 1,
    processTimeoutMs: 120_000,
    ...(process.env.HYPIT_TEST_CHROME_PATH === undefined
      ? {} : { chromePath: process.env.HYPIT_TEST_CHROME_PATH }),
  }), registry);
  const resolution = registry.select(request);
  if (resolution.status !== "resolved" || resolution.registration.kind !== "immediate") {
    throw new Error("HTML Provider scenario did not resolve an immediate Endpoint");
  }
  return { handler: resolution.registration.handler, registration: resolution.registration };
}
