import type { StudioAdapterContext, StudioTemporalLineage } from "@hypit/studio-adapter";
import { temporalLineageFor } from "@hypit/studio-adapter";

/** Resolve a domain item's Window from the executed edge that consumed it. */
export function itemTemporalLineage(
  context: StudioAdapterContext,
  runtimeId: string,
  input = "window",
): StudioTemporalLineage | undefined {
  return temporalLineageFor(context, runtimeId, input);
}
