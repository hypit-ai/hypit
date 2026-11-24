import { randomUUID } from "node:crypto";
import { materializeHtmlProgram, type HtmlProgram } from "@hypit/html-program";
import type { HtmlFrameCapture, HtmlFrameExecutor, HtmlSourceFrames } from "@hypit/html-video";
import type { MediaResource } from "@hypit/media";
import { renderAudioProgramBufferLocally, type LocalMediaToolchainOptions } from "@hypit/media-local";
import type { NleProject } from "@hypit/nle";
import { prepareNleCompilation, type PreparedNleCompilation } from "@hypit/nle-delivery";
import type { ProjectHost } from "@hypit/project";
import { compareExactTemporalValues, type TemporalRate } from "@hypit/temporal/algebra";
import { programmeAudioFrames, programmeAudioSampleRate } from "./programme-transport.js";
import type { NleStudioProgrammeProjection } from "./protocol.js";
import { studioFrameTime } from "./timeline-time.js";

type Programme = {
  readonly key: string;
  readonly revision: number;
  readonly projection: NleStudioProgrammeProjection;
  readonly controller: AbortController;
  readonly snapshot: NleProject;
  readonly rate: TemporalRate;
  compilation?: Promise<PreparedNleCompilation>;
  program?: Promise<HtmlProgram>;
  readonly placementElements: Map<string, string[]>;
  audio?: ReturnType<PreparedNleCompilation["compileAudio"]> | null;
  sources?: Promise<HtmlSourceFrames>;
  rendered?: {
    capture?: Promise<HtmlFrameCapture>;
    tail: Promise<void>;
    readonly frames: Map<number, Uint8Array>;
    bytes: number;
  };
};

const renderedFrameCacheBytes = 16 * 1024 * 1024;

export function previewCanvas(source: { readonly width: number; readonly height: number }, maximumEdge = 960) {
  const scale = Math.min(1, maximumEdge / Math.max(source.width, source.height));
  const even = (value: number) => Math.max(2, Math.floor(value * scale / 2) * 2);
  return { width: even(source.width), height: even(source.height), background: "#15161b" };
}

function programmeDriver(generation: string, program: HtmlProgram, placements: ReadonlyMap<string, readonly string[]>) {
  const { width, height } = program.canvas;
  const nativeSources = program.videoSources.filter(source => source.streamIndex === 0
    && source.presentationStart.ticks === "0" && source.reconstruction === undefined
    && source.interpretation.rotationDegrees === 0
    && source.interpretation.sampleAspectRatio.denominator === source.interpretation.sampleAspectRatio.numerator
    && source.interpretation.picture.alphaMode === "opaque"
    && ["video/mp4", "video/webm", "video/ogg"].includes(source.resource.mediaType)).map(source => source.id);
  const lookAhead = Math.ceil(2 * program.frameRate.numerator / program.frameRate.denominator);
  return `<script>
(() => {
  const generation=${JSON.stringify(generation)};
  const options={nativeSources:${JSON.stringify(nativeSources)},lookAhead:${lookAhead},frameBase:'./source'};
  const root=document.getElementById('hypit-program');
  const alphaMask=root.querySelector('canvas[data-hypit-alpha-mask]');
  const player=window.__hypitFrameProgram;
  const placements=new Map(${JSON.stringify([...placements])});
  let useHostFrame=alphaMask!==null&&(typeof alphaMask.requestPaint!=='function'
    ||typeof globalThis.CanvasRenderingContext2D?.prototype.drawElementImage!=='function');
  const drafted=new Set();
  const placementElements=new Map();
  for(const element of root.querySelectorAll('[data-hypit-element-id]')){
    placementElements.set(element.dataset.hypitElementId,element);
  }
  const draftPlacement=draft=>{
    for(const element of drafted)element.style.removeProperty('transform');
    drafted.clear();
    if(!draft||useHostFrame)return;
    const {initial,frame,items}=draft;
    if(!initial||!frame||!Array.isArray(items)||![initial,frame].every(value=>
      [value.x,value.y,value.width,value.height].every(Number.isFinite)&&value.width>0&&value.height>0))return;
    const sx=frame.width/initial.width,sy=frame.height/initial.height;
    const tx=frame.x-initial.x*sx,ty=frame.y-initial.y*sy;
    for(const item of items)for(const id of placements.get(item)??[]){
      const element=placementElements.get(id);
      if(!element||element.closest('canvas[data-hypit-alpha-mask]'))continue;
      element.style.transform='matrix('+sx+',0,0,'+sy+','+tx+','+ty+')';
      drafted.add(element);
    }
  };
  let rendered;
  for(const element of [document.documentElement,document.body]){
    element.style.width='100%';element.style.height='100%';
  }
  root.style.cssText+=';width:${width}px;height:${height}px;transform-origin:0 0';
  const fit=()=>{
    const scale=Math.min(innerWidth/${width},innerHeight/${height});
    const x=(innerWidth-${width}*scale)/2,y=(innerHeight-${height}*scale)/2;
    root.style.transform='translate('+x+'px,'+y+'px) scale('+scale+')';
    if(rendered)rendered.style.transform=root.style.transform;
  };
  fit();addEventListener('resize',fit);
  async function presentHostFrame(frame,signal){
    const response=await fetch('./frame/'+frame+'.png',{signal});
    if(!response.ok){
      const issue=await response.json().catch(()=>undefined);
      throw new Error(typeof issue?.error==='string'?issue.error:'无法准备节目画面。');
    }
    const url=URL.createObjectURL(await response.blob());
    const image=new Image();
    try{
      image.src=url;
      await image.decode();
      signal.throwIfAborted();
      image.alt='';
      image.style.cssText='position:absolute;left:0;top:0;width:${width}px;height:${height}px;transform-origin:0 0';
      image.style.transform=root.style.transform;
      root.after(image);
      root.style.display='none';
      if(rendered){URL.revokeObjectURL(rendered.src);rendered.remove();}
      rendered=image;
    }catch(error){URL.revokeObjectURL(url);throw error;}
  }
  let pending, active, sequence=0;
  const report=value=>parent.postMessage({...value,generation},location.origin);
  async function presentLatest(){
    if(active||!pending)return;
    const request=pending;
    pending=undefined;
    const controller=new AbortController();
    active={controller,request};
    try{
      const frame=Math.max(0,Math.min(request.frame,${program.frameCount - 1}));
      if(!useHostFrame){
        const signal=alphaMask===null?controller.signal:AbortSignal.any([controller.signal,AbortSignal.timeout(2500)]);
        try{
          const present=request.kind==='programme-play'?player.playFrame:player.seekFrame;
          await present(frame,options,signal);
        }catch(error){
          if(controller.signal.aborted)throw error;
          useHostFrame=true;
          player.pausePlayback();
        }
      }
      if(useHostFrame)await presentHostFrame(frame,controller.signal);
      if(request.kind==='programme-seek'&&!controller.signal.aborted)report({kind:'programme-presented',sequence:request.sequence,frame,
        frameCount:player.frameCount,transport:request.transport});
    }catch(error){
      if(!controller.signal.aborted)report({kind:'programme-error',sequence:request.sequence,
        transport:request.transport,message:String(error.message??error)});
    }finally{
      active=undefined;
      void presentLatest();
    }
  }
  addEventListener('message',event=>{
    const request=event.data;
    if(event.source!==parent||event.origin!==location.origin||request?.generation!==generation)return;
    if(request.kind==='programme-placement-draft'){draftPlacement(request.draft);return;}
    if((request.kind!=='programme-seek'&&request.kind!=='programme-play')
      ||!Number.isSafeInteger(request.sequence)||request.sequence<=sequence
      ||!Number.isSafeInteger(request.frame))return;
    sequence=request.sequence;
    pending=request;
    if(request.kind==='programme-seek')player.pausePlayback();
    if(active&&(request.kind!=='programme-play'||active.request.kind!=='programme-play'
      ||active.request.transport!==request.transport))active.controller.abort();
    void presentLatest();
  });
})();
</script>`;
}

/** One Studio session's Picture documents and their handoff to the browser. */
export class NleStudioProgramme {
  #current: Programme | undefined;
  #previous: Programme | undefined;
  #active: Programme | undefined;
  #revision = 0;
  readonly #retiring = new Set<Promise<unknown>>();

  constructor(readonly host: ProjectHost, readonly documentPath: string, readonly executor: HtmlFrameExecutor,
    readonly mediaTools?: LocalMediaToolchainOptions) {}

  select(key: string, composition: string, snapshot: NleProject, rate: TemporalRate): NleStudioProgrammeProjection {
    if (this.#current?.key === key) return this.#current.projection;
    if (this.#current !== undefined && this.#current !== this.#active) {
      this.#retire(this.#previous);
      this.#previous = this.#current;
    }
    const generation = randomUUID();
    const projection = { generation, composition, document: `api/programme/${generation}/index.html` };
    this.#current = { key, revision: ++this.#revision, projection, snapshot, rate, controller: new AbortController(), placementElements: new Map() };
    return projection;
  }

  clear(): void {
    for (const value of new Set([this.#current, this.#previous, this.#active])) this.#retire(value);
    this.#current = undefined;
    this.#previous = undefined;
    this.#active = undefined;
  }

  async close(): Promise<void> {
    this.clear();
    await Promise.allSettled(this.#retiring);
  }

  #retire(value: Programme | undefined): void {
    if (value === undefined) return;
    value.controller.abort();
    const closed = (async () => {
      await value.program?.catch(() => undefined);
      const [sources, capture] = await Promise.all([
        value.sources?.catch(() => undefined), value.rendered?.capture?.catch(() => undefined),
      ]);
      await Promise.all([sources?.close(), capture?.close()]);
    })();
    this.#retiring.add(closed);
    void closed.finally(() => this.#retiring.delete(closed)).catch(() => undefined);
  }

  activate(generation: string): void {
    const next = [this.#current, this.#previous].find(value => value?.projection.generation === generation);
    if (next === undefined || next.revision <= (this.#active?.revision ?? 0)) return;
    this.#retire(this.#active);
    this.#active = next;
    if (this.#previous !== next) this.#retire(this.#previous);
    this.#previous = undefined;
  }

  #find(generation: string): Programme {
    const value = [this.#current, this.#previous, this.#active].find(entry => entry?.projection.generation === generation);
    if (value === undefined) throw new Error("Studio Programme preview is no longer available.");
    return value;
  }

  #prepare(value: Programme): Promise<HtmlProgram> {
    const { snapshot, rate, projection: { composition }, controller: { signal } } = value;
    const canvas = previewCanvas(snapshot.compositions.find(entry => entry.id === composition)!.canvas);
    value.compilation ??= prepareNleCompilation({ host: this.host, document: this.documentPath, snapshot, composition, signal });
    return value.program ??= value.compilation.then(compilation => {
      signal.throwIfAborted();
      return compilation.compilePicture({ frameRate: rate, canvas, onItemPlacement(item, element) {
        const elements = value.placementElements.get(item);
        if (elements === undefined) value.placementElements.set(item, [element]);
        else elements.push(element);
      } });
    });
  }

  async document(generation: string): Promise<string> {
    const value = this.#find(generation);
    const program = await this.#prepare(value);
    value.controller.signal.throwIfAborted();
    const html = materializeHtmlProgram(program, (_resource, id) => `./assets/${encodeURIComponent(id)}`);
    const bodyEnd = html.lastIndexOf("</body>");
    return html.slice(0, bodyEnd) + programmeDriver(generation, program, value.placementElements) + html.slice(bodyEnd);
  }

  async resource(generation: string, id: string): Promise<MediaResource> {
    const value = this.#find(generation);
    const program = await this.#prepare(value);
    const artifact = program.artifacts.find(entry => entry.id === id && entry.usage.kind !== "never");
    if (artifact === undefined) throw new Error("Studio Programme resource is unavailable.");
    return artifact.resource;
  }

  async audioBuffer(generation: string, frame: number, requestSignal: AbortSignal): Promise<Uint8Array | undefined> {
    const value = this.#find(generation);
    const signal = AbortSignal.any([value.controller.signal, requestSignal]);
    const picture = await this.#prepare(value);
    signal.throwIfAborted();
    if (frame < 0 || frame >= picture.frameCount) throw new Error("Studio Programme audio frame is outside the Programme.");
    const compilation = await value.compilation!;
    if (value.audio === undefined) value.audio = compilation.compileAudio({ sampleRate: programmeAudioSampleRate, channels: 2 }) ?? null;
    if (value.audio === null) return undefined;
    if (this.mediaTools === undefined) throw new Error("Studio Programme audio playback is unavailable.");
    const { rate } = value;
    const start = studioFrameTime(frame, rate);
    const desired = studioFrameTime(frame + programmeAudioFrames(rate.numerator / rate.denominator), rate);
    const end = compareExactTemporalValues(desired, compilation.duration) > 0 ? compilation.duration : desired;
    return await renderAudioProgramBufferLocally({ program: value.audio, range: { start, end }, tools: this.mediaTools, signal });
  }

  async sourceFrame(generation: string, source: string, frame: number, signal: AbortSignal): Promise<Uint8Array> {
    const value = this.#find(generation);
    const program = await this.#prepare(value);
    value.controller.signal.throwIfAborted();
    if (program.videoSources.find(entry => entry.id === source)?.sourceFrames[frame] == null) {
      throw new Error("Studio Programme source has no sample at this frame.");
    }
    const open = this.executor.openSourceFrames;
    if (open === undefined) throw new Error("Studio Programme exact source frames are unavailable.");
    const reader = await (value.sources ??= open.call(this.executor, program, value.controller.signal));
    return await reader.read(source, frame, signal);
  }

  async renderedFrame(generation: string, frame: number, requestSignal: AbortSignal): Promise<Uint8Array> {
    const value = this.#find(generation);
    const signal = AbortSignal.any([value.controller.signal, requestSignal]);
    const program = await this.#prepare(value);
    signal.throwIfAborted();
    if (!Number.isSafeInteger(frame) || frame < 0 || frame >= program.frameCount) {
      throw new Error("Studio Programme frame is outside the Programme.");
    }
    const rendered = value.rendered ??= { tail: Promise.resolve(), frames: new Map(), bytes: 0 };
    const task = rendered.tail.then(async () => {
      signal.throwIfAborted();
      const cached = rendered.frames.get(frame);
      if (cached !== undefined) {
        rendered.frames.delete(frame);
        rendered.frames.set(frame, cached);
        return cached;
      }
      const picture = { alpha: "opaque" as const, matte: program.canvas.background };
      let bytes: Uint8Array;
      if (this.executor.openCapture === undefined) {
        bytes = await this.executor.capture({ program, picture, frames: [frame] }, value.controller.signal);
      } else {
        const capture = await (rendered.capture ??= this.executor.openCapture({ program, picture }, value.controller.signal)
          .catch(error => { delete rendered.capture; throw error; }));
        signal.throwIfAborted();
        try {
          const [sample] = await capture.captureFrames([frame]);
          if (sample === undefined) throw new Error("Studio Programme renderer returned no frame.");
          bytes = sample;
        } catch (error) {
          delete rendered.capture;
          await capture.close().catch(() => undefined);
          throw error;
        }
      }
      if (bytes.byteLength <= renderedFrameCacheBytes) {
        rendered.frames.set(frame, bytes);
        rendered.bytes += bytes.byteLength;
        for (const [oldest, data] of rendered.frames) {
          if (rendered.bytes <= renderedFrameCacheBytes) break;
          rendered.frames.delete(oldest);
          rendered.bytes -= data.byteLength;
        }
      }
      return bytes;
    });
    rendered.tail = task.then(() => undefined, () => undefined);
    const bytes = await task;
    signal.throwIfAborted();
    return bytes;
  }
}
