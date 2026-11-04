import { canonicalize } from "@hypit/hypit/protocol";
import { htmlVisual } from "@hypit/html-program";
import type { HtmlVisualProgram } from "@hypit/html-program";
import { assertLocalTemporalDomain, type LocalTemporalDomain } from "@hypit/temporal/algebra";

export const VISUAL_TREATMENT_HTML_FORMAT = "hypit.visual-treatment.html@1" as const;

export type VisualTreatmentHtmlKeyframe = {
  /** Normalized position on the owning treatment occurrence. */
  readonly at: number;
  readonly filter: string;
  readonly opacity: number;
  readonly transform: string;
  readonly transformOrigin: string;
  /** Shapes the interval leaving this keyframe. */
  readonly easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
};

/** One renderer-owned transformation of the already accumulated picture. */
export type VisualTreatmentHtml = {
  /** One state is static; two or more states interpolate on occurrence-local progress. */
  readonly keyframes: readonly VisualTreatmentHtmlKeyframe[];
};

export function visualTreatmentHtml(value: VisualTreatmentHtml): HtmlVisualProgram {
  const program: HtmlVisualProgram = {
    format: VISUAL_TREATMENT_HTML_FORMAT,
    payload: canonicalize(value) as HtmlVisualProgram["payload"],
    artifacts: [],
  };
  readVisualTreatmentHtml(program);
  return program;
}

export function readVisualTreatmentHtml(program: HtmlVisualProgram): VisualTreatmentHtml {
  if (program.format !== VISUAL_TREATMENT_HTML_FORMAT) {
    throw new Error(`Visual Treatment does not support HTML programme format ${program.format}.`);
  }
  const value = program.payload as unknown as Partial<VisualTreatmentHtml> | null;
  if (value === null || typeof value !== "object" || !Array.isArray(value.keyframes)
    || value.keyframes.length === 0 || Object.keys(value).some((key) => key !== "keyframes")) {
    throw new Error("Visual Treatment HTML requires keyframes.");
  }
  let previous = -1;
  for (const [index, keyframe] of value.keyframes.entries()) {
    const label = `Visual Treatment HTML keyframe ${index}`;
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
    throw new Error("Animated Visual Treatment HTML keyframes must include progress 0 and 1.");
  }
  if (program.artifacts.length !== 0) {
    throw new Error("Visual Treatment HTML filter does not accept Artifact dependencies.");
  }
  return { keyframes: value.keyframes.map((keyframe) => ({ ...keyframe })) };
}

/** Close one treatment payload over a named Picture slot as an opaque Picture Operator programme. */
export function visualTreatmentHtmlProgram(
  program: HtmlVisualProgram,
  domain: LocalTemporalDomain,
  slot = "picture",
): HtmlVisualProgram {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(slot)) throw new Error(`Visual Treatment HTML slot ${slot} is invalid.`);
  assertLocalTemporalDomain(domain);
  const treatment = readVisualTreatmentHtml(program);
  return htmlVisual({
    html: `<div data-hypit-visual-treatment-layer>{{${slot}}}</div>`,
    css: `:scope { position: absolute; inset: 0; overflow: hidden; }
:scope > [data-hypit-visual-treatment-layer] { position: absolute; inset: 0; transform-origin: center; }`,
    data: canonicalize({ ...treatment, progressDomain: domain }),
    setup: `const layer = root.querySelector('[data-hypit-visual-treatment-layer]');
if (layer === null) throw new Error('Visual Treatment HTML requires its Picture layer.');
const keyframes = data.keyframes.map(keyframe => ({
  offset: keyframe.at,
  filter: keyframe.filter,
  opacity: String(keyframe.opacity),
  transform: keyframe.transform,
  transformOrigin: keyframe.transformOrigin,
  easing: keyframe.easing ?? 'linear',
}));
const probe = keyframes.length === 1 ? undefined
  : new Animation(new KeyframeEffect(layer, keyframes, { duration: 1000, fill: 'both' }), document.timeline);
return localFrame => {
  if (keyframes.length === 1) {
    const state = keyframes[0];
    layer.style.filter = state.filter;
    layer.style.opacity = state.opacity;
    layer.style.transform = state.transform;
    layer.style.transformOrigin = state.transformOrigin;
    return;
  }
  const position = context.controlPosition('progress', localFrame);
  const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
  const progress = position === undefined ? 0
    : Math.max(0, Math.min(1, seconds(position) / seconds(data.progressDomain.duration)));
  probe.cancel();
  probe.pause();
  probe.currentTime = progress * 1000;
  const style = getComputedStyle(layer);
  const state = [style.filter, style.opacity, style.transform, style.transformOrigin];
  probe.cancel();
  [layer.style.filter, layer.style.opacity, layer.style.transform, layer.style.transformOrigin] = state;
};`,
  });
}
