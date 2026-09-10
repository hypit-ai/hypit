import { createArtifactPreview } from "./artifact-preview.js";
import type { StudioArtifactView, StudioSnapshot } from "../shared.js";
import { createOverlay } from "./overlay.js";
import { icon, setIcon } from "./icons.js";
import type { State, Store } from "./selection.js";

export type Stage = {
  readonly element: HTMLElement;
  /** Start or stop playback, however the request arrived. */
  toggle(): void;
  openArtifact(artifact: StudioArtifactView): void;
  renameArtifact(artifact: StudioArtifactView): void;
};

/**
 * The picture.
 *
 * The synthetic preview is the real HyperFrames document in an iframe, scrubbed
 * by pausing its animations and setting their time. The transport therefore
 * drives frames, not seconds, and lands on exactly the frame the renderer would
 * photograph.
 */
export function createStage(store: Store, selectedArtifact: (id: string | undefined) => void): Stage {
  const element = document.createElement("section");
  element.className = "stage";
  element.innerHTML = `
    <div class="stage-heading">
      <div class="stage-title">${icon("preview")}<strong>Preview</strong></div>
      <button type="button" class="stage-return" hidden>Back to composition</button>
    </div>
    <div class="stage-viewport">
      <div class="stage-scaler">
        <iframe title="Preview" sandbox="allow-scripts allow-same-origin" allow="autoplay"></iframe>
      </div>
    </div>
    <input class="stage-scrubber" type="range" min="0" max="0" value="0" step="0.01" aria-label="Media time" hidden>
    <div class="stage-bar">
      <span class="stage-time" hidden></span>
      <div class="stage-transport">
      <button type="button" data-previous aria-label="Previous frame" title="Previous frame">
        ${icon("previous")}
      </button>
      <button type="button" data-play aria-label="Play">
        <span data-icon>${icon("play")}</span>
      </button>
      <button type="button" data-next aria-label="Next frame" title="Next frame">
        ${icon("next")}
      </button>
      </div>
      <button type="button" data-mute aria-label="Mute" class="stage-mute">
        <span data-mute-icon>${icon("volume")}</span>
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
  const measure = (clipId: string): { xPx: number; yPx: number; widthPx: number; heightPx: number; stackOrder: number } | undefined => {
    const document_ = iframe.contentDocument;
    if (document_ === null) return undefined;
    const present = document_.querySelector(`[data-hypit-present-id="${CSS.escape(clipId)}"]`);
    if (present === null) return undefined;
    const current = store.current();
    if (current === undefined) return undefined;
    const frameRate = fps(current.snapshot);
    const start = Number(present.getAttribute("data-start"));
    const end = start + Number(present.getAttribute("data-duration"));
    if (current.playhead.frame < Math.round(start * frameRate)
      || current.playhead.frame >= Math.round(end * frameRate)) return undefined;
    // The present spans the whole canvas; the drawn box is its frame element.
    const drawn = present?.querySelector(`[data-hypit-element-id="${CSS.escape(`${clipId}:frame`)}"]`)
      ?? present?.querySelector("[data-hypit-element-id]");
    if (drawn === null || drawn === undefined) return undefined;
    for (let ancestor: Element | null = drawn; ancestor !== null; ancestor = ancestor.parentElement) {
      const style = document_.defaultView!.getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return undefined;
    }
    const box = drawn.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return undefined;
    return { xPx: box.left, yPx: box.top, widthPx: box.width, heightPx: box.height,
      stackOrder: Number(document_.defaultView!.getComputedStyle(present).zIndex) || 0 };
  };

  // The overlay is a sibling of the iframe inside the scaler, so it inherits the
  // letterboxed content box and needs no transform of its own.
  const overlay = createOverlay(store, measure);
  scaler.append(overlay.element);

  // Clicking the picture selects whatever is drawn under the pointer, which is
  // the third way into the same selection.
  scaler.addEventListener("click", (event) => {
    const clip = overlay.hitTest(event.clientX, event.clientY);
    if (clip !== undefined) store.select(clip.id, "video");
    else store.clearSelection();
  });
  // The room around the picture is empty in the plainest sense.
  viewport.addEventListener("click", (event) => {
    if (event.target === viewport) store.clearSelection();
  });
  const play = element.querySelector<HTMLButtonElement>("[data-play]")!;
  const previous = element.querySelector<HTMLButtonElement>("[data-previous]")!;
  const next = element.querySelector<HTMLButtonElement>("[data-next]")!;
  const playIcon = element.querySelector<HTMLElement>("[data-icon]")!;
  const mute = element.querySelector<HTMLButtonElement>("[data-mute]")!;
  const muteIcon = element.querySelector<HTMLElement>("[data-mute-icon]")!;

  type SeekWindow = Window & {
    __hypitSeekFrame?: (frame: number) => Promise<boolean>;
    __hypitPlayFrame?: (frame: number) => Promise<boolean>;
    __hypitSetMuted?: (muted: boolean) => Promise<boolean>;
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
  let placed = 0;

  const seekPicture = (frame: number): void => {
    const request = ++placed;
    void (iframe.contentWindow as SeekWindow | null)?.__hypitSeekFrame?.(frame).then((current) => {
      if (current && request === placed) overlay.refresh();
    });
  };

  const fps = (snapshot: StudioSnapshot): number =>
    snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;

  const fit = (): void => {
    if (state === undefined) return;
    const { canvasWidth, canvasHeight } = state.snapshot.space;
    const room = viewport.getBoundingClientRect();
    const scale = Math.min(
      (room.width - 28) / canvasWidth,
      (room.height - 28) / canvasHeight,
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
    setIcon(playIcon, "play");
    play.setAttribute("aria-label", "Play");
    if (raf !== 0) cancelAnimationFrame(raf);
    raf = 0;
    // Settle the picture on the frame the transport stopped at.
    if (wasPlaying && state !== undefined && ready) {
      seekPicture(state.playhead.frame);
    }
  };

  const toggle = (): void => {
    if (artifactPreview.selected !== undefined) { artifactPreview.toggle(); return; }
    if (state === undefined) return;
    if (playing) { stop(); return; }
    playing = true;
    setIcon(playIcon, "pause");
    play.setAttribute("aria-label", "Pause");
    const total = state.snapshot.space.frameCount;
    const rate = fps(state.snapshot);
    fromFrame = state.playhead.frame >= total - 1 ? 0 : state.playhead.frame;
    if (ready) (iframe.contentWindow as SeekWindow | null)?.__hypitPlayFrame?.(fromFrame);
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
  previous.addEventListener("click", () => {
    if (artifactPreview.selected !== undefined) artifactPreview.seek((artifactPreview.media?.currentTime ?? 0) - 5);
    else if (state !== undefined) store.seek(state.playhead.frame - 1, "video");
  });
  next.addEventListener("click", () => {
    if (artifactPreview.selected !== undefined) artifactPreview.seek((artifactPreview.media?.currentTime ?? 0) + 5);
    else if (state !== undefined) store.seek(state.playhead.frame + 1, "video");
  });

  const applyMuted = (): void => {
    setIcon(muteIcon, muted ? "muted" : "volume");
    mute.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    if (artifactPreview.media !== undefined) artifactPreview.media.muted = muted;
    (iframe.contentWindow as SeekWindow | null)?.__hypitSetMuted?.(muted);
  };
  mute.addEventListener("click", () => { muted = !muted; applyMuted(); });

  const title = element.querySelector<HTMLElement>(".stage-title strong")!;
  const back = element.querySelector<HTMLButtonElement>(".stage-return")!;
  const scrubber = element.querySelector<HTMLInputElement>(".stage-scrubber")!;
  const time = element.querySelector<HTMLElement>(".stage-time")!;
  const transport = element.querySelector<HTMLElement>(".stage-transport")!;
  const clock = (seconds: number): string => {
    const ticks = Math.max(0, Math.round(seconds * 100));
    const whole = Math.floor(ticks / 100);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${String(ticks % 100).padStart(2, "0")}`;
  };
  const artifactPreview = createArtifactPreview(() => {
    if (artifactPreview.selected === undefined) return;
    const media = artifactPreview.media;
    const timed = media !== undefined;
    const duration = media !== undefined && Number.isFinite(media.duration) ? media.duration : 0;
    transport.hidden = !timed;
    mute.hidden = !timed;
    scrubber.hidden = !timed;
    time.hidden = !timed;
    play.disabled = duration <= 0 || media?.error != null;
    previous.disabled = next.disabled = play.disabled;
    scrubber.disabled = duration <= 0;
    scrubber.step = "0.01";
    scrubber.setAttribute("aria-label", "Media time");
    scrubber.max = String(duration);
    scrubber.value = String(media?.currentTime ?? 0);
    time.textContent = `${clock(media?.currentTime ?? 0)} / ${clock(duration)}`;
    setIcon(playIcon, media !== undefined && !media.paused ? "pause" : "play");
    play.setAttribute("aria-label", media !== undefined && !media.paused ? "Pause" : "Play");
  });
  viewport.append(artifactPreview.element);
  const compositionTime = (): void => {
    if (state === undefined || artifactPreview.selected !== undefined) return;
    const rate = fps(state.snapshot);
    scrubber.hidden = time.hidden = false;
    scrubber.disabled = !ready;
    scrubber.step = String(1 / rate);
    scrubber.max = String(Math.max(0, state.snapshot.space.frameCount - 1) / rate);
    scrubber.value = String(state.playhead.frame / rate);
    scrubber.setAttribute("aria-label", "Composition time");
    time.textContent = `${clock(state.playhead.frame / rate)} / ${clock(state.snapshot.space.frameCount / rate)}`;
  };
  scrubber.addEventListener("input", () => {
    if (artifactPreview.selected !== undefined) artifactPreview.seek(Number(scrubber.value));
    else if (state !== undefined) store.seek(Math.round(Number(scrubber.value) * fps(state.snapshot)), "video");
  });

  const returnToComposition = (): void => {
    artifactPreview.close();
    selectedArtifact(undefined);
    scaler.hidden = false;
    back.hidden = true;
    compositionTime();
    transport.hidden = mute.hidden = false;
    play.disabled = previous.disabled = next.disabled = false;
    previous.title = "Previous frame";
    previous.setAttribute("aria-label", previous.title);
    next.title = "Next frame";
    next.setAttribute("aria-label", next.title);
    title.textContent = "Preview";
    title.removeAttribute("title");
    setIcon(playIcon, "play");
    play.setAttribute("aria-label", "Play");
    fit();
    if (state !== undefined && ready) seekPicture(state.playhead.frame);
  };
  back.addEventListener("click", returnToComposition);

  const openArtifact = (artifact: StudioArtifactView): void => {
    stop();
    scaler.hidden = true;
    back.hidden = false;
    title.textContent = artifact.displayName ?? artifact.output;
    title.title = artifact.output;
    previous.title = "Back 5 seconds";
    next.title = "Forward 5 seconds";
    previous.setAttribute("aria-label", previous.title);
    next.setAttribute("aria-label", next.title);
    artifactPreview.open(artifact, muted);
    selectedArtifact(artifact.id);
  };

  iframe.addEventListener("load", () => {
    ready = true;
    compositionTime();
    if (state !== undefined) seekPicture(state.playhead.frame);
    applyMuted();
    // The box could not be measured until now.
    overlay.refresh();
  });

  new ResizeObserver(fit).observe(viewport);

  store.subscribe((value) => {
    const first = state === undefined;
    const moved = state !== undefined && (state.playhead.frame !== value.playhead.frame || state.selection !== value.selection);
    state = value;
    if (moved && value.playhead.origin !== "play" && artifactPreview.selected !== undefined) returnToComposition();
    if (value.snapshot.revision !== mounted) {
      mounted = value.snapshot.revision;
      if (artifactPreview.selected === undefined) stop();
      ready = false;
      const preview = value.snapshot.preview;
      iframe.srcdoc = preview.srcdoc;
      fit();
    }
    if (first) fit();
    compositionTime();

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
    if (playing) frame?.__hypitPlayFrame?.(value.playhead.frame);
    else seekPicture(value.playhead.frame);
    // The overlay subscribed first, so it measured the picture as it was before
    // this seek. Redraw now that the picture has moved.
    if (playing) overlay.refresh();
  });

  return { element, toggle, openArtifact,
    renameArtifact(artifact) {
      const selected = artifactPreview.selected;
      if (selected?.build === artifact.build && selected.output === artifact.output) title.textContent = artifact.displayName ?? artifact.output;
    },
  };
}
