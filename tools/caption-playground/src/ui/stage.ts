import type { PreviewOutput } from "../preview/render.js";

type SeekWindow = Window & { __svmlSeekFrame?: (frame: number) => void };

export type Stage = {
  readonly element: HTMLElement;
  show(output: PreviewOutput): void;
  showError(message: string): void;
};

export function createStage(): Stage {
  const element = document.createElement("section");
  element.className = "stage";
  element.innerHTML = `
    <div class="stage-viewport"><div class="stage-scaler"><iframe title="Caption preview"></iframe></div></div>
    <div class="stage-bar">
      <button type="button" data-play aria-label="Play">▶</button>
      <input type="range" min="0" max="0" step="1" value="0" data-scrub />
      <span data-frame>0 / 0</span><span data-size></span>
    </div>
    <pre class="stage-error" data-error></pre>`;
  const viewport = element.querySelector<HTMLElement>(".stage-viewport")!;
  const scaler = element.querySelector<HTMLElement>(".stage-scaler")!;
  const iframe = element.querySelector<HTMLIFrameElement>("iframe")!;
  const play = element.querySelector<HTMLButtonElement>("[data-play]")!;
  const scrub = element.querySelector<HTMLInputElement>("[data-scrub]")!;
  const readout = element.querySelector<HTMLElement>("[data-frame]")!;
  const size = element.querySelector<HTMLElement>("[data-size]")!;
  const error = element.querySelector<HTMLElement>("[data-error]")!;
  let canvas = { width: 1080, height: 1920 };
  let frames = 1;
  let fps = 30;
  let ready = false;
  let playing = false;
  let raf = 0;

  const fit = (): void => {
    const room = viewport.getBoundingClientRect();
    const scale = Math.min((room.width - 32) / canvas.width, (room.height - 32) / canvas.height, 1);
    const valid = Number.isFinite(scale) && scale > 0 ? scale : 1;
    scaler.style.width = `${canvas.width * valid}px`;
    scaler.style.height = `${canvas.height * valid}px`;
    iframe.style.width = `${canvas.width}px`;
    iframe.style.height = `${canvas.height}px`;
    iframe.style.transform = `scale(${valid})`;
  };
  const seek = (frame: number): void => {
    readout.textContent = `${frame} / ${frames - 1}`;
    if (ready) (iframe.contentWindow as SeekWindow | null)?.__svmlSeekFrame?.(frame);
  };
  const stop = (): void => {
    playing = false;
    play.textContent = "▶";
    if (raf !== 0) cancelAnimationFrame(raf);
    raf = 0;
  };
  play.addEventListener("click", () => {
    if (playing) { stop(); return; }
    playing = true;
    play.textContent = "❚❚";
    const start = performance.now();
    const from = Number(scrub.value);
    const step = (now: number): void => {
      const at = from + Math.round((now - start) / 1000 * fps);
      if (!playing || at >= frames) { scrub.value = String(frames - 1); seek(frames - 1); stop(); return; }
      scrub.value = String(at);
      seek(at);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
  scrub.addEventListener("input", () => { stop(); seek(Number(scrub.value)); });
  iframe.addEventListener("load", () => { ready = true; seek(Number(scrub.value)); });
  new ResizeObserver(fit).observe(viewport);

  return {
    element,
    show(output) {
      error.textContent = "";
      canvas = output.canvas;
      frames = Math.max(1, output.frameCount);
      fps = output.fps;
      const at = Math.min(Number(scrub.value), frames - 1);
      scrub.max = String(frames - 1);
      scrub.value = String(at);
      readout.textContent = `${at} / ${frames - 1}`;
      size.textContent = `${canvas.width}×${canvas.height}`;
      ready = false;
      iframe.srcdoc = output.srcdoc;
      stop();
      fit();
    },
    showError(message) { stop(); error.textContent = message; },
  };
}
