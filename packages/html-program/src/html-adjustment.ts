import { canonicalize } from "@hypit/hypit/protocol";
import type { VisualAdjustment } from "@hypit/composition";
import type { FrameSpan } from "@hypit/timeline";

export const HTML_ADJUSTMENT_FORMAT = "hypit.html-adjustment@1" as const;

export type HtmlAdjustmentKeyframe = {
  /** Normalized position on the owning Adjustment occurrence. */
  readonly at: number;
  readonly filter: string;
  readonly opacity: number;
  readonly transform: string;
  readonly transformOrigin: string;
  /** Shapes the interval leaving this keyframe. */
  readonly easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
};

/** One renderer-owned transformation of the already accumulated picture. */
export type HtmlAdjustment = {
  /** One state is static; two or more states interpolate on occurrence-local progress. */
  readonly keyframes: readonly HtmlAdjustmentKeyframe[];
};

export function htmlAdjustment(value: HtmlAdjustment): VisualAdjustment["program"] {
  const program: VisualAdjustment["program"] = {
    format: HTML_ADJUSTMENT_FORMAT,
    payload: canonicalize(value) as VisualAdjustment["program"]["payload"],
    artifacts: [],
  };
  readHtmlAdjustment(program);
  return program;
}

export function readHtmlAdjustment(program: VisualAdjustment["program"]): HtmlAdjustment {
  if (program.format !== HTML_ADJUSTMENT_FORMAT) {
    throw new Error(`HTML renderer does not support Visual Adjustment format ${program.format}.`);
  }
  const value = program.payload as unknown as Partial<HtmlAdjustment> | null;
  if (value === null || typeof value !== "object" || !Array.isArray(value.keyframes)
    || value.keyframes.length === 0 || Object.keys(value).some((key) => key !== "keyframes")) {
    throw new Error("HTML Adjustment requires keyframes.");
  }
  let previous = -1;
  for (const [index, keyframe] of value.keyframes.entries()) {
    const label = `HTML Adjustment keyframe ${index}`;
    if (keyframe === null || typeof keyframe !== "object" || Array.isArray(keyframe)
      || !Number.isFinite(keyframe.at) || keyframe.at < 0 || keyframe.at > 1 || keyframe.at <= previous
      || typeof keyframe.filter !== "string" || keyframe.filter.trim().length === 0
      || !Number.isFinite(keyframe.opacity) || keyframe.opacity < 0 || keyframe.opacity > 1
      || typeof keyframe.transform !== "string" || keyframe.transform.trim().length === 0
      || typeof keyframe.transformOrigin !== "string" || keyframe.transformOrigin.trim().length === 0
      || (keyframe.easing !== undefined && !["linear", "ease-in", "ease-out", "ease-in-out"].includes(keyframe.easing))
      || Object.keys(keyframe).some((key) => !["at", "filter", "opacity", "transform", "transformOrigin", "easing"].includes(key))) {
      throw new Error(`${label} has invalid state.`);
    }
    if (/url\s*\(/iu.test(keyframe.filter)) throw new Error(`${label} filter does not accept URL resources.`);
    previous = keyframe.at;
  }
  if (value.keyframes.length > 1
    && (value.keyframes[0]!.at !== 0 || value.keyframes.at(-1)!.at !== 1)) {
    throw new Error("Animated HTML Adjustment keyframes must include progress 0 and 1.");
  }
  if (program.artifacts.length !== 0) {
    throw new Error("HTML Adjustment filter does not accept Artifact dependencies.");
  }
  return { keyframes: value.keyframes.map((keyframe) => ({ ...keyframe })) };
}

const scriptJson = (value: unknown): string => JSON.stringify(value).replaceAll("<", "\\u003c");

/** Apply each Adjustment from the absolute requested frame; prior seek order is not an input. */
export function htmlAdjustmentScript(entries: readonly (FrameSpan & {
  readonly id: string;
  readonly occurrencePath: readonly string[];
  readonly adjustmentId: string;
  readonly visibility?: readonly FrameSpan[];
  readonly clock?: FrameSpan;
  readonly keyframes: readonly HtmlAdjustmentKeyframe[];
})[]): string {
  return `(() => {
    const entries = ${scriptJson(entries)}.map((entry, order) => {
      const element = document.getElementById(entry.id);
      const keyframes = entry.keyframes.map(keyframe => ({
        offset: keyframe.at,
        filter: keyframe.filter,
        opacity: String(keyframe.opacity),
        transform: keyframe.transform,
        transformOrigin: keyframe.transformOrigin,
        easing: keyframe.easing ?? 'linear',
      }));
      return {
        ...entry,
        order,
        element,
        probe: keyframes.length === 1 ? undefined
          : new Animation(new KeyframeEffect(element, keyframes, { duration: 1000, fill: 'both' }), document.timeline),
        spans: entry.visibility ?? [{ startFrame: entry.startFrame, endFrameExclusive: entry.endFrameExclusive }],
      };
    });
    const workIndex = htmlCreateFrameWorkIndex(entries.flatMap(entry => entry.spans
      .filter(span => htmlSelectionOverlaps(span.startFrame, span.endFrameExclusive))
      .map(span => ({ ...span, order: entry.order, payload: entry }))));
    let active = new Set();
    let currentFrame = 0;
    const bypassed = new Set();
    const key = (occurrencePath, adjustmentId) => JSON.stringify([occurrencePath, adjustmentId]);
    const identity = entry => {
      entry.element.style.filter = 'none';
      entry.element.style.opacity = '1';
      entry.element.style.transform = 'none';
      entry.element.style.transformOrigin = '50% 50%';
    };
    const set = (entry, active, frame) => {
      const applied = active && !bypassed.has(key(entry.occurrencePath, entry.adjustmentId));
      if (!applied) { identity(entry); return; }
      if (entry.keyframes.length === 1) {
        const state = entry.keyframes[0];
        entry.element.style.filter = state.filter;
        entry.element.style.opacity = String(state.opacity);
        entry.element.style.transform = state.transform;
        entry.element.style.transformOrigin = state.transformOrigin;
        return;
      }
      const origin = entry.clock ?? entry;
      const length = origin.endFrameExclusive - origin.startFrame;
      const progress = length <= 1 ? 1 : Math.max(0, Math.min(1, (frame - origin.startFrame) / (length - 1)));
      entry.probe.cancel();
      entry.probe.pause();
      entry.probe.currentTime = progress * 1000;
      const style = getComputedStyle(entry.element);
      const state = [style.filter, style.opacity, style.transform, style.transformOrigin];
      entry.probe.cancel();
      [entry.element.style.filter, entry.element.style.opacity, entry.element.style.transform, entry.element.style.transformOrigin] = state;
    };
    for (const entry of entries) identity(entry);
    const apply = frame => {
      currentFrame = frame;
      const next = new Set(workIndex.at(frame).map(work => work.payload));
      for (const entry of active) if (!next.has(entry)) set(entry, false, frame);
      for (const entry of next) set(entry, true, frame);
      active = next;
    };
    Object.defineProperty(window, '__hypitSetAdjustmentBypassed', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: (occurrencePath, adjustmentId, bypassedNow) => {
        const identity = key(occurrencePath, adjustmentId);
        const matches = entries.filter(entry => key(entry.occurrencePath, entry.adjustmentId) === identity);
        if (matches.length === 0) return false;
        if (bypassedNow) bypassed.add(identity); else bypassed.delete(identity);
        for (const entry of matches) set(entry, active.has(entry), currentFrame);
        return true;
      },
    });
    apply(0);
    window.addEventListener('hypit-frame', event => apply(event.detail?.frame));
  })();`;
}
