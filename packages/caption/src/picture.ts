import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { htmlVisual } from "@hypit/html-program";

import { scheduleCaptionPresentation } from "./source.js";
import type {
  CaptionComponentSpec,
  CaptionDocument,
  CaptionPresentation,
  CaptionStyle,
  LocalCaptionTiming,
} from "./types.js";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

export function captionHtmlSource(
  spec: CaptionComponentSpec,
  document: CaptionDocument,
  timing: LocalCaptionTiming,
  presentation: CaptionPresentation | CaptionStyle,
) {
  const schedule = scheduleCaptionPresentation(spec, document, timing, presentation);
  const words = new Map(document.words.map((word) => [word.id, word]));
  const units = new Map(document.units.map((unit) => [unit.id, unit]));
  const styleById = new Map(schedule.styles.map((style) => [style.id, style]));
  const selectedCues = schedule.cues.map((cue) => {
    const text = cue.unitIds.flatMap((unitId) => units.get(unitId)!.wordIds)
      .map((wordId, index) => {
        const word = words.get(wordId)!;
        return `${index === 0 ? "" : word.separatorBefore}${word.text}`;
      }).join("");
    const style = cue.presentation.kind === "style" ? styleById.get(cue.presentation.styleId) : undefined;
    return {
      id: cue.cueId,
      text,
      regions: cue.regions,
      presentation: cue.presentation,
      overrideId: cue.overrideId ?? null,
      style: style === undefined ? null : structuredClone(style),
    };
  });
  const data = { cues: selectedCues, frameRate: null };
  const html = `<div data-caption-root>${selectedCues.map((cue) =>
    `<div data-caption-cue="${escapeHtml(cue.id)}" data-caption-presentation="${escapeHtml(
      cue.presentation.kind === "hidden" ? "hidden" : cue.presentation.styleId,
    )}">${escapeHtml(cue.text)}</div>`).join("")}</div>`;
  return visualProgramHtmlSource(spec.id, "picture", htmlVisual({
    data,
    html,
    css: ":scope>[data-caption-root]{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:0 8% 7%;font:600 54px/1.25 system-ui,sans-serif;color:white;text-align:center;text-shadow:0 2px 5px #000,0 0 2px #000}:scope [data-caption-cue]{display:none;background:#0009;padding:.18em .4em;border-radius:.15em}",
    setup: `
      const cueElements = new Map([...root.querySelectorAll('[data-caption-cue]')]
        .map(element => [element.getAttribute('data-caption-cue'), element]));
      const fps = context.frameRate.numerator / context.frameRate.denominator;
      const seconds = point => Number(point.position.ticks) * point.position.timeBase.numerator
        / point.position.timeBase.denominator;
      const active = (region, frame) => frame >= seconds(region.start) * fps
        && frame < seconds(region.end) * fps;
      return localFrame => {
        for (const cue of data.cues) {
          const visible = cue.presentation.kind !== 'hidden'
            && cue.regions.some(region => active(region, localFrame));
          const element = cueElements.get(cue.id);
          element.style.display = visible ? '' : 'none';
          if (visible && cue.style && typeof cue.style.parameters === 'object' && cue.style.parameters !== null) {
            const parameters = cue.style.parameters;
            if (typeof parameters.color === 'string') element.style.color = parameters.color;
            if (typeof parameters.background === 'string') element.style.background = parameters.background;
            if (typeof parameters.fontSizePx === 'number') element.style.fontSize = parameters.fontSizePx + 'px';
          }
        }
      };
    `,
  }));
}
