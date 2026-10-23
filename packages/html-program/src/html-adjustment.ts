import { canonicalize } from "@hypit/hypit/protocol";
import type { VisualAdjustment } from "@hypit/composition";

export const HTML_ADJUSTMENT_FORMAT = "hypit.html-adjustment@1" as const;

/** One renderer-owned transformation of the already accumulated picture. */
export type HtmlAdjustment = {
  readonly filter: string;
  readonly opacity?: number;
  readonly transform?: string;
  readonly transformOrigin?: string;
};

export function htmlAdjustment(value: HtmlAdjustment): VisualAdjustment["program"] {
  return {
    format: HTML_ADJUSTMENT_FORMAT,
    payload: canonicalize(value) as VisualAdjustment["program"]["payload"],
    artifacts: [],
  };
}

export function readHtmlAdjustment(program: VisualAdjustment["program"]): HtmlAdjustment {
  if (program.format !== HTML_ADJUSTMENT_FORMAT) {
    throw new Error(`HTML renderer does not support Visual Adjustment format ${program.format}.`);
  }
  const value = program.payload as unknown as Partial<HtmlAdjustment> | null;
  if (value === null || typeof value !== "object" || typeof value.filter !== "string"
    || value.filter.trim().length === 0
    || (value.opacity !== undefined && (!Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 1))
    || (value.transform !== undefined && (typeof value.transform !== "string" || value.transform.trim().length === 0))
    || (value.transformOrigin !== undefined && (typeof value.transformOrigin !== "string" || value.transformOrigin.trim().length === 0))
    || Object.keys(value).some((key) => !["filter", "opacity", "transform", "transformOrigin"].includes(key))) {
    throw new Error("HTML Adjustment has invalid filter, opacity or transform values.");
  }
  if (/url\s*\(/iu.test(value.filter)) {
    throw new Error("HTML Adjustment filter does not accept URL resources.");
  }
  if (program.artifacts.length !== 0) {
    throw new Error("HTML Adjustment filter does not accept Artifact dependencies.");
  }
  return {
    filter: value.filter,
    ...(value.opacity === undefined ? {} : { opacity: value.opacity }),
    ...(value.transform === undefined ? {} : { transform: value.transform }),
    ...(value.transformOrigin === undefined ? {} : { transformOrigin: value.transformOrigin }),
  };
}

const scriptJson = (value: unknown): string => JSON.stringify(value).replaceAll("<", "\\u003c");

/** Apply each Adjustment from the absolute requested frame; prior seek order is not an input. */
export function htmlAdjustmentScript(entries: readonly {
  readonly id: string;
  readonly occurrencePath: readonly string[];
  readonly adjustmentId: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly visibility?: readonly { readonly startFrame: number; readonly endFrameExclusive: number }[];
  readonly filter: string;
  readonly opacity?: number;
  readonly transform?: string;
  readonly transformOrigin?: string;
}[]): string {
  return `(() => {
    const entries = ${scriptJson(entries)}.map((entry, order) => ({
      ...entry,
      order,
      element: document.getElementById(entry.id),
      spans: entry.visibility ?? [{ startFrame: entry.startFrame, endFrameExclusive: entry.endFrameExclusive }],
    }));
    const workIndex = htmlCreateFrameWorkIndex(entries.flatMap(entry => entry.spans
      .filter(span => htmlSelectionOverlaps(span.startFrame, span.endFrameExclusive))
      .map(span => ({ ...span, order: entry.order, payload: entry }))));
    let active = new Set();
    const bypassed = new Set();
    const key = (occurrencePath, adjustmentId) => JSON.stringify([occurrencePath, adjustmentId]);
    const set = (entry, active) => {
      const applied = active && !bypassed.has(key(entry.occurrencePath, entry.adjustmentId));
      entry.element.style.filter = applied ? entry.filter : 'none';
      entry.element.style.opacity = applied ? String(entry.opacity ?? 1) : '1';
      entry.element.style.transform = applied ? (entry.transform ?? 'none') : 'none';
      entry.element.style.transformOrigin = applied ? (entry.transformOrigin ?? '50% 50%') : '50% 50%';
    };
    for (const entry of entries) set(entry, false);
    const apply = frame => {
      const next = new Set(workIndex.at(frame).map(work => work.payload));
      for (const entry of active) if (!next.has(entry)) set(entry, false);
      for (const entry of next) set(entry, true);
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
        for (const entry of matches) set(entry, active.has(entry));
        return true;
      },
    });
    apply(0);
    window.addEventListener('hypit-frame', event => apply(event.detail?.frame));
  })();`;
}
