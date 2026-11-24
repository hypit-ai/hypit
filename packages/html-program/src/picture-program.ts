import type { MediaResource, PictureInterpretation } from "@hypit/media";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import { alphaMaskRuntime } from "./alpha-mask-runtime.js";
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
      readonly kind: "alpha-mask";
      readonly size: { readonly width: number; readonly height: number };
      readonly raster: { readonly width: number; readonly height: number };
      readonly content: HtmlPictureElement;
      readonly matte: HtmlPictureElement;
    })
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
  /** Logical output frames represented by this compact batch, in observed order. */
  readonly outputFrames?: readonly number[];
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
    else if (element.kind === "alpha-mask") { visit(element.content); visit(element.matte); }
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
  assert(input.outputFrames === undefined || (input.outputFrames.length === input.frameCount
    && input.outputFrames.every((frame, index, frames) => Number.isSafeInteger(frame) && frame >= 0
      && (index === 0 || frame > frames[index - 1]!))), "HTML Picture Programme output indices are invalid.");
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
    else if (element.kind === "alpha-mask") {
      const { size, raster } = element;
      assert([size.width, size.height].every(value => Number.isFinite(value) && value > 0)
        && [raster.width, raster.height].every(value => Number.isSafeInteger(value) && value > 0),
      `HTML Picture ${element.id} alpha mask extent is invalid.`);
      validate(element.content); validate(element.matte);
    }
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
  const alphaVisualAssets: { readonly id: string; readonly urls: readonly string[] }[] = [];
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
  const render = (element: HtmlPictureElement, alphaInput = false): string => {
    const domId = `hypit-picture-${++serial}`;
    const encodedSpans = element.spans.map((span) => `${span.startFrame}:${span.endFrameExclusive}`).join(",");
    const common = `id="${domId}" data-hypit-element-id="${escapeHtml(element.id)}" data-hypit-spans="${encodedSpans}" style="${escapeHtml(cssStyle(element.style, `HTML Picture ${element.id}`))}"`;
    if (element.spans.length === 0) return `<div ${common}></div>`;
    if (element.kind === "box") return `<div ${common}>${element.children.map(child => render(child, alphaInput)).join("")}</div>`;
    if (element.kind === "alpha-mask") {
      const drawable = (child: HtmlPictureElement) => `<div drawable aria-hidden="true" style="position:relative;overflow:hidden;width:${element.size.width}px;height:${element.size.height}px">${render(child, true)}</div>`;
      return `<canvas ${common} data-hypit-alpha-mask content="drawable" width="${element.raster.width}" height="${element.raster.height}">${drawable(element.content)}${drawable(element.matte)}</canvas>`;
    }
    if (element.kind === "program") {
      const slots = Object.fromEntries(element.slots.map((slot) => [slot.name, render(slot.element, alphaInput)]));
      if (element.program.css !== undefined) styles.push(`@scope (#${domId}) {${element.program.css}}`);
      const resources = Object.fromEntries((element.program.dependencies ?? []).map((dependency) =>
        [dependency.id, artifactUrl(dependency.resource)]));
      if (alphaInput) {
        const urls = [...new Set((element.program.dependencies ?? []).filter(dependency =>
          dependency.resource.mediaType.startsWith("image/")).map(dependency => resources[dependency.id]!))];
        if (urls.length > 0) alphaVisualAssets.push({ id: domId, urls });
      }
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
    const cors = alphaInput ? ' crossorigin="anonymous"' : "";
    if (element.kind === "image") return `<img ${common}${cors} data-hypit-artifact-src="${artifactUrl(element.resource)}"/>`;
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
    return `<span ${common} data-hypit-media-display-plane><span data-hypit-media-payload-host style="position:relative;display:block;width:100%;height:100%;object-fit:inherit;object-position:inherit"><video${cors} data-hypit-video-source="${videoSources.at(-1)!.id}" data-hypit-artifact-src="${artifactUrl(element.resource)}" muted playsinline preload="auto" style="position:absolute;inset:0;width:100%;height:100%;object-fit:inherit;object-position:inherit;pointer-events:none"></video><span data-hypit-decoded-media-slot style="position:absolute;inset:0;overflow:hidden;object-fit:inherit;object-position:inherit;pointer-events:none"></span></span></span>`;
  };
  const picture = render(input.root);
  const runtime = `
const entries=${scriptJson(programs)};
const outputFrames=${scriptJson(input.outputFrames ?? null)};
const sampleIndices=outputFrames===null?null:new Map(outputFrames.map((frame,index)=>[frame,index]));
const sourcePlans=${scriptJson(videoSources.map((source) => ({ id: source.id, frames: source.sourceFrames })))};
const failures=[];
const alphaVisualAssets=${scriptJson(alphaVisualAssets)};
${alphaMaskRuntime}
const seconds=value=>Number(value.ticks)*value.timeBase.numerator/value.timeBase.denominator;
let preparedSourceFrameBase;
Object.defineProperty(window,'__hypitUsePreparedSourceFrames',{configurable:false,writable:false,value:base=>{if(typeof base!=='string'||base.length===0)throw new Error('Prepared Source Frame base is invalid.');preparedSourceFrameBase=base.replace(/\\\/$/u,'');}});
const spans=element=>(element.dataset.hypitSpans||'').split(',').filter(Boolean).map(value=>{const [start,end]=value.split(':').map(Number);return{start,end}});
const contributions=[...document.querySelectorAll('[data-hypit-spans]')].map(element=>({element,spans:spans(element)}));
let renders=[];
const prepareRender=entry=>{
  const root=document.getElementById(entry.id);
  try{
    const context={
      width:root.offsetWidth,height:root.offsetHeight,frameRate:${input.frameRate.numerator / input.frameRate.denominator},
      durationFrames:${input.frameCount},resource:id=>drawableImageURLs.get(entry.resources[id])??entry.resources[id],
      controlPosition(name,frame){
        const values=entry.controls?.[name];
        if(values===undefined)throw new Error('Undeclared Control '+name);
        const index=sampleIndices===null?Math.max(0,Math.min(values.length-1,Math.floor(frame))):sampleIndices.get(Math.floor(frame));
        return index===undefined?undefined:values[index]??undefined;
      }
    };
    const render=new Function('root','data','context',entry.setup)(root,entry.data,context);
    if(typeof render!=='function')throw new Error('HTML visual setup must return render(localFrame, outputFrame).');
    return {...entry,root,render};
  }catch(error){
    failures.push(error);
    return undefined;
  }
};
const prepareRenders=selection=>entries.filter(entry=>selected(document.getElementById(entry.id),selection))
  .map(prepareRender).filter(Boolean);
const videos=sourcePlans.map(plan=>{const element=document.querySelector('[data-hypit-video-source="'+plan.id+'"]');const slot=element.parentElement.querySelector(':scope>[data-hypit-decoded-media-slot]');const image=document.createElement('img');image.dataset.hypitSourceFrameImage=plan.id;image.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:inherit;object-position:inherit;pointer-events:none;display:none';slot.append(image);return{...plan,element,image};});
const selected=(element,selection)=>{if(selection===undefined)return true;const values=spans(element.closest('[data-hypit-spans]')||element);return values.some(left=>selection.some(right=>left.start<right.endFrameExclusive&&right.startFrame<left.end));};
const activate=selection=>{for(const element of document.querySelectorAll('[data-hypit-artifact-src]')){if(!selected(element,selection)||preparedSourceFrameBase!==undefined&&element.hasAttribute('data-hypit-video-source'))continue;element.src=element.dataset.hypitArtifactSrc;element.removeAttribute('data-hypit-artifact-src');}};
async function seek(video,time){if(!Number.isFinite(time)||Math.abs(video.currentTime-time)<=.0001)return;await new Promise((resolve,reject)=>{const done=()=>{cleanup();resolve()};const failed=()=>{cleanup();reject(new Error('Cannot seek '+video.src))};const cleanup=()=>{video.removeEventListener('seeked',done);video.removeEventListener('error',failed)};video.addEventListener('seeked',done,{once:true});video.addEventListener('error',failed,{once:true});video.currentTime=Math.max(0,Math.min(time,Math.max(0,video.duration-.000001)));});}
const drawSourceFrame=async(entry,frame)=>{const sample=entry.frames[frame];if(sample===null){entry.element.style.display='none';entry.image.style.display='none';return;}if(preparedSourceFrameBase===undefined){entry.image.style.display='none';entry.element.style.display='block';if(entry.element.hasAttribute('src'))await seek(entry.element,seconds(sample.position));return;}entry.element.style.display='none';entry.image.style.display='block';const url=preparedSourceFrameBase+'/'+encodeURIComponent(entry.id)+'/'+frame+'.png';if(entry.image.src!==new URL(url,document.baseURI).href)entry.image.src=url;await entry.image.decode();};
async function prepare(selection){
  for(const {element} of contributions)element.style.display=selected(element,selection)?'':'none';
  document.getElementById('hypit-program').style.display='';
  activate(selection);
  if(alphaVisualAssets.length)await prepareDrawableVisuals(element=>selected(element,selection));
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
const inFrame=(spans,frame)=>spans.some(span=>frame>=span.start&&frame<span.end);
function assertFrame(frame){
  if(!Number.isSafeInteger(frame)||frame<0||frame>=${input.frameCount})throw new Error('HTML frame is outside Programme.');
}
function showFrame(frame){
  document.getElementById('hypit-program').style.display='';
  for(const contribution of contributions)contribution.element.style.display=inFrame(contribution.spans,frame)?'':'none';
}
function renderEntry(entry,frame){
  const output=outputFrames===null?frame:outputFrames[frame];
  const local=entry.renderFrames===undefined?output:entry.renderFrames[frame];
  if(local!==null)entry.render(local,output);
}
function frameEvents(frame){
  const pending=[];
  window.dispatchEvent(new CustomEvent('hypit-frame',{detail:{frame:outputFrames===null?frame:outputFrames[frame],waitUntil(value){pending.push(Promise.resolve(value));}}}));
  return pending;
}
function checkVisual(){
  if(failures.length)throw failures[0];
  if(window.__hypitHtmlVisualError)throw new Error(window.__hypitHtmlVisualError);
}
const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

const seekRenders=new Map();
const seekEntries=entries.map(entry=>({entry,spans:spans(document.getElementById(entry.id))}));
function decodeImages(frame,signal){
  const images=[...document.querySelectorAll('img[src]:not([src=""]),img[data-hypit-artifact-src]')];
  return Promise.all(images.filter(element=>inFrame(spans(element.closest('[data-hypit-spans]')||element),frame))
    .map(element=>{
      if(!element.hasAttribute('src'))element.src=element.dataset.hypitArtifactSrc;
      if(element.complete&&element.naturalWidth>0)return;
      return new Promise((resolve,reject)=>{
        const abort=()=>reject(signal.reason);
        if(signal.aborted){abort();return;}
        signal.addEventListener('abort',abort,{once:true});
        void element.decode().then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
      });
    }));
}
function seekVideo(element,time,signal){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(new Error('Media seek timed out.')),3500);
    let target;
    const finish=error=>{
      clearTimeout(timer);
      element.removeEventListener('loadedmetadata',start);
      element.removeEventListener('loadeddata',decoded);
      element.removeEventListener('seeked',decoded);
      element.removeEventListener('error',failed);
      signal.removeEventListener('abort',abort);
      if(error)reject(error); else resolve();
    };
    const abort=()=>finish(signal.reason);
    const failed=()=>finish(new Error('Cannot decode preview media.'));
    const decoded=()=>{
      if(target!==undefined&&!element.seeking&&element.readyState>=2&&Math.abs(element.currentTime-target)<.002)finish();
    };
    const start=()=>{
      target=Math.max(0,Math.min(time,Math.max(0,element.duration-.000001)));
      if(!Number.isFinite(target)){failed();return;}
      try{
        if(Math.abs(element.currentTime-target)>.000001)element.currentTime=target;
      }catch(error){finish(error);return;}
      decoded();
    };
    signal.addEventListener('abort',abort,{once:true});
    element.addEventListener('loadedmetadata',start);
    element.addEventListener('loadeddata',decoded);
    element.addEventListener('seeked',decoded);
    element.addEventListener('error',failed);
    if(signal.aborted)abort();
    else if(element.error)failed();
    else if(element.readyState>=1)start();
  });
}
function startDecoder(entry){
  if(entry.element.hasAttribute('src'))return;
  entry.element.style.display='none';
  entry.element.src=entry.element.dataset.hypitArtifactSrc;
}
async function prepareSeekSource(entry,frame,options,signal){
  const sample=entry.frames[frame];
  if(sample===null)return;
  if(options.nativeSources.includes(entry.id)&&sample.side==='after'&&!entry.nativeFailed){
    startDecoder(entry);
    try{
      await seekVideo(entry.element,seconds(sample.position),signal);
      return {entry,source:entry.element,width:entry.element.videoWidth,height:entry.element.videoHeight};
    }catch(error){
      signal.throwIfAborted();
      entry.nativeFailed=true;
      releaseDecoder(entry);
    }
  }
  const response=await fetch(options.frameBase+'/'+encodeURIComponent(entry.id)+'/'+frame+'.png',{signal});
  if(!response.ok)throw new Error('Cannot read preview source '+entry.id+' at frame '+frame+'.');
  const source=await createImageBitmap(await response.blob());
  return {entry,source,width:source.width,height:source.height,release:()=>source.close()};
}
function showSeekSource({entry,source,width,height}){
  if(!entry.canvas){
    entry.canvas=document.createElement('canvas');
    entry.canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:inherit;object-position:inherit;pointer-events:none';
    entry.image.parentElement.append(entry.canvas);
  }
  if(entry.canvas.width!==width)entry.canvas.width=width;
  if(entry.canvas.height!==height)entry.canvas.height=height;
  entry.element.style.display='none';
  entry.canvas.style.display='block';
  const context=entry.canvas.getContext('2d');
  context.clearRect(0,0,width,height);
  context.drawImage(source,0,0);
}
function releaseDecoder(entry){
  entry.warming?.controller.abort();
  entry.warming=undefined;
  if(!entry.element.hasAttribute('src'))return;
  entry.element.removeAttribute('src');
  entry.element.load();
}
function warmDecoder(frame,options){
  let warm;
  let nextFrame=frame+options.lookAhead+1;
  for(const entry of videos){
    if(entry.frames[frame]!==null||entry.nativeFailed||!options.nativeSources.includes(entry.id))continue;
    for(let future=frame+1;future<Math.min(nextFrame,entry.frames.length);future++){
      if(entry.frames[future]?.side!=='after')continue;
      warm=entry;
      nextFrame=future;
      break;
    }
  }
  for(const entry of videos){
    if(entry.frames[frame]!==null)continue;
    if(entry===warm){
      if(entry.warming?.frame!==nextFrame){
        entry.warming?.controller.abort();
        startDecoder(entry);
        const controller=new AbortController();
        entry.warming={frame:nextFrame,controller};
        void seekVideo(entry.element,seconds(entry.frames[nextFrame].position),controller.signal).catch(()=>{});
      }
    }else releaseDecoder(entry);
    if(entry.canvas){entry.canvas.width=0;entry.canvas.height=0;}
  }
}
function pauseVideo(entry){
  entry.element.pause();
  entry.liveFrame=undefined;
}
async function preparePlayingSource(entry,frame,options,signal){
  const sample=entry.frames[frame];
  const next=entry.frames[frame+1];
  const rate=sample?.side==='after'&&next?.side==='after'
    ? (seconds(next.position)-seconds(sample.position))*${input.frameRate.numerator / input.frameRate.denominator} : 0;
  if(rate>=.25&&rate<=4&&options.nativeSources.includes(entry.id)&&!entry.nativeFailed){
    const element=entry.element;
    entry.warming?.controller.abort();
    entry.warming=undefined;
    startDecoder(entry);
    const time=seconds(sample.position);
    try{
      if(entry.liveFrame===undefined||element.seeking||Math.abs(element.currentTime-time)>.08){
        await seekVideo(element,time,signal);
      }
      signal.throwIfAborted();
      return {entry,video:true,rate,frame};
    }catch(error){
      signal.throwIfAborted();
      entry.nativeFailed=true;
      releaseDecoder(entry);
    }
  }
  pauseVideo(entry);
  return prepareSeekSource(entry,frame,options,signal);
}
function showPlayingSource(value){
  if(!value.video){showSeekSource(value);return;}
  const {entry,frame,rate}=value;
  const element=entry.element;
  if(entry.canvas)entry.canvas.style.display='none';
  element.style.display='block';
  if(Math.abs(element.playbackRate-rate)>.0001)element.playbackRate=rate;
  entry.liveFrame=frame;
  if(element.paused)void element.play().catch(()=>{
    if(entry.liveFrame!==undefined)entry.nativeFailed=true;
  });
}
async function presentFrame(frame,options,signal,playing){
  assertFrame(frame);
  const prepared=[];
  try{
    if(alphaVisualAssets.length)await prepareDrawableVisuals(element=>inFrame(spans(element),frame));
    const results=await Promise.allSettled([
      decodeImages(frame,signal),
      ...videos.map(async entry=>{
        const value=await (playing ? preparePlayingSource(entry,frame,options,signal) : prepareSeekSource(entry,frame,options,signal));
        if(value)prepared.push(value);
      })
    ]);
    signal.throwIfAborted();
    const failed=results.find(result=>result.status==='rejected');
    if(failed)throw failed.reason;
    showFrame(frame);
    for(const value of prepared)showPlayingSource(value);
    for(const {entry,spans:coverage} of seekEntries){
      if(!inFrame(coverage,frame))continue;
      if(!seekRenders.has(entry.id))seekRenders.set(entry.id,prepareRender(entry));
      const render=seekRenders.get(entry.id);
      if(render)renderEntry(render,frame);
    }
    warmDecoder(frame,options);
    await Promise.all(frameEvents(frame));
    await Promise.all([decodeImages(frame,signal),document.fonts.ready]);
    if(alphaMasks.length)await paintAlphaMasks(signal);
    if(!playing)await paint();
    signal.throwIfAborted();
    checkVisual();
  }finally{
    for(const value of prepared)value.release?.();
  }
}
window.__hypitFrameProgram={
  frameCount:${input.frameCount},prepare,
  pausePlayback(){for(const entry of videos)pauseVideo(entry);},
  seekFrame(frame,options,signal){return presentFrame(frame,options,signal,false);},
  playFrame(frame,options,signal){return presentFrame(frame,options,signal,true);},
  async applyFrame(frame){
    assertFrame(frame);
    showFrame(frame);
    for(const entry of renders)renderEntry(entry,frame);
    await Promise.all([...frameEvents(frame),...videos.map(entry=>drawSourceFrame(entry,frame))]);
    if(alphaMasks.length)await paintAlphaMasks();
    await paint();
    checkVisual();
  }
};`;
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
