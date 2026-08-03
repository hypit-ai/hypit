import { canonicalStringify, verifyBuildState } from "@svml/core";
import type { BuildState } from "@svml/protocol";

export function serializeBuildState(state: BuildState): string {
  verifyBuildState(state);
  return canonicalStringify(state);
}

export function parseBuildState(text: string): BuildState {
  const value = JSON.parse(text) as BuildState;
  verifyBuildState(value);
  return value;
}
