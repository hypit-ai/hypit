import type { MediaResource, PictureInterpretation } from "@hypit/media";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import { assertHtmlProgram, htmlArtifactUrl } from "./program.js";
import type { HtmlPictureReconstruction } from "./reconstruction.js";
import { assertHtmlVisual, placeHtmlVisualInputs } from "./visual.js";
import type {
  HtmlArtifact,
  HtmlFrameSpan,
  HtmlProgram,
  HtmlVideoSource,
  HtmlVisual,
} from "./types.js";

export type HtmlPictureStyle = { readonly name: string; readonly value: string | number };

type HtmlPictureElementBase = {
  readonly id: string;
  readonly spans: readonly HtmlFrameSpan[];
  readonly style: readonly HtmlPictureStyle[];
};

export type HtmlPictureElement =
  | (HtmlPictureElementBase & { readonly kind: "box"; readonly children: readonly HtmlPictureElement[] })
  | (HtmlPictureElementBase & {
      readonly kind: "program";
      readonly program: HtmlVisual;
      readonly slots: readonly { readonly name: string; readonly element: HtmlPictureElement }[];
      readonly controlPositions?: Readonly<Record<string, readonly (ExactTemporalValue | null)[]>>;
      readonly renderFrames?: readonly (number | null)[];
    })
  | (HtmlPictureElementBase & {
      readonly kind: "image";
      readonly resource: MediaResource;
      readonly picture: PictureInterpretation;
    })
  | (HtmlPictureElementBase & {
      readonly kind: "video";
      readonly resource: MediaResource;
      readonly streamIndex: number;
      readonly presentationStart: ExactTemporalValue;
      readonly interpretation: HtmlVideoSource["interpretation"];
      readonly sourceFrames: HtmlVideoSource["sourceFrames"];
      readonly reconstruction?: HtmlPictureReconstruction;
    });

export type HtmlPictureProgramInput = {
  readonly id: string;
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly frameCount: number;
  readonly canvas: { readonly width: number; readonly height: number; readonly background: string };
  readonly root: HtmlPictureElement;
};

const escapeHtml = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const scriptJson = (value: unknown): string => JSON.stringify(value).replaceAll("<", "\\u003c");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mergeSpans(values: readonly HtmlFrameSpan[]): HtmlFrameSpan[] {
  const result: { startFrame: number; endFrameExclusive: number }[] = [];
  for (const span of [...values].sort((left, right) => left.startFrame - right.startFrame
    || left.endFrameExclusive - right.endFrameExclusive)) {
    const previous = result.at(-1);
    if (previous !== undefined && span.startFrame <= previous.endFrameExclusive) {
      previous.endFrameExclusive = Math.max(previous.endFrameExclusive, span.endFrameExclusive);
    } else result.push({ ...span });
  }
  return result;
}

function cssStyle(value: readonly HtmlPictureStyle[], label: string): string {
  const names = new Set<string>();
  return value.map((entry) => {
    assert(/^-?[a-z][a-z0-9-]*$/u.test(entry.name) && !names.has(entry.name),
      `${label} contains an invalid or repeated CSS property ${entry.name}.`);
    names.add(entry.name);
    if (typeof entry.value === "number") assert(Number.isFinite(entry.value), `${label}.${entry.name} is not finite.`);
    else assert(entry.value.length > 0 && !/[;<>{}\\]|!important|[\u0000-\u001f\u007f]/iu.test(entry.value),
      `${label}.${entry.name} is not a self-contained CSS value.`);
    return `${entry.name}:${String(entry.value)}`;
  }).join(";");
}

type ArtifactPlan = {
  readonly resource: MediaResource;
  picture?: PictureInterpretation;
  readonly spans: HtmlFrameSpan[];
};

function resourceKey(value: MediaResource): string {
  return `${value.address}\u0000${value.mediaType}\u0000${value.size ?? ""}`;
}

function collectArtifacts(root: HtmlPictureElement): {
  readonly artifacts: readonly HtmlArtifact[];
  readonly ids: ReadonlyMap<string, string>;
} {
  const plans = new Map<string, ArtifactPlan>();
  const add = (resource: MediaResource, spans: readonly HtmlFrameSpan[], picture?: PictureInterpretation): void => {
    if (spans.length === 0) return;
    const key = resourceKey(resource);
    const plan = plans.get(key) ?? { resource: structuredClone(resource), spans: [] };
    if (plan.picture !== undefined && picture !== undefined && JSON.stringify(plan.picture) !== JSON.stringify(picture)) {
      throw new Error(`HTML Picture resource ${resource.address} has conflicting interpretations.`);
    }
    if (plan.picture === undefined && picture !== undefined) plan.picture = structuredClone(picture);
    plan.spans.push(...spans.map((span) => ({ ...span })));
    plans.set(key, plan);
  };
  const visit = (element: HtmlPictureElement): void => {
    if (element.kind === "box") element.children.forEach(visit);
    else if (element.kind === "program") {
      assertHtmlVisual(element.program);
      for (const dependency of element.program.dependencies ?? []) {
        add(dependency.resource, element.spans, dependency.kind === "picture" ? dependency.picture : undefined);
      }
      element.slots.forEach((slot) => visit(slot.element));
    } else if (element.kind === "image") add(element.resource, element.spans, element.picture);
    else add(element.resource, element.spans);
  };
  visit(root);
  const entries = [...plans.entries()].sort(([left], [right]) => left.localeCompare(right));
  const ids = new Map<string, string>();
  const artifacts = entries.map(([key, plan], index): HtmlArtifact => {
    const id = `artifact-${String(index + 1).padStart(4, "0")}`;
    ids.set(key, id);
    return {
      id,
      resource: structuredClone(plan.resource),
      usage: { kind: "frames", spans: mergeSpans(plan.spans) },
      ...(plan.picture === undefined
        ? { kind: "bytes" as const }
        : { kind: "picture" as const, picture: structuredClone(plan.picture) }),
    };
  });
  return { artifacts, ids };
}

/** Compile an already-lowered Picture tree to one stable, frame-addressed DOM. */
export function compileHtmlPictureProgram(input: HtmlPictureProgramInput): HtmlProgram {
  assert(input.id.length > 0, "HTML Picture Programme id is empty.");
  assert(Number.isSafeInteger(input.frameRate.numerator) && input.frameRate.numerator > 0
    && Number.isSafeInteger(input.frameRate.denominator) && input.frameRate.denominator > 0,
  "HTML Picture Programme frame rate is invalid.");
  assert(Number.isSafeInteger(input.frameCount) && input.frameCount > 0
    && Number.isSafeInteger(input.canvas.width) && input.canvas.width > 0
    && Number.isSafeInteger(input.canvas.height) && input.canvas.height > 0
    && input.canvas.background.length > 0, "HTML Picture Programme output is invalid.");
  const validate = (element: HtmlPictureElement): void => {
    let previousEnd = -1;
    for (const span of element.spans) {
      assert(Number.isSafeInteger(span.startFrame) && Number.isSafeInteger(span.endFrameExclusive)
        && span.startFrame >= 0 && span.endFrameExclusive > span.startFrame
        && span.endFrameExclusive <= input.frameCount && span.startFrame >= previousEnd,
      `HTML Picture ${element.id} spans are invalid.`);
      previousEnd = span.endFrameExclusive;
    }
    if (element.kind === "box") element.children.forEach(validate);
    else if (element.kind === "program") {
      assertHtmlVisual(element.program);
      element.slots.forEach((slot) => validate(slot.element));
      assert(element.renderFrames === undefined || element.renderFrames.length === input.frameCount,
        `HTML Picture ${element.id} render-frame map has the wrong length.`);
      for (const [name, positions] of Object.entries(element.controlPositions ?? {})) {
        assert(name.length > 0 && positions.length === input.frameCount,
          `HTML Picture ${element.id} Control ${name} has the wrong length.`);
      }
    } else if (element.kind === "video") {
      assert(Number.isSafeInteger(element.streamIndex) && element.streamIndex >= 0
        && element.sourceFrames.length === input.frameCount,
      `HTML Picture ${element.id} video sampling plan is invalid.`);
    }
  };
  validate(input.root);
  const { artifacts, ids } = collectArtifacts(input.root);
  const artifactUrl = (resource: MediaResource): string => {
    const id = ids.get(resourceKey(resource));
    assert(id !== undefined, `HTML Picture Programme references undeclared resource ${resource.address}.`);
    return htmlArtifactUrl(id);
  };
  const videoSources: HtmlVideoSource[] = [];
  const programs: {
    readonly id: string;
    readonly renderFrames?: readonly (number | null)[];
    readonly controls?: Readonly<Record<string, readonly (ExactTemporalValue | null)[]>>;
    readonly data?: unknown;
    readonly setup: string;
    readonly resources: Readonly<Record<string, string>>;
  }[] = [];
  const styles: string[] = [];
  const fontRules = new Set<string>();
  let serial = 0;
  const render = (element: HtmlPictureElement): string => {
    const domId = `hypit-picture-${++serial}`;
    const encodedSpans = element.spans.map((span) => `${span.startFrame}:${span.endFrameExclusive}`).join(",");
    const common = `id="${domId}" data-hypit-element-id="${escapeHtml(element.id)}" data-hypit-spans="${encodedSpans}" style="${escapeHtml(cssStyle(element.style, `HTML Picture ${element.id}`))}"`;
    if (element.spans.length === 0) return `<div ${common}></div>`;
    if (element.kind === "box") return `<div ${common}>${element.children.map(render).join("")}</div>`;
    if (element.kind === "program") {
      const slots = Object.fromEntries(element.slots.map((slot) => [slot.name, render(slot.element)]));
      if (element.program.css !== undefined) styles.push(`@scope (#${domId}) {${element.program.css}}`);
      const resources = Object.fromEntries((element.program.dependencies ?? []).map((dependency) =>
        [dependency.id, artifactUrl(dependency.resource)]));
      for (const dependency of element.program.dependencies ?? []) if (dependency.kind === "font") {
        const coverage = dependency.unicodeRange === undefined ? "" : `;unicode-range:${dependency.unicodeRange}`;
        fontRules.add(`@font-face{font-family:${JSON.stringify(dependency.family)};src:url(${JSON.stringify(artifactUrl(dependency.resource))});font-weight:${dependency.weight ?? "normal"};font-style:${dependency.style ?? "normal"}${coverage}}`);
      }
      if (element.program.setup !== undefined) programs.push({
        id: domId,
        ...(element.renderFrames === undefined ? {} : { renderFrames: element.renderFrames }),
        ...(element.controlPositions === undefined ? {} : { controls: element.controlPositions }),
        ...(element.program.data === undefined ? {} : { data: element.program.data }),
        setup: element.program.setup,
        resources,
      });
      const fragment = placeHtmlVisualInputs(element.program, slots).replace(
        /hypit-dependency:\/\/([^\s"'<>]+)/gu,
        (_value, dependencyId: string) => {
          const dependency = (element.program.dependencies ?? []).find((entry) => entry.id === decodeURIComponent(dependencyId));
          assert(dependency !== undefined, `HTML visual ${element.id} references undeclared dependency ${dependencyId}.`);
          return artifactUrl(dependency.resource);
        },
      );
      return `<div ${common}>${fragment}</div>`;
    }
    if (element.kind === "image") return `<img ${common} data-hypit-artifact-src="${artifactUrl(element.resource)}"/>`;
    videoSources.push({
      id: `video-source-${videoSources.length + 1}`,
      elementId: domId,
      resource: structuredClone(element.resource),
      streamIndex: element.streamIndex,
      presentationStart: structuredClone(element.presentationStart),
      interpretation: structuredClone(element.interpretation),
      usage: element.spans.length === 0 ? { kind: "never" } : { kind: "frames", spans: element.spans.map((span) => ({ ...span })) },
      sourceFrames: structuredClone(element.sourceFrames),
      ...(element.reconstruction === undefined ? {} : {
        reconstruction: structuredClone(element.reconstruction),
      }),
    });
    return `<span ${common} data-hypit-media-display-plane><span data-hypit-media-payload-host style="position:relative;display:block;width:100%;height:100%;object-fit:inherit;object-position:inherit"><video data-hypit-video-source="${videoSources.at(-1)!.id}" data-hypit-artifact-src="${artifactUrl(element.resource)}" muted playsinline preload="auto" style="position:absolute;inset:0;width:100%;height:100%;object-fit:inherit;object-position:inherit;pointer-events:none"></video><span data-hypit-decoded-media-slot style="position:absolute;inset:0;overflow:hidden;object-fit:inherit;object-position:inherit;pointer-events:none"></span></span></span>`;
  };
  const picture = render(input.root);
  const runtime = `
const entries=${scriptJson(programs)};
const sourcePlans=${scriptJson(videoSources.map((source) => ({ id: source.id, frames: source.sourceFrames })))};
const failures=[];
const seconds=value=>Number(value.ticks)*value.timeBase.numerator/value.timeBase.denominator;
let preparedSourceFrameBase;
Object.defineProperty(window,'__hypitUsePreparedSourceFrames',{configurable:false,writable:false,value:base=>{if(typeof base!=='string'||base.length===0)throw new Error('Prepared Source Frame base is invalid.');preparedSourceFrameBase=base.replace(/\\\/$/u,'');}});
const spans=element=>(element.dataset.hypitSpans||'').split(',').filter(Boolean).map(value=>{const [start,end]=value.split(':').map(Number);return{start,end}});
const contributions=[...document.querySelectorAll('[data-hypit-spans]')].map(element=>({element,spans:spans(element)}));
let renders=[];
const prepareRenders=selection=>entries.flatMap(entry=>{
  const root=document.getElementById(entry.id);
  if(!selected(root,selection))return [];
  try{
    const context={
      width:root.offsetWidth,height:root.offsetHeight,frameRate:${input.frameRate.numerator / input.frameRate.denominator},
      durationFrames:${input.frameCount},resource:id=>entry.resources[id],
      controlPosition(name,frame){
        const values=entry.controls?.[name];
        if(values===undefined)throw new Error('Undeclared Control '+name);
        return values[Math.max(0,Math.min(values.length-1,Math.floor(frame)))]??undefined;
      }
    };
    const render=new Function('root','data','context',entry.setup)(root,entry.data,context);
    if(typeof render!=='function')throw new Error('HTML visual setup must return render(localFrame, outputFrame).');
    return [{...entry,root,render}];
  }catch(error){
    failures.push(error);
    return [];
  }
});
const videos=sourcePlans.map(plan=>{const element=document.querySelector('[data-hypit-video-source="'+plan.id+'"]');const slot=element.parentElement.querySelector(':scope>[data-hypit-decoded-media-slot]');const image=document.createElement('img');image.dataset.hypitSourceFrameImage=plan.id;image.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:inherit;object-position:inherit;pointer-events:none;display:none';slot.append(image);return{...plan,element,image};});
const selected=(element,selection)=>{if(selection===undefined)return true;const values=spans(element.closest('[data-hypit-spans]')||element);return values.some(left=>selection.some(right=>left.start<right.endFrameExclusive&&right.startFrame<left.end));};
const activate=selection=>{for(const element of document.querySelectorAll('[data-hypit-artifact-src]')){if(!selected(element,selection)||preparedSourceFrameBase!==undefined&&element.hasAttribute('data-hypit-video-source'))continue;element.src=element.dataset.hypitArtifactSrc;element.removeAttribute('data-hypit-artifact-src');}};
async function seek(video,time){if(!Number.isFinite(time)||Math.abs(video.currentTime-time)<=.0001)return;await new Promise((resolve,reject)=>{const done=()=>{cleanup();resolve()};const failed=()=>{cleanup();reject(new Error('Cannot seek '+video.src))};const cleanup=()=>{video.removeEventListener('seeked',done);video.removeEventListener('error',failed)};video.addEventListener('seeked',done,{once:true});video.addEventListener('error',failed,{once:true});video.currentTime=Math.max(0,Math.min(time,Math.max(0,video.duration-.000001)));});}
const drawSourceFrame=async(entry,frame)=>{const sample=entry.frames[frame];if(sample===null){entry.element.style.display='none';entry.image.style.display='none';return;}if(preparedSourceFrameBase===undefined){entry.image.style.display='none';entry.element.style.display='block';if(entry.element.hasAttribute('src'))await seek(entry.element,seconds(sample.position));return;}entry.element.style.display='none';entry.image.style.display='block';const url=preparedSourceFrameBase+'/'+encodeURIComponent(entry.id)+'/'+frame+'.png';if(entry.image.src!==new URL(url,document.baseURI).href)entry.image.src=url;await entry.image.decode();};
async function prepare(selection){
  for(const {element} of contributions)element.style.display=selected(element,selection)?'':'none';
  document.getElementById('hypit-program').style.display='';
  activate(selection);
  const liveVideos=preparedSourceFrameBase===undefined?videos.filter(({element})=>element.hasAttribute('src')):[];
  await Promise.all([...document.images].filter(image=>image.hasAttribute('src')).map(image=>image.complete?Promise.resolve():image.decode()));
  await Promise.all(liveVideos.map(({element})=>element.readyState>=2?Promise.resolve():new Promise((resolve,reject)=>{
    const ready=()=>{if(element.readyState<2)return;cleanup();resolve()};
    const failed=()=>{cleanup();reject(new Error('Cannot decode '+element.src))};
    const cleanup=()=>{element.removeEventListener('loadeddata',ready);element.removeEventListener('error',failed)};
    element.addEventListener('loadeddata',ready);
    element.addEventListener('error',failed,{once:true});
  })));
  document.documentElement.getBoundingClientRect();
  await document.fonts.ready;
  for(const face of document.fonts)if(face.status==='error')throw new Error('Cannot load font '+face.family);
  renders=prepareRenders(selection);
  if(failures.length)throw failures[0];
}
window.__hypitFrameProgram={frameCount:${input.frameCount},prepare,async applyFrame(frame){if(!Number.isSafeInteger(frame)||frame<0||frame>=${input.frameCount})throw new Error('HTML frame is outside Programme.');for(const contribution of contributions)contribution.element.style.display=contribution.spans.some(span=>frame>=span.start&&frame<span.end)?'':'none';for(const entry of renders){const local=entry.renderFrames===undefined?frame:entry.renderFrames[frame];if(local!==null)entry.render(local,frame);}const pending=[];window.dispatchEvent(new CustomEvent('hypit-frame',{detail:{frame,waitUntil(value){pending.push(Promise.resolve(value));}}}));await Promise.all([...pending,...videos.map(entry=>drawSourceFrame(entry,frame))]);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(window.__hypitHtmlVisualError)throw new Error(window.__hypitHtmlVisualError);}};`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${input.canvas.width}px;height:${input.canvas.height}px;overflow:hidden;background:${input.canvas.background}}*{box-sizing:border-box}#hypit-program{position:relative;width:100%;height:100%;overflow:hidden}${[...fontRules].join("")}${styles.join("")}</style></head><body><div id="hypit-program" style="display:none">${picture}</div><script>${runtime}</script></body></html>`;
  const program: HtmlProgram = {
    frameRate: structuredClone(input.frameRate),
    frameCount: input.frameCount,
    canvas: structuredClone(input.canvas),
    artifacts,
    videoSources,
    html,
  };
  assertHtmlProgram(program);
  return program;
}
