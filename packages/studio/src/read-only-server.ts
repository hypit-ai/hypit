import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, relative } from "node:path";

import { probeMedia } from "@hypit/media-local/files";
import type { Plugin } from "vite";

import type { StudioLibraryView, StudioSnapshot } from "./shared.js";
import { readResultProjection, type ResultMaterial } from "./result-projection.js";
import { createStudioStoryboard, createStudioStoryboardSpan, createStudioWaveform, createStudioWaveformSpan } from "./storyboard.js";
import type { ServedFile } from "./material.js";

export type ReadOnlyStudioPluginOptions = {
  readonly source: string;
  readonly media: string;
  readonly result?: string;
  readonly workspaceRoot: string;
  readonly targets: readonly string[];
};

function mediaType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".mp4": return "video/mp4";
    case ".webm": return "video/webm";
    case ".mov": return "video/quicktime";
    case ".m4v": return "video/x-m4v";
    default: return "application/octet-stream";
  }
}

function byteRange(value: string | undefined, size: number): { readonly start: number; readonly end: number } | undefined {
  if (value === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (match === null || (match[1]!.length === 0 && match[2]!.length === 0) || size <= 0) {
    throw new RangeError("requested byte range is not satisfiable");
  }
  if (match[1]!.length === 0) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new RangeError("requested byte range is not satisfiable");
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2]!.length === 0 ? size - 1 : Math.min(size - 1, Number(match[2]));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    throw new RangeError("requested byte range is not satisfiable");
  }
  return { start, end };
}

function gcd(left: number, right: number): number {
  while (right !== 0) [left, right] = [right, left % right];
  return left;
}

function frameRate(value: number): { readonly numerator: number; readonly denominator: number } {
  const numerator = Math.max(1, Math.round((value || 30) * 1_000));
  const common = gcd(numerator, 1_000);
  return { numerator: numerator / common, denominator: 1_000 / common };
}

function previewDocument(rate: number): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000}
video{display:block;width:100%;height:100%;object-fit:contain;background:#000}
</style></head><body><video playsinline preload="auto" src="/__studio/read-only-media"></video><script>
const video=document.querySelector('video');
const fps=${JSON.stringify(rate)};
const ready=new Promise((resolve,reject)=>{
  if(video.readyState>=1)resolve();
  else{video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',reject,{once:true});}
});
const painted=()=>new Promise((resolve)=>{
  if(typeof video.requestVideoFrameCallback==='function')video.requestVideoFrameCallback(()=>resolve());
  else requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()));
});
const atFrame=(frame)=>Math.max(0,Math.min(video.duration||Infinity,frame/fps));
window.__hypitSeekFrame=async(frame)=>{
  await ready; video.pause(); const at=atFrame(frame);
  if(Math.abs(video.currentTime-at)>=0.001){
    await new Promise((resolve)=>{video.addEventListener('seeked',resolve,{once:true});video.currentTime=at;});
  }
  await painted();
  return true;
};
window.__hypitPlayFrame=async(frame)=>{
  await ready; const at=atFrame(frame);
  if(video.paused||Math.abs(video.currentTime-at)>.25)video.currentTime=at;
  await video.play().catch(()=>{}); return true;
};
window.__hypitSetMuted=async(muted)=>{video.muted=muted;return true;};
window.__hypitSetAdjustmentBypassed=()=>false;
ready.then(()=>parent.postMessage({type:'hypit-preview-ready'},'*')).catch(()=>{});
</script></body></html>`;
}

function json(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(`${JSON.stringify(value)}\n`);
}

function resultFile(material: ResultMaterial): ServedFile {
  return {
    mediaType: material.mediaType,
    size: material.size,
    async open(range) {
      return createReadStream(material.path, range === undefined
        ? undefined : { start: range.start, end: range.endExclusive - 1 });
    },
  };
}

/**
 * Present one explicit produced video through the normal Studio chrome. The
 * snapshot is deliberately sparse: it retains the Author Source, canvas,
 * transport and Inspector, while exposing no writable author objects.
 */
export function readOnlyStudioPlugin(options: ReadOnlyStudioPluginOptions): Plugin {
  if (!existsSync(options.source)) throw new Error(`Studio Source does not exist: ${options.source}`);
  if (!existsSync(options.media)) throw new Error(`Studio media does not exist: ${options.media}`);
  if (options.result !== undefined && !existsSync(options.result)) throw new Error(`Studio Result does not exist: ${options.result}`);
  const mediaStat = statSync(options.media);
  if (!mediaStat.isFile()) throw new Error(`Studio media is not a file: ${options.media}`);

  const sourceText = readFile(options.source, "utf8");
  const projection = options.result === undefined ? Promise.resolve(undefined) : sourceText.then(async (text) => await readResultProjection({
    path: options.result!,
    sourcePath: options.source,
    sourceText: text,
    workspaceRoot: options.workspaceRoot,
  }));
  const session = Promise.all([sourceText, probeMedia(options.media), projection]).then(async ([text, media, projected]) => {
    if (!media.hasVideo) throw new Error(`Studio media has no video stream: ${options.media}`);
    const rate = media.frameRate || 30;
    const sourcePath = relative(options.workspaceRoot, options.source);
    const timing = projected?.timeline ?? {
      frameRate: frameRate(rate),
      frameCount: Math.max(1, Math.ceil(media.duration * rate)),
      durationSec: media.duration,
    };
    const materials = new Map(projected?.materials ?? []);
    const storyboardSpans = new Map<string, { readonly startSec: number; readonly durationSec: number }>();
    const tracks = (projected?.tracks ?? []).map((track, trackIndex) => track.binding.facet === "audio" ? track : ({
      ...track,
      items: track.items.map((item, itemIndex) => {
        // This is a presentation derivative, not a content-addressed Result resource.
        // Keep its URL distinct when the projection algorithm changes so browsers cannot
        // reuse an older immutable storyboard generated for the same Track position.
        const id = `res_render_v2_${trackIndex + 1}_${itemIndex + 1}`;
        materials.set(id, { path: options.media, mediaType: mediaType(options.media), size: mediaStat.size });
        storyboardSpans.set(id, {
          startSec: item.startFrame / (timing.frameRate.numerator / timing.frameRate.denominator),
          durationSec: (item.endFrameExclusive - item.startFrame) / (timing.frameRate.numerator / timing.frameRate.denominator),
        });
        return { ...item, display: { ...item.display, layers: [{
          kind: "preview" as const,
          role: "content" as const,
          preview: { kind: "video" as const, source: { kind: "artifact" as const, resource: id } },
          layout: "storyboard" as const,
        }] } };
      }),
    }));
    const snapshot = {
      revision: 1,
      source: {
        path: sourcePath,
        text,
        readOnly: true,
        files: [{ path: sourcePath, text, language: "svml", role: "author", imports: [] }],
      },
      selection: { targets: options.targets },
      canvas: projected?.canvas ?? { width: media.width, height: media.height, clearColor: "#000000" },
      timeline: timing,
      tracks,
      temporalDomains: projected?.temporalDomains ?? [],
      preview: { kind: "html-program", srcdoc: previewDocument(timing.frameRate.numerator / timing.frameRate.denominator) },
    } satisfies StudioSnapshot;
    return { snapshot, materials, storyboardSpans };
  });
  const snapshot = session.then((value) => value.snapshot);
  const waveforms = new Map<string, Promise<Uint8Array>>();
  const storyboards = new Map<string, ReturnType<typeof createStudioStoryboard>>();

  return {
    name: "hypit-studio-read-only",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://studio.local");
        const path = url.pathname;
        if (path === "/__studio/session" && (request.method === "GET" || request.method === "HEAD")) {
          try { json(response, 200, await snapshot); }
          catch (error) { json(response, 500, { revision: 1, error: error instanceof Error ? error.message : String(error) }); }
          return;
        }
        if (path === "/__studio/library" && (request.method === "GET" || request.method === "HEAD")) {
          const section = url.searchParams.get("section");
          if (section !== "tasks" && section !== "artifacts") { json(response, 400, { error: "Choose tasks or artifacts." }); return; }
          json(response, 200, { section, environment: "read-only", tasks: [], artifacts: [] } satisfies StudioLibraryView);
          return;
        }
        if ((path === "/__studio/source" || path === "/__studio/mutation")
          && request.method !== "GET" && request.method !== "HEAD") {
          json(response, 405, { error: "This Studio session is read-only." });
          return;
        }
        const waveformResource = /^\/__studio\/waveform\/(res_[a-zA-Z0-9._:-]+)$/u.exec(path)?.[1];
        if (waveformResource !== undefined) {
          try {
            const material = (await session).materials.get(waveformResource);
            if (material === undefined || !/^(audio|video)\//u.test(material.mediaType)) {
              response.statusCode = 404; response.end(); return;
            }
            let pending = waveforms.get(waveformResource);
            if (pending === undefined) {
              pending = material.previewSpan === undefined
                ? createStudioWaveform(resultFile(material))
                : createStudioWaveformSpan(resultFile(material), material.previewSpan.startSec, material.previewSpan.durationSec);
              waveforms.set(waveformResource, pending);
            }
            const bytes = await pending;
            response.statusCode = 200;
            response.setHeader("content-type", "image/png");
            response.setHeader("cache-control", "no-store");
            if (request.method === "HEAD") response.end(); else response.end(Buffer.from(bytes));
          } catch (error) {
            waveforms.delete(waveformResource);
            json(response, 500, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        const storyboardResource = /^\/__studio\/storyboard\/(res_[a-zA-Z0-9._:-]+)$/u.exec(path)?.[1];
        if (storyboardResource !== undefined) {
          try {
            const value = await session;
            const material = value.materials.get(storyboardResource);
            if (material === undefined || !material.mediaType.startsWith("video/")) {
              response.statusCode = 404; response.end(); return;
            }
            let pending = storyboards.get(storyboardResource);
            if (pending === undefined) {
              const span = value.storyboardSpans.get(storyboardResource);
              pending = span === undefined
                ? createStudioStoryboard(resultFile(material))
                : createStudioStoryboardSpan(resultFile(material), span.startSec, span.durationSec);
              storyboards.set(storyboardResource, pending);
            }
            const storyboard = await pending;
            response.statusCode = 200;
            response.setHeader("content-type", "image/png");
            response.setHeader("cache-control", "no-store");
            response.setHeader("x-hypit-storyboard-count", String(storyboard.count));
            response.setHeader("x-hypit-storyboard-columns", String(storyboard.columns));
            response.setHeader("x-hypit-storyboard-rows", String(storyboard.rows));
            response.setHeader("x-hypit-storyboard-tile-width", String(storyboard.tileWidth));
            response.setHeader("x-hypit-storyboard-tile-height", String(storyboard.tileHeight));
            response.setHeader("x-hypit-storyboard-sample-fps", String(storyboard.sampleFps));
            if (request.method === "HEAD") response.end(); else response.end(Buffer.from(storyboard.bytes));
          } catch (error) {
            storyboards.delete(storyboardResource);
            json(response, 500, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        const materialResource = /^\/__studio\/material\/(res_[a-zA-Z0-9._:-]+)$/u.exec(path)?.[1];
        if (materialResource !== undefined) {
          const material = (await session).materials.get(materialResource);
          if (material === undefined) { response.statusCode = 404; response.end(); return; }
          try {
            const range = byteRange(request.headers.range, material.size);
            response.statusCode = range === undefined ? 200 : 206;
            response.setHeader("content-type", material.mediaType);
            response.setHeader("accept-ranges", "bytes");
            response.setHeader("cache-control", "no-store");
            response.setHeader("content-length", String(range === undefined ? material.size : range.end - range.start + 1));
            if (range !== undefined) response.setHeader("content-range", `bytes ${range.start}-${range.end}/${material.size}`);
            if (request.method === "HEAD") response.end();
            else createReadStream(material.path, range === undefined ? undefined : { start: range.start, end: range.end }).pipe(response);
          } catch (error) {
            response.statusCode = 416;
            response.setHeader("content-range", `bytes */${material.size}`);
            response.end(error instanceof Error ? error.message : String(error));
          }
          return;
        }
        if (path !== "/__studio/read-only-media") { next(); return; }
        const size = mediaStat.size;
        response.setHeader("accept-ranges", "bytes");
        response.setHeader("content-type", mediaType(options.media));
        response.setHeader("cache-control", "no-store");
        try {
          const range = byteRange(request.headers.range, size);
          if (range === undefined) {
            response.statusCode = 200;
            response.setHeader("content-length", size);
            if (request.method === "HEAD") response.end();
            else createReadStream(options.media).pipe(response);
            return;
          }
          response.statusCode = 206;
          response.setHeader("content-range", `bytes ${range.start}-${range.end}/${size}`);
          response.setHeader("content-length", range.end - range.start + 1);
          if (request.method === "HEAD") response.end();
          else createReadStream(options.media, range).pipe(response);
        } catch (error) {
          response.statusCode = 416;
          response.setHeader("content-range", `bytes */${size}`);
          response.end(error instanceof Error ? error.message : String(error));
        }
      });
    },
  };
}
