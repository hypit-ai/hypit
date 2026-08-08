import type { PreviewOutput } from "../preview/render.js";

type SeekWindow = Window & {
  __svmlSeekFrame?: (frame: number) => void;
};

const CSS = `
.stage { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #0d0d10; }
.stage-viewport {
  flex: 1; min-height: 0; position: relative; overflow: hidden;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.stage-scaler { position: relative; transform-origin: center center; }
.stage-scaler iframe {
  display: block; border: 0; background: #000;
  box-shadow: 0 0 0 1px #26262b, 0 18px 50px rgba(0, 0, 0, .55);
}
.stage-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-top: 1px solid var(--line); background: var(--panel);
}
.stage-bar button {
  width: 30px; height: 26px; border: 1px solid var(--line); border-radius: 5px;
  background: #1c1c21; color: var(--text); cursor: pointer; font-size: 12px;
}
.stage-bar button:hover { border-color: #3a3a42; }
.stage-bar input[type=range] { flex: 1; accent-color: var(--accent); }
.stage-frame { font-variant-numeric: tabular-nums; color: var(--muted); min-width: 92px; }
.stage-size { color: var(--muted); font-variant-numeric: tabular-nums; }
.stage-note { padding: 9px 14px; font-size: 12px; border-top: 1px solid var(--line); white-space: pre-wrap; }
.stage-note.error { background: #2a1416; color: var(--danger); font-family: ui-monospace, monospace; }
.stage-note.warn { background: #241f12; color: #e3b341; }
.stage-note:empty { display: none; }
`;

export type Stage = {
  readonly element: HTMLElement;
  show(output: PreviewOutput): void;
  showError(message: string): void;
};

export function createStage(): Stage {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const element = document.createElement("div");
  element.className = "stage";
  element.innerHTML = `
    <div class="stage-viewport"><div class="stage-scaler"><iframe title="preview"></iframe></div></div>
    <div class="stage-bar">
      <button type="button" data-play>▶</button>
      <input type="range" min="0" max="0" step="1" value="0" data-scrub />
      <span class="stage-frame" data-frame>0 / 0</span>
      <span class="stage-size" data-size></span>
    </div>
    <div class="stage-note error" data-error></div>
    <div class="stage-note warn" data-warn></div>
  `;

  const viewport = element.querySelector<HTMLElement>(".stage-viewport")!;
  const scaler = element.querySelector<HTMLElement>(".stage-scaler")!;
  const frame = element.querySelector<HTMLIFrameElement>("iframe")!;
  const play = element.querySelector<HTMLButtonElement>("[data-play]")!;
  const scrub = element.querySelector<HTMLInputElement>("[data-scrub]")!;
  const readout = element.querySelector<HTMLElement>("[data-frame]")!;
  const size = element.querySelector<HTMLElement>("[data-size]")!;
  const error = element.querySelector<HTMLElement>("[data-error]")!;
  const warn = element.querySelector<HTMLElement>("[data-warn]")!;

  let canvas = { width: 1080, height: 1920 };
  let frameCount = 1;
  let fps = 30;
  let ready = false;
  let playing = false;
  let raf = 0;

  /**
   * The iframe keeps its composition pixel size and is scaled by transform.
   * Letting it reflow at the viewport size would silently change every length
   * in the document, so a font-size read here would not be the rendered one.
   */
  function fit(): void {
    const room = viewport.getBoundingClientRect();
    const scale = Math.min(
      (room.width - 40) / canvas.width,
      (room.height - 40) / canvas.height,
    );
    const k = Number.isFinite(scale) && scale > 0 ? Math.min(scale, 1) : 1;
    scaler.style.transform = `scale(${k})`;
    scaler.style.width = `${canvas.width * k}px`;
    scaler.style.height = `${canvas.height * k}px`;
    scaler.style.transformOrigin = "top left";
    frame.style.width = `${canvas.width}px`;
    frame.style.height = `${canvas.height}px`;
  }

  function seek(at: number): void {
    readout.textContent = `${at} / ${frameCount - 1}`;
    if (!ready) return;
    (frame.contentWindow as SeekWindow | null)?.__svmlSeekFrame?.(at);
  }

  function stop(): void {
    playing = false;
    play.textContent = "▶";
    if (raf !== 0) cancelAnimationFrame(raf);
    raf = 0;
  }

  play.addEventListener("click", () => {
    if (playing) { stop(); return; }
    playing = true;
    play.textContent = "❚❚";
    const startedAt = performance.now();
    const from = Number(scrub.value);
    const step = (now: number): void => {
      if (!playing) return;
      const at = from + Math.round((now - startedAt) / 1000 * fps);
      if (at >= frameCount) { scrub.value = String(frameCount - 1); seek(frameCount - 1); stop(); return; }
      scrub.value = String(at);
      seek(at);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });

  scrub.addEventListener("input", () => { stop(); seek(Number(scrub.value)); });
  frame.addEventListener("load", () => { ready = true; seek(Number(scrub.value)); });
  new ResizeObserver(fit).observe(viewport);

  return {
    element,
    show(output) {
      error.textContent = "";
      warn.textContent = [...new Set(output.warnings)].join("\n");
      canvas = output.canvas;
      frameCount = Math.max(1, output.frameCount);
      fps = output.fps;
      stop();
      // Keep the playhead across edits so tweaking a value does not lose the
      // frame you were judging.
      const at = Math.min(Number(scrub.value), frameCount - 1);
      scrub.max = String(frameCount - 1);
      scrub.value = String(at);
      readout.textContent = `${at} / ${frameCount - 1}`;
      size.textContent = `${canvas.width}×${canvas.height}`;
      ready = false;
      frame.srcdoc = output.srcdoc;
      fit();
    },
    showError(message) {
      stop();
      error.textContent = message;
    },
  };
}
