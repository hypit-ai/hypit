import type { PlaygroundSnapshot } from "../shared.js";
import { createOverlay } from "./overlay.js";
import type { State, Store } from "./selection.js";

export type Stage = {
  readonly element: HTMLElement;
  /** Start or stop playback, however the request arrived. */
  toggle(): void;
};

/**
 * The picture.
 *
 * The synthetic preview is the real HyperFrames document in an iframe, scrubbed
 * by pausing its animations and setting their time. The transport therefore
 * drives frames, not seconds, and lands on exactly the frame the renderer would
 * photograph.
 */
export function createStage(store: Store): Stage {
  const element = document.createElement("section");
  element.className = "stage";
  element.innerHTML = `
    <div class="stage-viewport">
      <div class="stage-scaler">
        <iframe title="Preview" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>
    </div>
    <div class="stage-bar">
      <button type="button" data-play aria-label="Play">
        <span class="material-symbols-rounded" data-icon>play_arrow</span>
      </button>
      <button type="button" data-mute aria-label="Mute" class="stage-mute">
        <span class="material-symbols-rounded" data-mute-icon>volume_up</span>
      </button>
    </div>`;

  const viewport = element.querySelector<HTMLElement>(".stage-viewport")!;
  const scaler = element.querySelector<HTMLElement>(".stage-scaler")!;
  const iframe = element.querySelector<HTMLIFrameElement>("iframe")!;
  /**
   * Measure a clip in the rendered picture.
   *
   * The iframe is sized to the canvas, so coordinates inside its document are
   * canvas pixels already and need no conversion. `getBoundingClientRect`
   * reflects the paused animation's transform, which is the whole point:
   * lifecycle motion displaces a clip from its Placement Frame for the length
   * of its enter and exit, and selecting a clip lands the playhead on exactly
   * the frame where that displacement is largest.
   */
  const measure = (clipId: string): { xPx: number; yPx: number; widthPx: number; heightPx: number } | undefined => {
    const document_ = iframe.contentDocument;
    if (document_ === null) return undefined;
    const present = document_.querySelector(`[data-narratage-present-id="${CSS.escape(clipId)}"]`);
    // The present spans the whole canvas; the drawn box is its frame element.
    const drawn = present?.querySelector(`[data-narratage-element-id="${CSS.escape(`${clipId}:frame`)}"]`)
      ?? present?.querySelector("[data-narratage-element-id]");
    if (drawn === null || drawn === undefined) return undefined;
    const box = drawn.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return undefined;
    return { xPx: box.left, yPx: box.top, widthPx: box.width, heightPx: box.height };
  };

  // The overlay is a sibling of the iframe inside the scaler, so it inherits the
  // letterboxed content box and needs no transform of its own.
  const overlay = createOverlay(store, measure);
  scaler.append(overlay.element);

  // Clicking the picture selects whatever is drawn under the pointer, which is
  // the third way into the same selection.
  scaler.addEventListener("click", (event) => {
    const clip = overlay.hitTest(event.clientX, event.clientY);
    if (clip !== undefined) store.selectClip(clip.id, "video");
    else store.clearSelection();
  });
  // The room around the picture is empty in the plainest sense.
  viewport.addEventListener("click", (event) => {
    if (event.target === viewport) store.clearSelection();
  });
  const play = element.querySelector<HTMLButtonElement>("[data-play]")!;
  const icon = element.querySelector<HTMLElement>("[data-icon]")!;
  const mute = element.querySelector<HTMLButtonElement>("[data-mute]")!;
  const muteIcon = element.querySelector<HTMLElement>("[data-mute-icon]")!;

  type SeekWindow = Window & {
    __svmlSeekFrame?: (frame: number) => void;
    __svmlPlayFrame?: (frame: number) => void;
    __svmlSetMuted?: (muted: boolean) => void;
  };
  let state: State | undefined;
  let mounted = -1;
  let ready = false;
  let playing = false;
  let muted = false;
  let raf = 0;
  // The transport counts frames from where it was last told to be. Jumping to a
  // clip mid-playback moves that origin rather than stopping, so playback
  // carries on from the frame the author asked for.
  let fromFrame = 0;
  let began = 0;

  const fps = (snapshot: PlaygroundSnapshot): number =>
    snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;

  const fit = (): void => {
    if (state === undefined) return;
    const { canvasWidth, canvasHeight } = state.snapshot.space;
    const room = viewport.getBoundingClientRect();
    const scale = Math.min(
      (room.width - 28) / canvasWidth,
      (room.height - 28) / canvasHeight,
      1,
    );
    // A zero-sized viewport during layout would otherwise produce NaN.
    const valid = Number.isFinite(scale) && scale > 0 ? scale : 1;
    scaler.style.width = `${canvasWidth * valid}px`;
    scaler.style.height = `${canvasHeight * valid}px`;
    iframe.style.width = `${canvasWidth}px`;
    iframe.style.height = `${canvasHeight}px`;
    iframe.style.transform = `scale(${valid})`;
  };

  const stop = (): void => {
    const wasPlaying = playing;
    playing = false;
    icon.textContent = "play_arrow";
    play.setAttribute("aria-label", "Play");
    if (raf !== 0) cancelAnimationFrame(raf);
    raf = 0;
    // Settle the picture on the frame the transport stopped at.
    if (wasPlaying && state !== undefined && ready) {
      (iframe.contentWindow as SeekWindow | null)?.__svmlSeekFrame?.(state.playhead.frame);
    }
  };

  const toggle = (): void => {
    if (state === undefined) return;
    if (playing) { stop(); return; }
    playing = true;
    icon.textContent = "pause";
    play.setAttribute("aria-label", "Pause");
    const total = state.snapshot.space.frameCount;
    const rate = fps(state.snapshot);
    fromFrame = state.playhead.frame >= total - 1 ? 0 : state.playhead.frame;
    began = performance.now();
    const step = (now: number): void => {
      const at = fromFrame + Math.round((now - began) / 1000 * rate);
      if (!playing || at >= total) { store.seek(total - 1, "play"); stop(); return; }
      store.seek(at, "play");
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  play.addEventListener("click", toggle);

  const applyMuted = (): void => {
    muteIcon.textContent = muted ? "volume_off" : "volume_up";
    mute.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    (iframe.contentWindow as SeekWindow | null)?.__svmlSetMuted?.(muted);
  };
  mute.addEventListener("click", () => { muted = !muted; applyMuted(); });

  iframe.addEventListener("load", () => {
    ready = true;
    if (state !== undefined) (iframe.contentWindow as SeekWindow | null)?.__svmlSeekFrame?.(state.playhead.frame);
    applyMuted();
    // The box could not be measured until now.
    overlay.refresh();
  });

  new ResizeObserver(fit).observe(viewport);

  store.subscribe((value) => {
    const first = state === undefined;
    state = value;
    if (value.snapshot.revision !== mounted) {
      mounted = value.snapshot.revision;
      stop();
      ready = false;
      const preview = value.snapshot.preview;
      iframe.srcdoc = preview.srcdoc;
      fit();
    }
    if (first) fit();

    // Playing and scrubbing are different requests: one lets material run on
    // its own clock, the other moves it. Asking a decoder for a fresh seek
    // every frame is what makes a picture fall behind its own transport.
    // A jump that arrives while the transport runs is both: the picture moves
    // now, and playback continues from there.
    const jumped = value.playhead.origin !== "play";
    if (jumped && playing) {
      fromFrame = value.playhead.frame;
      began = performance.now();
    }
    if (!ready) return;
    const frame = (iframe.contentWindow as SeekWindow | null);
    if (playing) frame?.__svmlPlayFrame?.(value.playhead.frame);
    else frame?.__svmlSeekFrame?.(value.playhead.frame);
    // The overlay subscribed first, so it measured the picture as it was before
    // this seek. Redraw now that the picture has moved.
    overlay.refresh();
  });

  return { element, toggle };
}
