import { canonicalStringify, verifyBuildState } from "@narratage/core";
import type { BuildState } from "@narratage/protocol";

export function serializeBuildState(state: BuildState): string {
  // Outstanding commands are derived scheduling output, not trusted durable state.
  // A resumed Core deterministically regenerates them from completed facts.
  return canonicalStringify({ ...state, outstanding: [] });
}

export function parseBuildState(text: string): BuildState {
  const parsed = JSON.parse(text) as BuildState;
  const value = { ...parsed, outstanding: [] };
  verifyBuildState(value);
  return value;
}
