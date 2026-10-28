import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/hypit/protocol";
import type { VisualProgramElement } from "@hypit/composition";

export const HTML_VISUAL_FORMAT = "hypit.html-visual@1" as const;

export type HtmlVisual = {
  /** HTML fragment. {{child-id}} inserts an owned VisualElement, including frame-sampled video. */
  readonly html: string;
  /** CSS in an @scope rooted at this program's element. */
  readonly css?: string;
  /** Function body with (root, data, context) arguments; returns a synchronous render(localFrame) function. */
  readonly setup?: string;
  readonly data?: CanonicalValue;
};

export function htmlVisual(value: HtmlVisual, artifacts: readonly BlobRef[] = []): VisualProgramElement["program"] {
  return { format: HTML_VISUAL_FORMAT, payload: canonicalize(value) as VisualProgramElement["program"]["payload"], artifacts: [...artifacts] };
}

export function readHtmlVisual(program: VisualProgramElement["program"]): HtmlVisual {
  if (program.format !== HTML_VISUAL_FORMAT) {
    throw new Error(`HTML renderer does not support visual program format ${program.format}.`);
  }
  const value = program.payload as unknown as HtmlVisual;
  if (value === null || typeof value !== "object" || typeof value.html !== "string"
    || (value.css !== undefined && typeof value.css !== "string")
    || (value.setup !== undefined && typeof value.setup !== "string")) {
    throw new Error("HTML visual requires HTML and optional CSS and setup source.");
  }
  return value;
}

export function htmlVisualHtml(program: HtmlVisual, children: ReadonlyMap<string, string>): string {
  const used = new Set<string>();
  const result = program.html.replace(/\{\{([^{}]+)\}\}/gu, (_match, name: string) => {
    const child = children.get(name);
    if (child === undefined || used.has(name)) throw new Error(`HTML visual slot ${name} is missing or repeated.`);
    used.add(name);
    return child;
  });
  for (const name of children.keys()) {
    if (!used.has(name)) throw new Error(`HTML visual does not place owned child ${name}.`);
  }
  return result;
}

/** JSON is embedded as data, so author text cannot close the surrounding script element. */
const scriptJson = (value: unknown): string => JSON.stringify(value).replaceAll("<", "\\u003c");

export function htmlVisualScript(entries: readonly {
  readonly id: string;
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly program: HtmlVisual;
}[]): string {
  return `(() => {
    const fail = error => { window.__hypitHtmlVisualError = String(error?.stack || error); };
    const entries = ${scriptJson(entries)}.filter(entry =>
      htmlSelectionOverlaps(entry.startFrame, entry.startFrame + entry.durationFrames));
    const renders = entries.map((entry, order) => {
      const root = document.getElementById(entry.id);
      try {
        const render = entry.program.setup === undefined ? () => {} :
          new Function('root', 'data', 'context', entry.program.setup)(root, entry.program.data, {
            durationFrames: entry.durationFrames,
          });
        if (typeof render !== 'function') throw new Error('HTML visual setup must return render(localFrame).');
        return { ...entry, order, render, region: undefined };
      } catch (error) { fail(error); return { ...entry, order, render: () => {}, region: undefined }; }
    });
    const workIndex = htmlCreateFrameWorkIndex(renders.map(entry => ({
      startFrame: entry.startFrame,
      endFrameExclusive: entry.startFrame + entry.durationFrames,
      order: entry.order,
      payload: entry,
    })));
    let previousFrame;
    const renderAt = (entry, frame) => {
      const local = frame - entry.startFrame;
      const region = local < 0 ? 'before' : local >= entry.durationFrames ? 'after' : 'active';
      // Preserve initial and crossed boundary poses. Active seeks always redraw,
      // including repeated frames after an asynchronously prepared image became ready.
      if (region !== 'active' && entry.region === region) return;
      try {
        const result = entry.render(Math.max(0, Math.min(entry.durationFrames, local)));
        if (result != null && typeof result.then === 'function') {
          // Observe a later rejection, but never let asynchronous drawing race frame capture.
          Promise.resolve(result).catch(fail);
          throw new Error('HTML visual render(localFrame) must be synchronous; prepare asynchronous resources before rendering.');
        }
        entry.region = region;
      }
      catch (error) { fail(error); }
    };
    const apply = frame => {
      if (previousFrame === undefined) {
        // Establish every compiler-owned root's boundary pose once. Later work
        // is limited to active programs and spans crossed by an arbitrary seek.
        for (const entry of renders) renderAt(entry, frame);
      } else {
        const work = new Map();
        for (const item of workIndex.at(frame)) work.set(item.serial, item);
        if (frame !== previousFrame) {
          const startFrame = Math.min(previousFrame, frame);
          const endFrameExclusive = Math.max(previousFrame, frame) + 1;
          for (const item of workIndex.overlapping({ startFrame, endFrameExclusive })) work.set(item.serial, item);
        }
        for (const item of [...work.values()].sort((left, right) => left.order - right.order || left.serial - right.serial)) {
          renderAt(item.payload, frame);
        }
      }
      previousFrame = frame;
    };
    apply(0);
    window.addEventListener('hypit-frame', event => apply(event.detail?.frame));
  })();`;
}
