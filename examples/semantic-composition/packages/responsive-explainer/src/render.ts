import { sealPresentVisualTrack } from "@hypit/composition";
import { htmlVisual, htmlVisualElement } from "@hypit/html-program";
import type { HtmlElement } from "@hypit/html-program";
import { preparedVisualSource, verifyPreparedMedia } from "@hypit/media";
import type { FontArtifactRef, PreparedMedia } from "@hypit/media";
import type { Timeline } from "@hypit/timeline";
import type { SpatialFrame } from "@hypit/spatial";
import { compareExactTemporalValues, composeTemporalMaps, exactTemporalValueFromFrames, sealTemporalMap } from "@hypit/temporal";
import type { TemporalInstant, TemporalWindow } from "@hypit/temporal";

export type ExplainerOptions = { id: string; title: string; transitionFrames: number };

/** One scene owns the moving performance viewport and the diagram it makes room for. */
export function renderExplainer(timeline: Timeline, within: SpatialFrame, window: TemporalWindow,
  reveal: TemporalInstant, media: PreparedMedia, sourceWindow: TemporalWindow,
  fonts: readonly FontArtifactRef[], options: ExplainerOptions) {
  if (window.start.timelineId !== timeline.id || reveal.timelineId !== timeline.id)
    throw new Error("Explainer timing must belong to its Timeline.");
  if (!Number.isSafeInteger(options.transitionFrames) || options.transitionFrames < 1)
    throw new Error("Explainer transitionFrames must be a positive integer.");
  if (sourceWindow.start.timelineId !== timeline.id) throw new Error("Explainer source belongs to another Timeline.");
  verifyPreparedMedia(media);
  if (media.visual === undefined) throw new Error("Explainer media requires a visual source.");
  const visual = media.visual;
  const sourceWindowDuration = exactTemporalValueFromFrames(
    sourceWindow.span.endFrameExclusive - sourceWindow.span.startFrame, timeline);
  if (compareExactTemporalValues(media.domain.duration, sourceWindowDuration) !== 0)
    throw new Error("Explainer media requires an equal-length source Window.");
  const clipStart = Math.max(sourceWindow.span.startFrame, window.span.startFrame);
  const clipEnd = Math.min(sourceWindow.span.endFrameExclusive, window.span.endFrameExclusive);
  const clips = clipEnd <= clipStart ? [] : [{ startFrame: clipStart, endFrameExclusive: clipEnd,
    sourceStartFrame: clipStart - sourceWindow.span.startFrame }];
  const videos: HtmlElement[] = clips.map((clip, i) => ({
    id: `take-${i}`, kind: "video",
    source: preparedVisualSource(media), muted: true,
    style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 },
      { name: "width", value: "100%" }, { name: "height", value: "100%" }, { name: "object-fit", value: "cover" }],
    sampling: composeTemporalMaps(sealTemporalMap({
      stages: [{
        target: { id: `take-${i}:occurrence`, duration: exactTemporalValueFromFrames(window.span.endFrameExclusive
          - window.span.startFrame, timeline) },
        source: media.domain,
        pieces: [{ target: {
          start: exactTemporalValueFromFrames(clip.startFrame - window.span.startFrame, timeline),
          end: exactTemporalValueFromFrames(clip.endFrameExclusive - window.span.startFrame, timeline),
        }, sourceAtStart: exactTemporalValueFromFrames(clip.sourceStartFrame, timeline),
        rate: { numerator: 1, denominator: 1 } }],
      }],
    }), visual.map),
  }));
  const labels: HtmlElement[] = [options.title, "Intent", "Performance", "Composition"].map((text, i) => ({
    id: `label-${i}`, kind: "text", text, fonts,
    style: [{ name: "font-size", value: `${i === 0 ? Math.round(within.widthPx * .035) : 23}px` }, { name: "color", value: "#f5eddc" },
      { name: "white-space", value: "nowrap" }],
  }));
  // Exact fonts belong to the typed text children; the program supplies layout and behavior.
  const program = htmlVisual({
    html: `<div class="diagram"><div class="heading">{{label-0}}</div>
      <svg viewBox="0 0 440 300"><path d="M60 60 H320 V150 H60 V240 H320"/></svg>
      <div class="step first">{{label-1}}</div><div class="step second">{{label-2}}</div>
      <div class="step third">{{label-3}}</div></div>
      <div class="viewport">${videos.map(video => `{{${video.id}}}`).join("")}<div class="glass"></div></div>`,
    css: `:scope { background:#193c3a; overflow:hidden; }
      .viewport { position:absolute; overflow:hidden; isolation:isolate; }
      .glass { position:absolute; inset:auto 0 0; height:12%; backdrop-filter:blur(9px); background:rgba(20,40,40,.15); }
      .diagram { position:absolute; left:5%; top:17%; width:48%; height:70%; }
      .heading { position:absolute; top:0; left:0; }
      svg { position:absolute; inset:22% 0 0; width:100%; height:70%; overflow:visible; }
      path { fill:none; stroke:#c5e98b; stroke-width:4; stroke-linecap:round; stroke-dasharray:900; }
      .step { position:absolute; padding:14px 24px; border:1px solid #91c6a2; border-radius:16px; background:#285b51; }
      .first { left:2%; top:30%; } .second { right:2%; top:53%; } .third { left:2%; top:76%; }`,
    data: { width: within.widthPx, height: within.heightPx,
      reveal: reveal.frame - window.span.startFrame, transition: options.transitionFrames },
    setup: `const viewport=root.querySelector('.viewport'), diagram=root.querySelector('.diagram'), path=root.querySelector('path');
      return frame => {
        const t=Math.max(0, Math.min(1,(frame-data.reveal)/data.transition));
        const p=t*t*(3-2*t);
        Object.assign(viewport.style,{left:(p*.61*data.width)+'px',top:(p*.06*data.height)+'px',
          width:((1-p*.65)*data.width)+'px',height:((1-p*.12)*data.height)+'px',borderRadius:(p*24)+'px'});
        diagram.style.opacity=String(p); diagram.style.transform='translateX('+(-24*(1-p))+'px)';
        path.style.strokeDashoffset=String(900*(1-p));
      };`,
  });
  return sealPresentVisualTrack({ id: options.id, timelineId: timeline.id,
    presents: [{ id: options.id, span: window.span,
      root: htmlVisualElement({ id: "scene", kind: "program", program,
        slots: [...videos, ...labels].map((element) => ({ name: element.id, element })),
        style: [{ name: "position", value: "absolute" }, { name: "left", value: `${within.xPx}px` },
          { name: "top", value: `${within.yPx}px` }, { name: "width", value: `${within.widthPx}px` },
          { name: "height", value: `${within.heightPx}px` }] }) }] });
}
