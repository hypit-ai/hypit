import { sealVisualTrack, type VisualElement } from "@hypit/hypit/composition";
import { browserProgram } from "@hypit/hypit/hyperframes";
import type { BlobRef } from "@hypit/hypit/author-kit";
import type { Timeline } from "@hypit/hypit/timeline";
import type { CanvasSpace } from "@hypit/hypit/spatial";
import type { TemporalWindow } from "@hypit/hypit/temporal";
import type { TemporalInstant } from "@hypit/hypit/temporal";
import { assertTemporalInstantFor, assertTemporalWindowFor } from "@hypit/hypit/temporal";

type ShowcaseMedia = {
  host: BlobRef; math: BlobRef; ml: BlobRef; physics: BlobRef;
  first: TemporalInstant; next: TemporalInstant; finally: TemporalInstant; these: TemporalInstant;
};

type SamplingSegment = { start: number; end: number; source: number; rate?: { numerator: number; denominator: number }; loop?: number };

function sampling(frameRate: Timeline["frameRate"], sourceFrameCount: number, segments: readonly SamplingSegment[]) {
  return {
    sourceFrameRate: frameRate,
    sourceFrameCount,
    segments: segments.map((segment) => ({
      target: { startFrame: segment.start, endFrameExclusive: segment.end },
      sourceFrame: { numerator: segment.source, denominator: 1 },
      rate: segment.rate ?? { numerator: 1, denominator: 1 },
      ...(segment.loop === undefined ? {} : { loop: { startFrame: 0, endFrameExclusive: segment.loop } }),
    })),
  };
}

function cardVideo(id: string, artifact: BlobRef, frameRate: Timeline["frameRate"], frames: number,
  segments: Parameters<typeof sampling>[2], order: number): VisualElement {
  return {
    id, parent: "scene", kind: "video", order, artifact, muted: true,
    style: [
      { name: "position", value: "absolute" }, { name: "inset", value: 0 },
      { name: "width", value: "100%" }, { name: "height", value: "100%" },
      { name: "object-fit", value: "cover" }, { name: "display", value: "block" },
    ],
    sampling: sampling(frameRate, frames, segments),
  };
}

export function renderManimShowcase(timeline: Timeline, canvas: CanvasSpace, window: TemporalWindow, media: ShowcaseMedia) {
  assertTemporalWindowFor(window, { subjectId: "showcase", space: timeline });
  const frameRate = timeline.frameRate;
  if (!Number.isSafeInteger(frameRate.numerator) || frameRate.numerator <= 0
    || !Number.isSafeInteger(frameRate.denominator) || frameRate.denominator <= 0) {
    throw new Error("Manim showcase requires a positive Timeline frame rate.");
  }
  const eventNames = ["first", "next", "finally", "these"] as const;
  for (const name of eventNames) {
    const event = media[name];
    assertTemporalInstantFor(event, { subjectId: event.subjectId, space: timeline });
  }
  const relativeFrame = (event: TemporalInstant) => event.frame - window.span.startFrame;
  const mathStart = relativeFrame(media.first);
  const mlStart = relativeFrame(media.next);
  const physicsStart = relativeFrame(media.finally);
  const overviewStart = relativeFrame(media.these);
  const total = window.span.endFrameExclusive - window.span.startFrame;
  if (!(0 <= mathStart && mathStart < mlStart && mlStart < physicsStart && physicsStart < overviewStart && overviewStart < total)) {
    throw new Error("Manim showcase Moments must be chronological and inside the scene window.");
  }
  const host: VisualElement = {
    id: "host-video", parent: "scene", kind: "video", order: 1, artifact: media.host,
    muted: true,
    style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }, { name: "width", value: "100%" }, { name: "height", value: "100%" }, { name: "object-fit", value: "cover" }],
    sampling: sampling(frameRate, total, [{ start: 0, end: total, source: 0 }]),
  };
  const math = cardVideo("math-video", media.math, frameRate, 165, [
    { start: mathStart, end: mlStart, source: 0, rate: { numerator: 165, denominator: mlStart - mathStart } },
    { start: mlStart, end: total, source: 0, loop: 165 },
  ], 2);
  const ml = cardVideo("ml-video", media.ml, frameRate, 143, [
    { start: mathStart, end: mlStart, source: 0, loop: 143 },
    { start: mlStart, end: physicsStart, source: 0, rate: { numerator: 143, denominator: physicsStart - mlStart } },
    { start: physicsStart, end: total, source: 0, loop: 143 },
  ], 3);
  const physics = cardVideo("physics-video", media.physics, frameRate, 154, [
    { start: mathStart, end: physicsStart, source: 0, loop: 154 },
    { start: physicsStart, end: overviewStart, source: 0, rate: { numerator: 154, denominator: overviewStart - physicsStart } },
    { start: overviewStart, end: total, source: 0, loop: 154 },
  ], 4);
  const program = browserProgram({
    html: `<main class="scene">
      <div class="host-frame"><div class="host-window">{{host-video}}</div></div>
      <div class="card math-card"><div class="label">MATHEMATICS</div>{{math-video}}</div>
      <div class="card ml-card"><div class="label">MACHINE LEARNING</div>{{ml-video}}</div>
      <div class="card physics-card"><div class="label">PHYSICS</div>{{physics-video}}</div>
    </main>`,
    css: `:scope{position:relative;width:100%;height:100%;overflow:hidden;background:#07101f;color:#eef6ff;font-family:Inter,Arial,sans-serif}
      .scene,.host-frame{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}
      .host-frame{z-index:5}
      .host-window{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;will-change:transform}
      .host-window video{object-fit:cover}
      .card{position:absolute;left:0;top:0;width:400px;height:430px;overflow:hidden;z-index:10;opacity:0;background:#101b36;border:1px solid #9dbee055;border-radius:8px;box-shadow:0 16px 38px #02081599;transform-origin:0 0;isolation:isolate}
      .card:after{content:"";position:absolute;inset:0;border:1px solid #d8edff22;pointer-events:none;z-index:2}
      /* The source MP4s are landscape compositions with the actual Manim scene
         centered inside them. Cover-cropping the opaque video window makes that
         scene readable at the card size while keeping the MP4 itself unchanged. */
      .card video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;z-index:1;background:#101b36}
      .label{position:absolute;left:14px;bottom:12px;z-index:3;padding:5px 8px;background:#07101dcc;border:1px solid #bfe8ff55;border-radius:4px;color:#f4fbff;font-size:11px;font-weight:700;letter-spacing:1.2px;white-space:nowrap}
    `,
    data: { width: canvas.widthPx, height: canvas.heightPx, total, mathStart, mlStart, physicsStart, overviewStart },
    setup: `const q=s=>root.querySelector(s), hostWindow=q('.host-window'), cards={math:q('.math-card'),ml:q('.ml-card'),physics:q('.physics-card')};
      const small={math:{x:2,y:930},ml:{x:244,y:930},physics:{x:486,y:930}}, focus={x:160,y:720};
      const names=['math','ml','physics'];
      const pose=(el,s,scale,opacity,filter,z)=>{el.style.transform='translate('+s.x+'px,'+s.y+'px) scale('+scale+')';el.style.opacity=String(opacity);el.style.filter=filter;el.style.zIndex=String(z)};
      return frame=>{const f=frame;
        hostWindow.style.left='0px';
        hostWindow.style.top='0px';
        hostWindow.style.width='100%';
        hostWindow.style.height='100%';
        hostWindow.style.transform='none';
        hostWindow.style.transformOrigin='0 0';
        if(f<data.mathStart){names.forEach(n=>pose(cards[n],small[n],.5,0,'brightness(.7)',10));return}
        const active=f<data.mlStart?'math':f<data.physicsStart?'ml':f<data.overviewStart?'physics':null;
        names.forEach(n=>{const isActive=n===active;pose(cards[n],isActive?focus:small[ n ],isActive?1:.5,1,isActive?'brightness(1.14) contrast(1.06) saturate(1.05)':'brightness(.72) contrast(.96) saturate(.9)',isActive?30:10)});
      };`,
  });
  const scene: VisualElement = { id: "scene", kind: "program", order: 0, program, style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }, { name: "width", value: `${canvas.widthPx}px` }, { name: "height", value: `${canvas.heightPx}px` }] };
  return sealVisualTrack({ id: "manim-showcase", programSpaceId: timeline.id, visualIr: "hypit.visual-ir@1", presents: [{ id: "manim-showcase", span: window.span, stacking: { order: 0, tieBreak: "manim-showcase" }, elements: [scene, host, math, ml, physics] }] });
}
