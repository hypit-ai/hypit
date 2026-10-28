import type { StudioSnapshot, StudioTerminalTarget } from "../shared.js";
import { studioItemAddressKey } from "../shared.js";

type AdjustmentTarget = Extract<StudioTerminalTarget, { readonly kind: "visual-adjustment" }>;

export type HtmlPreviewWindow = Window & {
  __hypitSetAdjustmentBypassed?: (
    occurrencePath: readonly string[],
    adjustmentId: string,
    bypassed: boolean,
  ) => boolean;
};

function key(target: AdjustmentTarget): string {
  return JSON.stringify([target.occurrencePath, target.adjustmentId]);
}

/** Studio's renderer-specific edge. Session state itself remains item-based. */
export function createHtmlPreviewAdapter() {
  let targetWindow: HtmlPreviewWindow | undefined;
  let applied = new Map<string, AdjustmentTarget>();

  const set = (target: AdjustmentTarget, bypassed: boolean): void => {
    targetWindow?.__hypitSetAdjustmentBypassed?.(target.occurrencePath, target.adjustmentId, bypassed);
  };

  const apply = (snapshot: StudioSnapshot, omittedItemKeys: ReadonlySet<string>): void => {
    const desired = new Map<string, AdjustmentTarget>();
    for (const item of snapshot.tracks.flatMap((track) => track.items)) {
      if (!omittedItemKeys.has(studioItemAddressKey(item.address))) continue;
      for (const target of item.terminalTargets) {
        if (target.kind === "visual-adjustment") desired.set(key(target), target);
      }
    }
    for (const [id, target] of applied) if (!desired.has(id)) set(target, false);
    for (const [id, target] of desired) if (!applied.has(id)) set(target, true);
    applied = desired;
  };

  return {
    mount(window: HtmlPreviewWindow): void {
      targetWindow = window;
      applied = new Map();
    },
    unmount(): void {
      targetWindow = undefined;
      applied = new Map();
    },
    apply,
  };
}
