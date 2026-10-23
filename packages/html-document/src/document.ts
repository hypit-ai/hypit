import { parseHTML } from "linkedom";
import type { Composition } from "@hypit/composition";
import { assertHtmlProgram, compileHtmlProgram, materializeHtmlProgram } from "@hypit/html-program";
import type { HtmlProgram, ResourceUrlResolver } from "@hypit/html-program";
import { injectHtmlPlayback, materializePlaybackAudio } from "@hypit/html-playback";
import { compileAudioProgram, verifyAudioProgram } from "@hypit/media-operations";
import type { AudioProgram } from "@hypit/media-operations";
import type { Timeline } from "@hypit/timeline";
import { assertBlobRef } from "@hypit/hypit/protocol";
import type { BlobRef } from "@hypit/hypit/protocol";

export type HtmlDocument = {
  readonly format: "hypit.html-document@1";
  readonly program: HtmlProgram;
  readonly audio: AudioProgram;
  /** Structural pairs of document-local identities and Result-rebindable artifacts. */
  readonly resources: {
    readonly artifacts: readonly { readonly id: string; readonly artifact: BlobRef }[];
    readonly surfaces: readonly { readonly id: string; readonly artifact: BlobRef }[];
  };
};

export type HtmlDocumentPlaybackOptions = {
  readonly autoplay?: boolean;
  readonly loop?: boolean;
  readonly muted?: boolean;
  readonly responsive?: boolean;
};

export function compileHtmlDocument(composition: Composition, timeline: Timeline): HtmlDocument {
  const program = compileHtmlProgram(composition, timeline);
  const audio = compileAudioProgram(composition, timeline);
  return {
    format: "hypit.html-document@1",
    program,
    audio,
    resources: {
      artifacts: program.artifacts.map(({ artifact }) => ({ id: artifact.resource, artifact })),
      surfaces: program.surfaces.map(({ artifact }) => ({ id: artifact.resource, artifact })),
    },
  };
}

/**
 * Result storage recursively rebinds BlobRefs, while compiled HTML deliberately
 * addresses document-local resource identities. Reconstruct those identities
 * at materialization time without a repository, reverse index or global table.
 */
function boundProgram(document: HtmlDocument): HtmlProgram {
  const resources = document.resources;
  if (resources === null || typeof resources !== "object"
    || !Array.isArray(resources.artifacts) || !Array.isArray(resources.surfaces)) {
    throw new Error("HTML document material pairs are required");
  }
  const restore = (
    artifacts: readonly BlobRef[],
    bindings: readonly { readonly id: string; readonly artifact: BlobRef }[],
    label: string,
  ): BlobRef[] => {
    if (artifacts.length !== bindings.length) throw new Error(`HTML document ${label} pairs are incomplete`);
    const ids = new Set<string>();
    return artifacts.map((artifact, index) => {
      const binding = bindings[index];
      if (typeof binding?.id !== "string" || binding.id.length === 0 || ids.has(binding.id)) {
        throw new Error(`HTML document ${label} repeats or omits a local identity`);
      }
      assertBlobRef(binding.artifact, `HTML document ${label} ${index}`);
      assertBlobRef(artifact, `HTML document ${label} value ${index}`);
      if (artifact.resource !== binding.artifact.resource || artifact.size !== binding.artifact.size
        || artifact.mediaType !== binding.artifact.mediaType) {
        throw new Error(`HTML document ${label} pair ${index} disagrees after material rebinding`);
      }
      ids.add(binding.id);
      return { ...artifact, resource: binding.id as BlobRef["resource"] };
    });
  };
  const artifacts = restore(document.program.artifacts.map((entry) => entry.artifact), resources.artifacts, "Artifact");
  const surfaces = restore(document.program.surfaces.map((surface) => surface.artifact), resources.surfaces, "Surface");
  return {
    ...document.program,
    artifacts: document.program.artifacts.map((entry, index) => ({ ...entry, artifact: artifacts[index]! })),
    surfaces: document.program.surfaces.map((surface, index) => ({ ...surface, artifact: surfaces[index]! })),
  };
}

export function assertHtmlDocument(value: unknown): asserts value is HtmlDocument {
  if (value === null || typeof value !== "object"
    || (value as HtmlDocument).format !== "hypit.html-document@1") {
    throw new Error("Unsupported HTML document format");
  }
  const document = value as HtmlDocument;
  const program = boundProgram(document);
  assertHtmlProgram(program);
  verifyAudioProgram(document.audio);
  if (program.frameCount !== document.audio.frameCount
    || program.frameRate.numerator !== document.audio.frameRate.numerator
    || program.frameRate.denominator !== document.audio.frameRate.denominator) {
    throw new Error("HTML picture and sound must use the same frame clock");
  }
}

function renderDocumentProgram(
  program: HtmlProgram,
  audio: AudioProgram,
  resolvePicture: ResourceUrlResolver,
  resolveAudio: ResourceUrlResolver,
): string {
  assertHtmlProgram(program);
  verifyAudioProgram(audio);
  const html = materializeHtmlProgram(program, resolvePicture);
  return injectHtmlPlayback(html, materializePlaybackAudio(audio, resolveAudio));
}

/** Produce a browser page. Hosts resolve material to HTTP, relative or embedded URLs. */
export function materializeHtmlDocument(
  document: HtmlDocument,
  resolve: ResourceUrlResolver,
  options: HtmlDocumentPlaybackOptions = {},
): string {
  assertHtmlDocument(document);
  const program = boundProgram(document);
  const materials = new Map(document.resources.artifacts.map((binding) => [binding.id, binding.artifact]));
  const rendered = renderDocumentProgram(
    program,
    document.audio,
    (artifact) => {
      const material = materials.get(artifact.resource);
      if (material === undefined) throw new Error("HTML document picture material has no structural pair");
      return resolve(material);
    },
    resolve,
  );
  const { document: page } = parseHTML(rendered);
  const scripts = Array.from(page.querySelectorAll("script")).map((script) => {
    const source = script.textContent ?? "";
    script.remove();
    return source;
  });
  const html = page.toString();
  const settings = JSON.stringify({
    autoplay: options.autoplay ?? true,
    loop: options.loop ?? true,
    muted: options.muted ?? true,
    responsive: options.responsive ?? true,
  });
  const driver = `<script>
(() => {
  const options = ${settings};
  const count = ${program.frameCount};
  const fps = ${program.frameRate.numerator}/${program.frameRate.denominator};
  let frame = 0, playing = false, request, generation = 0, started, lastReport = 0;
  function report(force = false) {
    if (window.parent === window) return;
    const now = performance.now();
    if (!force && now - lastReport < 100) return;
    lastReport = now;
    window.parent.postMessage({type:'hypit.html-document.state@1',frame,frameCount:count,frameRate:fps,playing}, '*');
  }
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  function pause() {
    playing = false; generation++; cancelAnimationFrame(request);
    return ready.then(async () => { await window.__hypitSeekFrame(frame); report(true); });
  }
  async function play() {
    await ready;
    if (playing) return;
    playing = true; started = performance.now() - frame * 1000 / fps;
    report(true);
    const current = ++generation;
    async function tick(now) {
      if (!playing || generation !== current) return;
      const elapsed = Math.floor((now - started) * fps / 1000);
      frame = options.loop ? elapsed % count : Math.min(elapsed, count - 1);
      try { await window.__hypitPlayFrame(frame); }
      catch (error) {
        playing = false;
        window.dispatchEvent(new CustomEvent('hypit-playback-error', {detail: error}));
        return;
      }
      if (!playing || generation !== current) return;
      report();
      if (!options.loop && elapsed >= count - 1) { await pause(); return; }
      request = requestAnimationFrame(tick);
    }
    request = requestAnimationFrame(tick);
  }
  window.__hypitDocument = {
    ready, play, pause,
    get frame() { return frame; }, get playing() { return playing; },
    async seekFrame(value) {
      if (!Number.isSafeInteger(value) || value < 0 || value >= count) {
        throw new RangeError('Frame outside HTML document');
      }
      await pause(); frame = value; await window.__hypitSeekFrame(frame); report(true);
    },
    async setMuted(value) { await ready; await window.__hypitSetMuted(value); }
  };
  let commands = Promise.resolve();
  window.addEventListener('message', event => {
    if (event.source !== window.parent || window.parent === window
      || event.data?.type !== 'hypit.html-document.command@1') return;
    const {action,frame:target,muted} = event.data;
    commands = commands.then(async () => {
      await ready;
      if (action === 'play') await play();
      else if (action === 'pause') await pause();
      else if (action === 'seek') await window.__hypitDocument.seekFrame(target);
      else if (action === 'mute') await window.__hypitDocument.setMuted(muted);
      else if (action === 'state') report(true);
    }).catch(error => window.parent.postMessage({
      type:'hypit.html-document.error@1', message:String(error)
    }, '*'));
  });
  window.addEventListener('load', async () => {
    try {
      await document.fonts.ready;
      await new Promise(requestAnimationFrame);
      ${scripts.join("\n")}
      await window.__hypitFrameProgram.prepare();
      await window.__hypitFrameReady;
      await window.__hypitSetMuted(options.muted);
      if (options.responsive) {
        const root = document.querySelector('[data-hypit-program-root]');
        function resize() {
          const scale = Math.min(innerWidth/${program.canvas.width}, innerHeight/${program.canvas.height});
          Object.assign(root.style, {
            position:'absolute', transformOrigin:'top left', transform:'scale('+scale+')',
            left:((innerWidth-${program.canvas.width}*scale)/2)+'px',
            top:((innerHeight-${program.canvas.height}*scale)/2)+'px'
          });
        }
        new ResizeObserver(resize).observe(document.documentElement); resize();
      }
      readyResolve(); report(true);
      if (options.autoplay) await play();
    } catch (error) { readyReject(error); }
  }, {once:true});
})();
</script>`;
  return html.replace("</body>", () => driver + "</body>");
}
