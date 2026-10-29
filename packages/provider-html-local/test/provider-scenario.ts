import { sealComposition, sealPresentVisualTrack } from "@hypit/composition";
import { EndpointRegistry } from "@hypit/executor";
import type { EndpointRegistration } from "@hypit/executor";
import type { ImmediateEndpointHandler } from "@hypit/endpoint";
import { installEndpoint } from "@hypit/endpoint";
import { compileHtmlProgram, htmlProgramCapabilities, htmlRasterRequest, htmlVisualElement } from "@hypit/html-program";
import { mediaTypes, sealVisualDeliverySpec, sealOutputPictureSpec } from "@hypit/media";
import type { FrameOutputPictureSpec, HdrStaticMetadata, VisualDeliverySpec } from "@hypit/media";
import type { CompositableSurfaceRef } from "@hypit/media";
import type { Need } from "@hypit/protocol";
import { sealTimeline } from "@hypit/timeline";
import { exactTemporalValueFromFrames, resolveTemporalRelation, sealLocalTemporalDomain } from "@hypit/temporal";
import { createLocalHtmlProvider } from "../src/index.js";

export function htmlProviderDocument(surface?: CompositableSurfaceRef) {
  const timeline = sealTimeline({ id: "test-space", frameCount: 12, frameRate: { numerator: 12, denominator: 1 } });
  const track = sealPresentVisualTrack({ timelineId: "test-space", id: "provider-fixture",
    presents: [{ id: "card", span: { startFrame: 0, endFrameExclusive: 12 }, root:
      htmlVisualElement({ id: "background", kind: "box", children: [
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
      ] }) }],
  });
  return compileHtmlProgram(sealComposition({ id: "local-html-provider-fixture", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 160, height: 96, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, timeline));
}

export function htmlProviderNestedDocument() {
  const childTimeline = sealTimeline({ id: "child-space", frameCount: 6, frameRate: { numerator: 12, denominator: 1 } });
  const childTrack = sealPresentVisualTrack({ timelineId: childTimeline.id, id: "child-track",
    presents: [{ id: "child-card", span: { startFrame: 0, endFrameExclusive: 6 }, root: htmlVisualElement({
      id: "child-background", kind: "box", children: [], style: [
        { name: "position", value: "absolute" }, { name: "inset", value: 0 }, { name: "background", value: "#d02040" },
      ],
    }) }],
  });
  const child = sealComposition({ id: "child-composition", visual: {
    picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const,
    canvas: { width: 160, height: 96, clearColor: "#00000000" },
    root: { members: [{ kind: "track", id: childTrack.id, track: childTrack }] },
  }, audio: { contributions: [] } }, childTimeline);
  const timeline = sealTimeline({ id: "parent-space", frameCount: 12, frameRate: { numerator: 12, denominator: 1 } });
  const sampling = resolveTemporalRelation({
    target: sealLocalTemporalDomain({ id: "child-occurrence", duration: exactTemporalValueFromFrames(12, timeline) }),
    source: sealLocalTemporalDomain({ id: "child-timeline", duration: exactTemporalValueFromFrames(6, childTimeline) }),
    clock: timeline,
  });
  const track = sealPresentVisualTrack({ timelineId: timeline.id, id: "parent-track",
    presents: [{ id: "child-use", span: { startFrame: 0, endFrameExclusive: 12 }, root: {
      id: "nested", kind: "composition", composition: child, sampling,
    } }],
  });
  return compileHtmlProgram(sealComposition({ id: "nested-provider-fixture", visual: {
    picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const,
    canvas: { width: 160, height: 96, clearColor: "#000000" },
    root: { members: [{ kind: "track", id: track.id, track }] },
  }, audio: { contributions: [] } }, timeline));
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

export function htmlProviderHdr10Delivery(
  quality: VisualDeliverySpec["encoding"]["quality"] = "standard",
): VisualDeliverySpec {
  return sealVisualDeliverySpec({
    picture: { colorPrimaries: "bt2020", colorTransfer: "pq", colorMatrix: "bt2020-ncl",
      colorRange: "limited", bitDepth: 10, alpha: { mode: "opaque", matte: "#000000" } },
    encoding: { codec: "hevc", pixelFormat: "yuv420p10le", quality },
    hdrStaticMetadata: htmlProviderHdrStaticMetadata(),
  });
}

export function htmlProviderHdrStaticMetadata(): HdrStaticMetadata {
  return {
    masteringDisplay: {
      red: { x: 0.708, y: 0.292 }, green: { x: 0.17, y: 0.797 }, blue: { x: 0.131, y: 0.046 },
      whitePoint: { x: 0.3127, y: 0.329 }, minLuminanceNits: 0.005, maxLuminanceNits: 1_000,
    },
    contentLight: { maxContentLightLevelNits: 1_000, maxFrameAverageLightLevelNits: 400 },
  };
}

export function htmlProviderHdrDocument() {
  return { ...htmlProviderDocument(), picture: {
    colorPrimaries: "bt709", colorTransfer: "linear", referenceWhiteNits: 203,
    alphaMode: "premultiplied",
  } as const };
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
