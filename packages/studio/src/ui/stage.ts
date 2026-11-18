import { uiLabel, uiAttribute, uiText, uiAttr, userText } from "./i18n.js";
import { createArtifactPreview } from "./artifact-preview.js";
import type { StudioArtifactView, StudioItem, StudioSnapshot } from "../shared.js";
import { resolveFrameEditModel, solveFrameGesture } from "../frame-edit.js";
import type { FrameEditModel, FrameGesture, FrameGestureSolution, SpatialBox } from "../frame-edit.js";
import { createOverlay } from "./overlay.js";
import { icon, setIcon } from "./icons.js";
import { createScrubPreview } from "./scrub-preview.js";
import type { State, Store } from "./selection.js";
import { applyStudioMutation } from "./writeback.js";

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
      <button type="button" class="stage-return" hidden>${uiLabel("player.back-to-composition")}</button>
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

  const measure = (renderId: string): { xPx: number; yPx: number; widthPx: number; heightPx: number; stackOrder: number } | undefined => {
    const document_ = iframe.contentDocument;
    if (document_ === null) return undefined;
    const present = document_.querySelector(`[data-hypit-present-id="${CSS.escape(renderId)}"]`);
    if (present === null) return undefined;
    const current = store.current();
    if (current === undefined) return undefined;
    // The present publishes its span in program frames, the same clock as the playhead.
    const start = Number(present.getAttribute("data-hypit-present-start-frame"));
    const end = Number(present.getAttribute("data-hypit-present-end-frame"));
    if (current.playhead.frame < start || current.playhead.frame >= end) return undefined;
    // The present spans the whole canvas; the drawn box is its frame element.
    const drawn = present?.querySelector(`[data-hypit-element-id="${CSS.escape(`${renderId}:frame`)}"]`)
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

  const overlay = createOverlay(store, measure);
  scaler.append(overlay.element);

  type ActiveCanvasDrag = {
    readonly pointerId: number;
    readonly item: StudioItem;
    readonly model: FrameEditModel;
    readonly gesture: FrameGesture;
    readonly startClientX: number;
    readonly startClientY: number;
    readonly startCanvasX: number;
    readonly startCanvasY: number;
    readonly initialBox: SpatialBox;
    readonly siblings: readonly SpatialBox[];
    readonly presentElements: readonly {
      readonly node: HTMLElement;
      readonly transform: string;
      readonly transformOrigin: string;
    }[];
    started: boolean;
    lastSolution?: FrameGestureSolution;
  };

  let activeDrag: ActiveCanvasDrag | undefined;
  let suppressNextClick = false;
  let pendingCommittedPreview: { readonly expectedMinRevision: number; readonly reset: () => void } | undefined;

  const presentNodesFor = (item: StudioItem): readonly HTMLElement[] => {
    const document_ = iframe.contentDocument;
    if (document_ === null) return [];
    const ids = item.renderIds.length > 0 ? item.renderIds : item.presentId === undefined ? [] : [item.presentId];
    return ids.flatMap((id) => {
      const found = document_.querySelector<HTMLElement>(`[data-hypit-present-id="${CSS.escape(id)}"]`);
      return found === null ? [] : [found];
    });
  };

  const applyPresentPreview = (
    presents: ActiveCanvasDrag["presentElements"],
    initialBox: SpatialBox,
    nextBox: SpatialBox,
  ): void => {
    const sx = nextBox.widthPx / Math.max(1e-6, initialBox.widthPx);
    const sy = nextBox.heightPx / Math.max(1e-6, initialBox.heightPx);
    const tx = nextBox.xPx - initialBox.xPx * sx;
    const ty = nextBox.yPx - initialBox.yPx * sy;
    for (const { node } of presents) {
      node.style.transformOrigin = "0 0";
      node.style.transform = `matrix(${sx},0,0,${sy},${tx},${ty})`;
    }
  };

  const restorePresentPreview = (presents: ActiveCanvasDrag["presentElements"]): void => {
    for (const { node, transform, transformOrigin } of presents) {
      node.style.transform = transform;
      node.style.transformOrigin = transformOrigin;
    }
  };

  const syncLiveInspectorFields = (solution: FrameGestureSolution | undefined, item: StudioItem): void => {
    if (solution === undefined) {
      for (const field of item.inspector) {
        const input = document.querySelector<HTMLInputElement>(`input[data-parameter-id="${CSS.escape(field.id)}"]`);
        if (input === null) continue;
        try {
          const text = typeof field.value === "string" ? field.value.trim() : String(field.value);
          const stripped = text.replace(/(?:px|%)$/u, "").trim();
          input.value = stripped;
        } catch { /* ignore */ }
      }
      return;
    }
    for (const edit of solution.edits) {
      const input = document.querySelector<HTMLInputElement>(`input[data-parameter-id="${CSS.escape(edit.parameterId)}"]`);
      if (input !== null) {
        input.step = Number.isInteger(edit.value) ? input.step : "any";
        input.value = String(edit.value);
      }
    }
  };

  const clearCommittedPreview = (): void => {
    if (pendingCommittedPreview === undefined) return;
    const held = pendingCommittedPreview;
    pendingCommittedPreview = undefined;
    held.reset();
  };

  const cancelActiveDrag = (): void => {
    if (activeDrag === undefined) return;
    const drag = activeDrag;
    activeDrag = undefined;
    try { scaler.releasePointerCapture(drag.pointerId); } catch { /* already released */ }
    if (drag.started) {
      restorePresentPreview(drag.presentElements);
      syncLiveInspectorFields(undefined, drag.item);
      overlay.setPreview(undefined);
    }
    scaler.dataset.dragging = "";
  };

  scaler.addEventListener("pointerdown", (event) => {
    if (reviewMode || event.button !== 0 || artifactPreview.selected !== undefined) return;
    const current = store.current();
    if (current === undefined) return;
    clearCommittedPreview();

    const point = overlay.canvasPoint(event.clientX, event.clientY);
    if (point === undefined) return;

    const handleTarget = (event.target as Element | null)?.closest("[data-stage-handle]")?.getAttribute("data-stage-handle") as FrameGesture | null | undefined;
    const hitHandle = handleTarget ?? overlay.handleAt(event.clientX, event.clientY);
    const currentSelected = current.selection.kind === "item" ? store.item(current.selection.itemId) : undefined;

    let targetItem: StudioItem | undefined;
    let gesture: FrameGesture = "move";

    if (hitHandle !== undefined && currentSelected !== undefined) {
      targetItem = currentSelected;
      gesture = hitHandle;
    } else {
      const hitItem = overlay.hitTest(event.clientX, event.clientY);
      if (hitItem === undefined) return;
      targetItem = hitItem;
      gesture = "move";
      if (currentSelected?.id !== hitItem.id) {
        store.select(hitItem.id, "video");
      }
    }

    const initialBox = overlay.itemBox(targetItem);
    if (initialBox === undefined) return;
    const model = resolveFrameEditModel({
      inspector: targetItem.inspector,
      canvas: current.snapshot.canvas,
      sourceFiles: current.snapshot.source.files,
      drawnBox: initialBox,
    });
    if (model === undefined) return;
    if (gesture === "move" && !model.canMoveX && !model.canMoveY) return;
    if (gesture !== "move" && !model.handles.has(gesture)) return;

    const siblings = overlay.siblingBoxes(targetItem.id);
    const presentElements = presentNodesFor(targetItem).map((node) => ({
      node,
      transform: node.style.transform,
      transformOrigin: node.style.transformOrigin,
    }));

    activeDrag = {
      pointerId: event.pointerId,
      item: targetItem,
      model,
      gesture,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCanvasX: point.xPx,
      startCanvasY: point.yPx,
      initialBox,
      siblings,
      presentElements,
      started: gesture !== "move",
    };

    if (gesture !== "move") {
      event.preventDefault();
      stop();
      scaler.dataset.dragging = gesture;
    }
    try { scaler.setPointerCapture(event.pointerId); } catch { /* local pointer */ }
  });

  scaler.addEventListener("pointermove", (event) => {
    if (activeDrag === undefined || event.pointerId !== activeDrag.pointerId) return;
    const current = store.current();
    if (current === undefined) return;
    if (!activeDrag.started) {
      if (Math.hypot(event.clientX - activeDrag.startClientX, event.clientY - activeDrag.startClientY) < 3) return;
      activeDrag.started = true;
      stop();
      scaler.dataset.dragging = activeDrag.gesture;
    }
    const point = overlay.canvasPoint(event.clientX, event.clientY);
    if (point === undefined) return;
    const solution = solveFrameGesture({
      model: activeDrag.model,
      initialBox: activeDrag.initialBox,
      gesture: activeDrag.gesture,
      deltaXPx: point.xPx - activeDrag.startCanvasX,
      deltaYPx: point.yPx - activeDrag.startCanvasY,
      canvas: current.snapshot.canvas,
      siblings: activeDrag.siblings,
      snapThresholdPx: 6 * point.unitPx,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      disableSnap: event.metaKey || event.ctrlKey,
    });
    activeDrag.lastSolution = solution;
    applyPresentPreview(activeDrag.presentElements, activeDrag.initialBox, solution.box);
    syncLiveInspectorFields(solution, activeDrag.item);
    const hud = activeDrag.gesture === "move"
      ? `${Math.round(solution.box.xPx)}, ${Math.round(solution.box.yPx)}`
      : `${Math.round(solution.box.widthPx)} × ${Math.round(solution.box.heightPx)}`;
    overlay.setPreview({
      itemId: activeDrag.item.id,
      box: solution.box,
      guides: solution.guides,
      ...(solution.gap === undefined ? {} : { gap: solution.gap }),
      hud,
    });
  });

  const finishCanvasDrag = (event: PointerEvent): void => {
    if (activeDrag === undefined || event.pointerId !== activeDrag.pointerId) return;
    const drag = activeDrag;
    activeDrag = undefined;
    scaler.dataset.dragging = "";
    try { scaler.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (!drag.started) return;
    suppressNextClick = true;

    if (event.type === "pointercancel" || drag.lastSolution === undefined || drag.lastSolution.edits.length === 0) {
      restorePresentPreview(drag.presentElements);
      syncLiveInspectorFields(undefined, drag.item);
      overlay.setPreview(undefined);
      return;
    }

    const current = store.current();
    if (current === undefined) {
      restorePresentPreview(drag.presentElements);
      overlay.setPreview(undefined);
      return;
    }

    const edits = drag.lastSolution.edits;
    const settledBox = drag.lastSolution.box;
    overlay.setPreview({ itemId: drag.item.id, box: settledBox, guides: [] });
    const resetVisuals = (): void => {
      restorePresentPreview(drag.presentElements);
      overlay.setPreview(undefined);
    };

    element.dispatchEvent(new CustomEvent("studio:write", { detail: { state: "saving" } }));
    void (async () => {
      let revision = current.snapshot.revision;
      for (const edit of edits) {
        revision = await applyStudioMutation({
          type: "parameter.adjust",
          revision,
          owner: { kind: "item", itemId: drag.item.id },
          parameterId: edit.parameterId,
          value: edit.value,
        });
      }
      pendingCommittedPreview = { expectedMinRevision: revision, reset: () => overlay.setPreview(undefined) };
      const latest = store.current();
      if (latest !== undefined && latest.snapshot.revision >= revision && ready) {
        clearCommittedPreview();
      }
      element.dispatchEvent(new CustomEvent("studio:write", { detail: { state: "saved" } }));
    })().catch((error: unknown) => {
      console.error(error);
      resetVisuals();
      syncLiveInspectorFields(undefined, drag.item);
      element.dispatchEvent(new CustomEvent("studio:write", { detail: { state: "error", error } }));
    });
  };

  scaler.addEventListener("pointerup", finishCanvasDrag);
  scaler.addEventListener("pointercancel", finishCanvasDrag);

  // Clicking the picture selects whatever is drawn under the pointer, which is
  // the third way into the same selection.
  scaler.addEventListener("click", (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSelectionMenu();
      if (activeDrag !== undefined) cancelActiveDrag();
    }
  });
  // The room around the picture is empty in the plainest sense.
  viewport.addEventListener("click", (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
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
  let fromFrame = 0;
  let began = 0;
  let placed = 0;

  const seekPicture = (frame: number): void => {
    const request = ++placed;
    void (iframe.contentWindow as SeekWindow | null)?.__hypitSeekFrame?.(frame).then((current) => {
      if (current && request === placed) {
        if (pendingCommittedPreview !== undefined && state !== undefined && state.snapshot.revision >= pendingCommittedPreview.expectedMinRevision) {
          clearCommittedPreview();
        }
        overlay.refresh();
      }
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
    const valid = Number.isFinite(scale) && scale > 0 ? scale : 1;
    scaler.style.width = `${canvasWidth * valid}px`;
    scaler.style.height = `${canvasHeight * valid}px`;
    iframe.style.width = `${canvasWidth}px`;
    iframe.style.height = `${canvasHeight}px`;
    iframe.style.transform = `scale(${valid})`;
    overlay.refresh();
  };

  const stop = (): void => {
    const wasPlaying = playing;
    playing = false;
    setIcon(playIcon, "play");
    uiAttr(play, "aria-label", "player.play");
    if (raf !== 0) cancelAnimationFrame(raf);
    raf = 0;
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
    uiAttr(play, "aria-label", "player.pause");
    const total = state.snapshot.timeline.frameCount;
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
  viewport.append(artifactPreview.element);
  const compositionTime = (): void => {
    if (state === undefined || artifactPreview.selected !== undefined) return;
    const rate = fps(state.snapshot);
    progress.hidden = scrubber.hidden = time.hidden = false;
    scrubber.disabled = !ready;
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
  };
  back.addEventListener("click", returnToComposition);

  const openArtifact = (artifact: StudioArtifactView): void => {
    cancelActiveDrag();
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
  };

  iframe.addEventListener("load", () => {
    ready = true;
    compositionTime();
    if (state !== undefined) seekPicture(state.playhead.frame);
    applyMuted();
    if (pendingCommittedPreview !== undefined && state !== undefined && state.snapshot.revision >= pendingCommittedPreview.expectedMinRevision) {
      clearCommittedPreview();
    }
    overlay.refresh();
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
      const preview = value.snapshot.preview;
      iframe.srcdoc = preview.srcdoc;
      fit();
    }
    if (first) fit();
    compositionTime();

    const jumped = value.playhead.origin !== "play";
    if (jumped && playing) {
      fromFrame = value.playhead.frame;
      began = performance.now();
    }
    if (!ready) return;
    const frame = (iframe.contentWindow as SeekWindow | null);
    if (playing) frame?.__hypitPlayFrame?.(value.playhead.frame);
    else seekPicture(value.playhead.frame);
    if (playing) overlay.refresh();
  });

  return { element, toggle, openArtifact,
    setReviewMode(enabled) {
      cancelActiveDrag();
      reviewMode = enabled;
      element.classList.toggle("stage-review", enabled);
      overlay.element.style.display = enabled ? "none" : "";
      closeSelectionMenu();
      if (!enabled) scrubPreview.clear();
    },
    pause() { stop(); artifactPreview.media?.pause(); },
    showComposition() { if (artifactPreview.selected !== undefined) returnToComposition(); },
    renameArtifact(artifact) {
      const selected = artifactPreview.selected;
      if (selected?.build === artifact.build && selected.output === artifact.output) userText(title, artifact.displayName ?? artifact.output);
    },
  };
}
