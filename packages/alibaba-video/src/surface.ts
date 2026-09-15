/**
 * Alibaba Video Generation Surface Decoders
 * Decodes markup surfaces into generation requests and port configurations
 */

import type { Surface } from "@hypit/markup";
import { createAlibabaVideoGenerationFragment } from "./fragment.js";
import type { AlibabaVideoPortMap } from "./index.js";

/**
 * Decodes Alibaba TextVideo surface markup into a generation fragment
 */
export function decodeAlibabaVideoTextVideoSurface(
  surface: Surface
): ReturnType<typeof createAlibabaVideoGenerationFragment> {
  const ports: AlibabaVideoPortMap = {
    prompt: surface.getAttribute("prompt") as any,
    duration: surface.getAttribute("duration") as any,
    resolution: surface.getAttribute("resolution") as any,
    aspectRatio: surface.getAttribute("aspect-ratio") as any,
  };

  return createAlibabaVideoGenerationFragment(ports);
}

/**
 * Decodes Alibaba ReferenceVideo surface markup into a generation fragment
 */
export function decodeAlibabaVideoReferenceVideoSurface(
  surface: Surface
): ReturnType<typeof createAlibabaVideoGenerationFragment> {
  const ports: AlibabaVideoPortMap = {
    prompt: surface.getAttribute("prompt") as any,
    duration: surface.getAttribute("duration") as any,
    resolution: surface.getAttribute("resolution") as any,
    aspectRatio: surface.getAttribute("aspect-ratio") as any,
    referenceImage: surface.getAttribute("reference-image") as any,
  };

  return createAlibabaVideoGenerationFragment(ports);
}
