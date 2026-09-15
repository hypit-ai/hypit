/**
 * Alibaba Video Generation Fragment Builders
 * Provides functions to create generation fragments for video generation requests
 */

import type { AssembledGenerationFragment, GenerationFragment } from "@hypit/elaborator";
import {
  createAssembledGenerationFragment,
  createGenerationFragment,
} from "@hypit/elaborator";
import {
  alibabaVideoEndpoints,
  sealAlibabaVideoRequest,
  type AlibabaVideoPortMap,
} from "./index.js";

/**
 * Creates an assembled generation fragment for Alibaba video generation
 * with resolved media bindings and draft type information
 */
export function createAlibabaVideoAssembledGenerationFragment(
  ports: AlibabaVideoPortMap
): AssembledGenerationFragment {
  const endpoint = alibabaVideoEndpoints.qwenVvg!;
  const request = sealAlibabaVideoRequest("alibaba-qwen-vvg", ports);
  return createAssembledGenerationFragment(endpoint, request);
}

/**
 * Creates a generation fragment for Alibaba video generation
 */
export function createAlibabaVideoGenerationFragment(
  ports: AlibabaVideoPortMap
): GenerationFragment {
  const endpoint = alibabaVideoEndpoints.qwenVvg!;
  const request = sealAlibabaVideoRequest("alibaba-qwen-vvg", ports);
  return createGenerationFragment(endpoint, request);
}
