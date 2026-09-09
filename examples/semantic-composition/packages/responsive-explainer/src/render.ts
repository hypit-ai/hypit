import { sealVisualTrack } from "@hypit/hypit/composition";
import type { VisualElement } from "@hypit/hypit/composition";
import { browserProgram } from "@hypit/hypit/hyperframes";
import type { FontArtifactRef } from "@hypit/hypit/media";
import { projectSemanticMedia, projectSemanticProgramSpace } from "@hypit/hypit/semantic-track";
import type { SemanticTrack } from "@hypit/hypit/semantic-track";
import type { CanvasSpace } from "@hypit/hypit/spatial";
import type { TemporalInstant, TemporalWindow } from "@hypit/hypit/temporal";

export type ExplainerOptions = { id: string; title: string; transitionFrames: number; stackingOrder: number };

/** One scene owns the moving performance viewport and the diagram it makes room for. */
export function renderExplainer(semantic: SemanticTrack, canvas: CanvasSpace, window: TemporalWindow,
  reveal: TemporalInstant, fonts: readonly FontArtifactRef[], options: ExplainerOptions) {
  const space = projectSemanticProgramSpace(semantic);
  if (window.start.source.spaceId !== space.id || reveal.source.spaceId !== space.id)
    throw new Error("Explainer timing must belong to its semantic performance.");
  if (!Number.isSafeInteger(options.transitionFrames) || options.transitionFrames < 1)
    throw new Error("Explainer transitionFrames must be a positive integer.");
  const clips = projectSemanticMedia(semantic, window.span).filter(clip => clip.media.visual !== undefined);
  const videos: VisualElement[] = clips.map((clip, i) => ({
    id: `take-${i}`, parent: "scene", kind: "video", order: i + 1,
    artifact: clip.media.visual!.artifact, muted: true,
    style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 },
      { name: "width", value: "100%" }, { name: "height", value: "100%" }, { name: "object-fit", value: "cover" }],
    sampling: { sourceFrameRate: clip.media.timeline.frameRate, sourceFrameCount: clip.media.timeline.frameCount,
      segments: [{ target: { startFrame: clip.span.startFrame - window.span.startFrame,
        endFrameExclusive: clip.span.endFrameExclusive - window.span.startFrame },
        sourceFrame: { numerator: clip.source.startFrame, denominator: 1 }, rate: { numerator: 1, denominator: 1 } }] },
  }));
  const labels: VisualElement[] = [options.title, "Intent", "Performance", "Composition"].map((text, i) => ({
    id: `label-${i}`, parent: "scene", kind: "text", order: videos.length + i + 1, text, fonts,
    style: [{ name: "font-size", value: `${i === 0 ? Math.round(canvas.widthPx * .035) : 23}px` }, { name: "color", value: "#f5eddc" },
      { name: "white-space", value: "nowrap" }],
  }));
  // Exact fonts belong to the typed text children; the program supplies layout and behavior.
  const program = browserProgram({
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
    data: { width: canvas.widthPx, height: canvas.heightPx,
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
  return sealVisualTrack({ id: options.id, programSpaceId: space.id, visualIr: "hypit.visual-ir@1",
    presents: [{ id: options.id, span: window.span, stacking: { order: options.stackingOrder, tieBreak: options.id },
      elements: [{ id: "scene", kind: "program", order: 0, program,
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }] }, ...videos, ...labels] }] });
}
