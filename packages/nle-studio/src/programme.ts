import { randomUUID } from "node:crypto";
import { materializeHtmlProgram, type HtmlProgram } from "@hypit/html-program";
import type { HtmlFrameExecutor, HtmlSourceFrames } from "@hypit/html-video";
import type { MediaResource } from "@hypit/media";
import { renderAudioProgramBufferLocally, type LocalMediaToolchainOptions } from "@hypit/media-local";
import type { NleProject } from "@hypit/nle";
import { prepareNleCompilation, type PreparedNleCompilation } from "@hypit/nle-delivery";
import type { ProjectHost } from "@hypit/project";
import { compareExactTemporalValues, type TemporalRate } from "@hypit/temporal/algebra";
import { programmeAudioFrames, programmeAudioSampleRate } from "./programme-transport.js";
import type { NleStudioProgrammeProjection } from "./protocol.js";
import { studioFrameTime } from "./timeline-planning.js";

type Programme = {
  readonly key: string;
  readonly revision: number;
  readonly projection: NleStudioProgrammeProjection;
  readonly controller: AbortController;
  readonly snapshot: NleProject;
  readonly rate: TemporalRate;
  compilation?: Promise<PreparedNleCompilation>;
  program?: Promise<HtmlProgram>;
  audio?: ReturnType<PreparedNleCompilation["compileAudio"]> | null;
  sources?: Promise<HtmlSourceFrames>;
};

export function previewCanvas(source: { readonly width: number; readonly height: number }, maximumEdge = 960) {
  const scale = Math.min(1, maximumEdge / Math.max(source.width, source.height));
  const even = (value: number) => Math.max(2, Math.floor(value * scale / 2) * 2);
  return { width: even(source.width), height: even(source.height), background: "#15161b" };
}

function programmeDriver(generation: string, program: HtmlProgram) {
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
  for(const element of [document.documentElement,document.body]){
    element.style.width='100%';element.style.height='100%';
  }
  root.style.cssText+=';width:${width}px;height:${height}px;transform-origin:0 0';
  const fit=()=>{
    const scale=Math.min(innerWidth/${width},innerHeight/${height});
    const x=(innerWidth-${width}*scale)/2,y=(innerHeight-${height}*scale)/2;
    root.style.transform='translate('+x+'px,'+y+'px) scale('+scale+')';
  };
  fit();addEventListener('resize',fit);
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
      const player=window.__hypitFrameProgram;
      if(request.kind==='programme-play')await player.playFrame(frame,options,controller.signal);
      else{
        await player.seekFrame(frame,options,controller.signal);
        if(!controller.signal.aborted)report({kind:'programme-presented',sequence:request.sequence,frame,
          frameCount:player.frameCount,transport:request.transport});
      }
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
    if(event.source!==parent||event.origin!==location.origin
      ||(request?.kind!=='programme-seek'&&request?.kind!=='programme-play')
      ||request.generation!==generation||!Number.isSafeInteger(request.sequence)||request.sequence<=sequence
      ||!Number.isSafeInteger(request.frame))return;
    sequence=request.sequence;
    pending=request;
    if(request.kind==='programme-seek')window.__hypitFrameProgram.pausePlayback();
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
    this.#current = { key, revision: ++this.#revision, projection, snapshot, rate, controller: new AbortController() };
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
      const frames = await value.sources?.catch(() => undefined);
      await frames?.close();
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
    return value.program ??= value.compilation
      .then(compilation => { signal.throwIfAborted(); return compilation.compilePicture({ frameRate: rate, canvas }); });
  }

  async document(generation: string): Promise<string> {
    const value = this.#find(generation);
    const program = await this.#prepare(value);
    value.controller.signal.throwIfAborted();
    const html = materializeHtmlProgram(program, (_resource, id) => `./assets/${encodeURIComponent(id)}`);
    const bodyEnd = html.lastIndexOf("</body>");
    return html.slice(0, bodyEnd) + programmeDriver(generation, program) + html.slice(bodyEnd);
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
}
