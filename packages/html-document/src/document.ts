import { parseHTML } from "linkedom";
import { assertHtmlProgram, materializeHtmlProgram } from "@hypit/html-program";
import type { HtmlProgram, ResourceUrlResolver } from "@hypit/html-program";
import { injectHtmlPlayback, lowerPlaybackAudio } from "@hypit/html-playback";
import type { PlaybackResourceUrlResolver } from "@hypit/html-playback";
import { verifyAudioProgram } from "@hypit/audio-program";
import type { AudioProgram } from "@hypit/audio-program";
import { compareExactTemporalValues, exactTemporalValueFromFrames } from "@hypit/temporal";

export type HtmlDocument = {
  readonly format: "hypit.html-document@1";
  readonly program: HtmlProgram;
  readonly audio: AudioProgram;
};

export type HtmlDocumentPlaybackOptions = {
  readonly autoplay?: boolean;
  readonly loop?: boolean;
  readonly muted?: boolean;
  readonly responsive?: boolean;
};

export function compileHtmlDocument(program: HtmlProgram, audio: AudioProgram): HtmlDocument {
  assertHtmlProgram(program);
  verifyAudioProgram(audio);
  return {
    format: "hypit.html-document@1",
    program: structuredClone(program),
    audio: structuredClone(audio),
  };
}

export function assertHtmlDocument(value: unknown): asserts value is HtmlDocument {
  if (value === null || typeof value !== "object"
    || (value as HtmlDocument).format !== "hypit.html-document@1") {
    throw new Error("Unsupported HTML document format");
  }
  const document = value as HtmlDocument;
  const program = document.program;
  assertHtmlProgram(program);
  verifyAudioProgram(document.audio);
  if (compareExactTemporalValues(
    exactTemporalValueFromFrames(program.frameCount, { frameRate: program.frameRate }),
    document.audio.domain.duration,
  ) !== 0) {
    throw new Error("HTML picture and sound must cover the same exact duration");
  }
}

function renderDocumentProgram(
  program: HtmlProgram,
  audio: AudioProgram,
  resolvePicture: ResourceUrlResolver,
  resolveAudio: PlaybackResourceUrlResolver,
): string {
  assertHtmlProgram(program);
  verifyAudioProgram(audio);
  const html = materializeHtmlProgram(program, resolvePicture);
  return injectHtmlPlayback(html, lowerPlaybackAudio(audio, resolveAudio), program);
}

/** Produce a browser page. Hosts resolve material to HTTP, relative or embedded URLs. */
export function materializeHtmlDocument(
  document: HtmlDocument,
  resolve: PlaybackResourceUrlResolver,
  options: HtmlDocumentPlaybackOptions = {},
): string {
  assertHtmlDocument(document);
  const program = document.program;
  const rendered = renderDocumentProgram(
    program,
    document.audio,
    (artifact) => resolve(artifact),
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
  let frame = 0, playing = false, request, generation = 0, started, lastReport = 0, commandId = 0;
  function report(force = false) {
    if (window.parent === window) return;
    const now = performance.now();
    if (!force && now - lastReport < 100) return;
    lastReport = now;
    window.parent.postMessage({type:'hypit.html-document.state@1',frame,frameCount:count,frameRate:fps,playing,commandId}, '*');
  }
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  function pause() {
    playing = false; generation++; cancelAnimationFrame(request);
    return ready.then(async () => { await window.__hypitSeekFrame(frame); report(true); });
  }
  async function seekFrame(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value >= count) {
      throw new RangeError('Frame outside HTML document');
    }
    playing = false; generation++; cancelAnimationFrame(request);
    await ready; frame = value; await window.__hypitSeekFrame(frame); report(true);
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
    ready, play, pause, seekFrame,
    get frame() { return frame; }, get playing() { return playing; },
    async setMuted(value) { await ready; await window.__hypitSetMuted(value); }
  };
  let pendingCommand, drainingCommands = false;
  async function drainCommands() {
    if (drainingCommands) return;
    drainingCommands = true;
    try {
      while (pendingCommand !== undefined) {
        const command = pendingCommand; pendingCommand = undefined;
        await ready;
        if (command.muted !== undefined) await window.__hypitDocument.setMuted(command.muted);
        if (command.frame !== undefined) await seekFrame(command.frame);
        else if (command.playing === false) await pause();
        if (command.playing === true) await play();
        if (Number.isSafeInteger(command.commandId) && command.commandId > commandId) commandId = command.commandId;
        report(true);
      }
    } catch (error) {
      window.parent.postMessage({type:'hypit.html-document.error@1', message:String(error)}, '*');
    } finally {
      drainingCommands = false;
      if (pendingCommand !== undefined) void drainCommands();
    }
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || window.parent === window
      || event.data?.type !== 'hypit.html-document.command@1') return;
    const {action,frame:target,muted,commandId:requestedCommandId} = event.data;
    const command = pendingCommand ?? {};
    if (action === 'play') command.playing = true;
    else if (action === 'pause') command.playing = false;
    else if (action === 'seek') { command.frame = target; command.playing = false; }
    else if (action === 'mute') command.muted = muted;
    else if (action !== 'state') {
      window.parent.postMessage({type:'hypit.html-document.error@1',
        message:'Unknown HTML document command ' + action}, '*');
      return;
    }
    if (Number.isSafeInteger(requestedCommandId)
      && (!Number.isSafeInteger(command.commandId) || requestedCommandId > command.commandId)) {
      command.commandId = requestedCommandId;
    }
    pendingCommand = command;
    void drainCommands();
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
