import { EndpointRegistry } from "@hypit/endpoint";
import type { EndpointRegistration } from "@hypit/endpoint";
import type { ImmediateEndpointHandler } from "@hypit/endpoint";
import { installEndpoint } from "@hypit/endpoint";
import {
  compileHtmlPictureProgram,
  htmlProgramCapabilities,
  htmlRasterRequest,
} from "@hypit/html-program";
import { mediaTypes, sealOutputPictureSpec, sealVisualDeliverySpec } from "@hypit/media";
import type { FrameOutputPictureSpec, VisualDeliverySpec } from "@hypit/media";
import type { Need } from "@hypit/generation-build";

import { createLocalChromiumHtmlProvider } from "../src/index.js";

export function htmlProviderDocument() {
  return compileHtmlPictureProgram({
    id: "local-html-provider-fixture",
    frameRate: { numerator: 12, denominator: 1 },
    frameCount: 12,
    canvas: { width: 160, height: 96, clearColor: "#000000" },
    root: {
      id: "background",
      kind: "box" as const,
      spans: [{ startFrame: 0, endFrameExclusive: 12 }],
      style: [
        { name: "position", value: "absolute" },
        { name: "inset", value: 0 },
        { name: "background", value: "#261447" },
      ],
      children: [],
    },
  });
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

export function htmlProviderPicture(): FrameOutputPictureSpec {
  return sealOutputPictureSpec({
    colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
    colorRange: "full", bitDepth: 8, alpha: { mode: "opaque", matte: "#000000" },
  });
}

export function htmlProviderNeed(document = htmlProviderDocument()): Need {
  return {
    id: "need:local-html-fixture",
    capability: htmlProgramCapabilities.rasterizeVisual,
    returns: mediaTypes.renderedVisual,
    constraints: htmlRasterRequest(document, htmlProviderDelivery()),
    result: "record:local-html-fixture",
  };
}

export async function htmlProviderHandler(request: Need): Promise<{
  readonly handler: ImmediateEndpointHandler;
  readonly registration: EndpointRegistration;
}> {
  const registry = new EndpointRegistry();
  await installEndpoint(createLocalChromiumHtmlProvider({
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
