import { uiLabel, uiAttribute, uiText, uiAttr, userText } from "./i18n.js";
import { createArtifactPreview } from "./artifact-preview.js";
import type { StudioArtifactView, StudioSnapshot, StudioTerminalTarget } from "../shared.js";
import { createOverlay } from "./overlay.js";
import { icon, setIcon } from "./icons.js";
import { createScrubPreview } from "./scrub-preview.js";
import type { State, Store } from "./selection.js";
import { createHtmlPreviewAdapter, type HtmlPreviewWindow } from "./html-preview-adapter.js";

export type Stage = {
  readonly element: HTMLElement;
  /** Start or stop playback, however the request arrived. */
  toggle(): void;
  pause(): void;
  /** Change picture interaction while preserving Studio's selection. */
  setReviewMode(enabled: boolean): void;
  /** Return from a Result artifact to the composition player. */
  showComposition(): void;
  openArtifact(artifact: StudioArtifactView): void;
  renameArtifact(artifact: StudioArtifactView): void;
};

/**
 * The picture.
 *
 * The synthetic preview is the real HTML Program document in an iframe, scrubbed
 * by pausing its animations and setting their time. The transport therefore
 * drives frames, not seconds, and lands on exactly the frame the renderer would
 * photograph.
 */
export function createStage(store: Store, selectedArtifact: (id: string | undefined) => void): Stage {
  const element = document.createElement("section");
  element.className = "stage";
  element.innerHTML = `
    <div class="stage-heading">
      <div class="stage-title">${icon("preview")}<strong>${uiLabel("player.preview")}</strong></div>
      <div class="stage-heading-actions">
        <div class="stage-preview-mask" hidden><span></span><button type="button">${uiLabel("player.preview-reset")}</button></div>
        <button type="button" class="stage-return" hidden>${uiLabel("player.back-to-composition")}</button>
      </div>
    </div>
    <div class="stage-viewport">
      <div class="stage-scaler">
        <iframe ${uiAttribute("title", "player.preview")} sandbox="allow-scripts allow-same-origin" allow="autoplay"></iframe>
      </div>
    </div>
    <div class="stage-progress" hidden>
      <input class="stage-scrubber" type="range" min="0" max="0" value="0" step="0.01" ${uiAttribute("aria-label", "player.media-time")} hidden>
    </div>
    <div class="stage-bar">
      <span class="stage-time" hidden></span>
      <div class="stage-transport">
      <button type="button" data-previous ${uiAttribute("aria-label", "player.previous-frame")} ${uiAttribute("title", "player.previous-frame")}>
        ${icon("previous")}
      </button>
      <button type="button" data-play ${uiAttribute("aria-label", "player.play")}>
        <span data-icon>${icon("play")}</span>
      </button>
      <button type="button" data-next ${uiAttribute("aria-label", "player.next-frame")} ${uiAttribute("title", "player.next-frame")}>
        ${icon("next")}
      </button>
      </div>
      <button type="button" data-mute ${uiAttribute("aria-label", "player.mute")} class="stage-mute">
        <span data-mute-icon>${icon("volume")}</span>
      </button>
    </div>`;

  const viewport = element.querySelector<HTMLElement>(".stage-viewport")!;
  const scaler = element.querySelector<HTMLElement>(".stage-scaler")!;
  const iframe = element.querySelector<HTMLIFrameElement>("iframe")!;
  let reviewMode = false;
  /**
   * Measure an Item in the rendered picture.
   *
   * The iframe is sized to the canvas, so coordinates inside its document are
   * canvas pixels already and need no conversion. `getBoundingClientRect`
   * reflects the paused animation's transform, which is the whole point:
   * lifecycle motion displaces an Item from its Placement Frame for the length
   * of its enter and exit, and selecting an Item lands the playhead on exactly
   * the frame where that displacement is largest.
   */
  type PresentTarget = Extract<StudioTerminalTarget, { readonly kind: "visual-present" }>;
  const measure = (renderRef: PresentTarget): { xPx: number; yPx: number; widthPx: number; heightPx: number; paintPath: readonly number[] } | undefined => {
    const document_ = iframe.contentDocument;
    if (document_ === null) return undefined;
    const occurrencePath = JSON.stringify(renderRef.occurrencePath);
    const present = document_.querySelector(
      `[data-hypit-occurrence-path="${CSS.escape(occurrencePath)}"][data-hypit-present-id="${CSS.escape(renderRef.presentId)}"]`,
    );
    if (present === null) return undefined;
    const current = store.current();
    if (current === undefined) return undefined;
    const start = Number(present.getAttribute("data-hypit-present-start-frame"));
    const end = Number(present.getAttribute("data-hypit-present-end-frame"));
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || current.playhead.frame < start || current.playhead.frame >= end) return undefined;
    const elementId = renderRef.elementId ?? present.getAttribute("data-hypit-present-root-element-id");
    if (elementId === null) return undefined;
    const drawn = present.querySelector(`[data-hypit-element-id="${CSS.escape(elementId)}"]`);
    if (drawn === null || drawn === undefined) return undefined;
    for (let ancestor: Element | null = drawn; ancestor !== null; ancestor = ancestor.parentElement) {
      const style = document_.defaultView!.getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return undefined;
    }
    const box = drawn.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return undefined;
    const paintPath = JSON.parse(present.getAttribute("data-hypit-paint-path") ?? "null") as unknown;
    if (!Array.isArray(paintPath) || paintPath.some((part) => !Number.isSafeInteger(part) || part < 0)) return undefined;
    return { xPx: box.left, yPx: box.top, widthPx: box.width, heightPx: box.height,
      paintPath: paintPath as number[] };
  };

  // The overlay is a sibling of the iframe inside the scaler, so it inherits the
  // letterboxed content box and needs no transform of its own.
  const overlay = createOverlay(store, measure);
  scaler.append(overlay.element);

  // Clicking the picture selects whatever is drawn under the pointer, which is
  // the third way into the same selection.
  scaler.addEventListener("click", (event) => {
    if (reviewMode) { toggle(); return; }
    const item = overlay.hitTest(event.clientX, event.clientY);
    if (item !== undefined) store.select(item.id, "video");
    else store.clearSelection();
  });
  // A broad component frame can cover smaller elements. Offer all actual
  // Companion hits without special knowledge of captions or any other family.
  let selectionMenu: HTMLElement | undefined;
  const closeSelectionMenu = (): void => { selectionMenu?.remove(); selectionMenu = undefined; };
  scaler.addEventListener("contextmenu", (event) => {
    if (reviewMode) { event.preventDefault(); return; }
    const hits = overlay.hitsAt(event.clientX, event.clientY);
    if (hits.length === 0) return;
    event.preventDefault(); stop(); closeSelectionMenu();
    const menu = document.createElement("div");
    menu.className = "selection-menu";
    menu.setAttribute("role", "menu"); uiAttr(menu, "aria-label", "player.elements-at-this-point");
    for (const hit of hits) {
      const option = document.createElement("button"); option.type = "button";
      option.setAttribute("role", "menuitem"); option.textContent = hit.display.title;
      option.title = hit.id;
      option.addEventListener("click", () => { store.select(hit.id, "video"); closeSelectionMenu(); });
      menu.append(option);
    }
    element.append(menu);
    menu.style.left = `${Math.max(0, Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(0, Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8))}px`;
    selectionMenu = menu; menu.querySelector("button")?.focus();
  });
  document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Node && !selectionMenu?.contains(event.target)) closeSelectionMenu();
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSelectionMenu(); });
  // The room around the picture is empty in the plainest sense.
  viewport.addEventListener("click", (event) => {
    if (event.target === viewport) {
      if (reviewMode) toggle();
      else store.clearSelection();
    }
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
  // Item mid-playback moves that origin rather than stopping, so playback
  // carries on from the frame the author asked for.
  let fromFrame = 0;
  let began = 0;
  let placed = 0;
  const previewAdapter = createHtmlPreviewAdapter();

  const seekPicture = (frame: number): void => {
    const request = ++placed;
    void (iframe.contentWindow as SeekWindow | null)?.__hypitSeekFrame?.(frame).then((current) => {
      if (current && request === placed) overlay.refresh();
    });
  };

  const fps = (snapshot: StudioSnapshot): number =>
    snapshot.timeline.frameRate.numerator / snapshot.timeline.frameRate.denominator;

  const fit = (): void => {
    if (state === undefined) return;
    const { width: canvasWidth, height: canvasHeight } = state.snapshot.canvas;
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
    uiAttr(play, "aria-label", "player.play");
    if (raf !== 0) cancelAnimationFrame(raf);
    raf = 0;
    // Settle the picture on the frame the transport stopped at.
    if (wasPlaying && state !== undefined && ready) {
      seekPicture(state.playhead.frame);
    }
  };

  const toggle = (): void => {
    if (artifactPreview.selected !== undefined) { artifactPreview.toggle(); return; }
    if (state === undefined || !ready) return;
    if (playing) { stop(); return; }
    playing = true;
    setIcon(playIcon, "pause");
    uiAttr(play, "aria-label", "player.pause");
    const total = state.snapshot.timeline.frameCount;
    const rate = fps(state.snapshot);
    fromFrame = state.playhead.frame >= total - 1 ? 0 : state.playhead.frame;
    if (ready) (iframe.contentWindow as SeekWindow | null)?.__hypitPlayFrame?.(fromFrame);
    began = performance.now();
    const step = (now: number): void => {
      const at = fromFrame + Math.round((now - began) / 1000 * rate);
      if (!playing || at >= total) { store.seek(total - 1, "play"); stop(); return; }
      if (at !== state?.playhead.frame) store.seek(at, "play");
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
    uiAttr(mute, "aria-label", muted ? "player.unmute" : "player.mute");
    if (artifactPreview.media !== undefined) artifactPreview.media.muted = muted;
    (iframe.contentWindow as SeekWindow | null)?.__hypitSetMuted?.(muted);
  };
  mute.addEventListener("click", () => { muted = !muted; applyMuted(); });

  const title = element.querySelector<HTMLElement>(".stage-title strong")!;
  const back = element.querySelector<HTMLButtonElement>(".stage-return")!;
  const scrubber = element.querySelector<HTMLInputElement>(".stage-scrubber")!;
  const progress = element.querySelector<HTMLElement>(".stage-progress")!;
  const scrubPreview = createScrubPreview(progress);
  scrubber.addEventListener("pointermove", (event) => {
    if (!reviewMode || state === undefined || scrubber.disabled || artifactPreview.selected !== undefined) return;
    const box = scrubber.getBoundingClientRect();
    // Native range thumbs travel between their centers, not the input edges.
    const fraction = Math.max(0, Math.min(1, (event.clientX - box.left - 6) / Math.max(1, box.width - 12)));
    const frame = Math.round(fraction * Math.max(0, state.snapshot.timeline.frameCount - 1));
    scrubPreview.show(state.snapshot, frame, event.clientX);
  });
  scrubber.addEventListener("pointerleave", scrubPreview.hide);
  scrubber.addEventListener("blur", scrubPreview.hide);
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
    progress.hidden = scrubber.hidden = !timed;
    time.hidden = !timed;
    play.disabled = duration <= 0 || media?.error != null;
    previous.disabled = next.disabled = play.disabled;
    scrubber.disabled = duration <= 0;
    scrubber.step = "0.01";
    uiAttr(scrubber, "aria-label", "player.media-time");
    scrubber.max = String(duration);
    scrubber.value = String(media?.currentTime ?? 0);
    time.textContent = `${clock(media?.currentTime ?? 0)} / ${clock(duration)}`;
    setIcon(playIcon, media !== undefined && !media.paused ? "pause" : "play");
    uiAttr(play, "aria-label", media !== undefined && !media.paused ? "player.pause" : "player.play");
  });
  const previewMask = element.querySelector<HTMLElement>(".stage-preview-mask")!;
  const previewMaskLabel = previewMask.querySelector<HTMLElement>("span")!;
  previewMask.querySelector<HTMLButtonElement>("button")!.addEventListener("click", () => store.resetPreviewMask());
  const effectivePreviewMask = (): ReadonlySet<string> =>
    reviewMode || artifactPreview.selected !== undefined ? new Set() : state?.preview.omittedItemIds ?? new Set();
  const applyPreviewMask = (): void => {
    if (state === undefined || !ready) return;
    previewAdapter.apply(state.snapshot, effectivePreviewMask());
    const count = artifactPreview.selected === undefined && !reviewMode ? state.preview.omittedItemIds.size : 0;
    previewMask.hidden = count === 0;
    if (count > 0) uiText(previewMaskLabel, "player.preview-exclusions", { count });
  };
  viewport.append(artifactPreview.element);
  const compositionTime = (): void => {
    if (state === undefined || artifactPreview.selected !== undefined) return;
    const rate = fps(state.snapshot);
    progress.hidden = scrubber.hidden = time.hidden = false;
    scrubber.disabled = !ready;
    play.disabled = previous.disabled = next.disabled = !ready;
    scrubber.step = String(1 / rate);
    scrubber.max = String(Math.max(0, state.snapshot.timeline.frameCount - 1) / rate);
    scrubber.value = String(state.playhead.frame / rate);
    uiAttr(scrubber, "aria-label", "player.composition-time");
    time.textContent = `${clock(state.playhead.frame / rate)} / ${clock(state.snapshot.timeline.frameCount / rate)}`;
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
    uiAttr(previous, "title", "player.previous-frame");
    uiAttr(previous, "aria-label", "player.previous-frame");
    uiAttr(next, "title", "player.next-frame");
    uiAttr(next, "aria-label", "player.next-frame");
    uiText(title, "player.preview");
    title.removeAttribute("title");
    setIcon(playIcon, "play");
    uiAttr(play, "aria-label", "player.play");
    fit();
    if (state !== undefined && ready) seekPicture(state.playhead.frame);
    applyPreviewMask();
  };
  back.addEventListener("click", returnToComposition);

  const openArtifact = (artifact: StudioArtifactView): void => {
    stop();
    scaler.hidden = true;
    back.hidden = false;
    userText(title, artifact.displayName ?? artifact.output);
    title.title = artifact.output;
    uiAttr(previous, "title", "player.back-5-seconds");
    uiAttr(next, "title", "player.forward-5-seconds");
    uiAttr(previous, "aria-label", "player.back-5-seconds");
    uiAttr(next, "aria-label", "player.forward-5-seconds");
    artifactPreview.open(artifact, muted);
    selectedArtifact(artifact.id);
    applyPreviewMask();
  };

  const previewReady = (): void => {
    if (ready) return;
    ready = true;
    previewAdapter.mount(iframe.contentWindow as HtmlPreviewWindow);
    compositionTime();
    if (state !== undefined) seekPicture(state.playhead.frame);
    applyMuted();
    applyPreviewMask();
    // The box could not be measured until now.
    overlay.refresh();
  };
  iframe.addEventListener("load", previewReady);
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source === iframe.contentWindow && event.data?.type === "hypit-preview-ready") previewReady();
  });

  new ResizeObserver(fit).observe(viewport);

  store.subscribe((value) => {
    const first = state === undefined;
    const moved = state !== undefined && (state.playhead.frame !== value.playhead.frame || state.selection !== value.selection);
    state = value;
    if (moved && value.playhead.origin !== "play" && artifactPreview.selected !== undefined) returnToComposition();
    if (value.snapshot.revision !== mounted) {
      scrubPreview.clear();
      mounted = value.snapshot.revision;
      if (artifactPreview.selected === undefined) stop();
      ready = false;
      previewAdapter.unmount();
      const preview = value.snapshot.preview;
      iframe.srcdoc = preview.srcdoc;
      fit();
    }
    if (first) fit();
    compositionTime();
    applyPreviewMask();

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
    setReviewMode(enabled) {
      reviewMode = enabled;
      element.classList.toggle("stage-review", enabled);
      overlay.element.style.display = enabled ? "none" : "";
      closeSelectionMenu();
      if (!enabled) scrubPreview.clear();
      applyPreviewMask();
    },
    pause() { stop(); artifactPreview.media?.pause(); },
    showComposition() { if (artifactPreview.selected !== undefined) returnToComposition(); },
    renameArtifact(artifact) {
      const selected = artifactPreview.selected;
      if (selected?.build === artifact.build && selected.output === artifact.output) userText(title, artifact.displayName ?? artifact.output);
    },
  };
}
