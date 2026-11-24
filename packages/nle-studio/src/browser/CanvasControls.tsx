import type { NleCanvasScene, NleCanvasSceneLayer } from "@hypit/nle/surface";
import type { NlePictureFrame } from "@hypit/nle";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fadeMotion } from "./motion.js";

type Frame = NlePictureFrame;
type Mode = "move" | "nw" | "ne" | "se" | "sw";
type Guide = { readonly axis: "x" | "y"; readonly at: number; readonly offset: number };
export type CanvasDraft = { readonly id: string; readonly initial: Frame; readonly frame: Frame; readonly guides?: readonly Guide[] };

function snapFrame(frame: Frame, targets: readonly Frame[], tolerance: number, held: readonly Guide[]) {
  const guides: Guide[] = [];
  const snap = (axis: Guide["axis"], size: "width" | "height") => {
    const retained = held.find(guide => guide.axis === axis);
    if (retained !== undefined && Math.abs(retained.at - frame[axis] - retained.offset) <= tolerance * 1.7) {
      guides.push(retained);
      return retained.at - retained.offset;
    }
    let best = tolerance;
    let result = frame[axis];
    let guide: Guide | undefined;
    for (const target of targets) {
      for (const fraction of [0, .5, 1]) {
        const at = target[axis] + target[size] * fraction;
        for (const offset of [0, frame[size] / 2, frame[size]]) {
          const distance = Math.abs(at - (frame[axis] + offset));
          if (distance > best || (guide !== undefined && distance === best)) continue;
          best = distance;
          result = at - offset;
          guide = { axis, at, offset };
        }
      }
    }
    if (guide !== undefined) guides.push(guide);
    return result;
  };
  const x = snap("x", "width"), y = snap("y", "height");
  return { x, y, guides };
}

export function CanvasControls({ scene, active, selection, disabled, draft, onDraft, onSelect, onCommit }: {
  readonly scene: NleCanvasScene;
  readonly active: ReadonlySet<string>;
  readonly selection: readonly string[];
  readonly disabled: boolean;
  readonly draft: CanvasDraft | undefined;
  readonly onDraft: (value: CanvasDraft | undefined) => void;
  readonly onSelect: (ids: readonly string[]) => void;
  readonly onCommit: (draft: CanvasDraft) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [liveDraft, setLiveDraft] = useState<CanvasDraft>();
  const reduced = useReducedMotion();
  const gesture = useRef<{ readonly pointer: number; readonly item: NleCanvasSceneLayer; readonly mode: Mode;
    readonly initial: Frame; readonly x: number; readonly y: number; readonly scale: number;
    frame: Frame; moved: boolean; guides: readonly Guide[] } | undefined>(undefined);
  const layers = scene.layers.filter(layer => active.has(layer.id) && layer.enabled && layer.trackPictureEnabled && layer.layout !== undefined);
  const selected = layers.find(layer => selection.includes(layer.id));
  const cancel = useCallback(() => {
    const current = gesture.current; if (!current) return;
    gesture.current = undefined;
    if (svg.current?.hasPointerCapture(current.pointer)) svg.current.releasePointerCapture(current.pointer);
    setLiveDraft(undefined);
    onDraft(undefined);
  }, [onDraft]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && gesture.current) { event.preventDefault(); cancel(); } };
    window.addEventListener("keydown", key, true); window.addEventListener("blur", cancel);
    return () => { cancel(); window.removeEventListener("keydown", key, true); window.removeEventListener("blur", cancel); };
  }, [cancel]);
  useEffect(() => () => cancel(), [scene, active, disabled, cancel]);
  const begin = (event: React.PointerEvent<SVGElement>, item: NleCanvasSceneLayer, mode: Mode) => {
    if (disabled || event.button !== 0 || item.layout === undefined) return;
    if (mode === "move" && !item.affordances.translate) { event.stopPropagation(); onSelect([item.id]); return; }
    if (mode !== "move" && item.affordances.resize === false) return;
    event.preventDefault(); event.stopPropagation(); onSelect([item.id]);
    const initial = { x: item.layout.x, y: item.layout.y, width: item.layout.width, height: item.layout.height };
    const scale = scene.canvas.width / svg.current!.getBoundingClientRect().width;
    if (!Number.isFinite(scale) || scale <= 0) return;
    gesture.current = { pointer: event.pointerId, item, mode, x: event.clientX, y: event.clientY,
      scale, initial, frame: initial, moved: false, guides: [] };
    svg.current!.setPointerCapture(event.pointerId);
  };
  const update = (event: React.PointerEvent<SVGSVGElement>, current: NonNullable<typeof gesture.current>): CanvasDraft | undefined => {
    const xMotion = event.clientX - current.x, yMotion = event.clientY - current.y;
    current.moved ||= Math.hypot(xMotion, yMotion) >= 3;
    if (!current.moved) return;
    const dx = xMotion * current.scale, dy = yMotion * current.scale;
    const minimum = current.item.affordances.resize === false ? { minimumWidth: 1, minimumHeight: 1 } : current.item.affordances.resize;
    let { x, y, width, height } = current.initial;
    let guides: readonly Guide[] = [];
    if (current.mode === "move") {
      x += dx; y += dy;
      if ((dx !== 0 || dy !== 0) && !event.ctrlKey && !event.metaKey) {
        const targets = [{ x: 0, y: 0, ...scene.canvas }, ...layers.flatMap(layer => layer.id === current.item.id || !layer.layout ? [] : [layer.layout])];
        ({ x, y, guides } = snapFrame({ x, y, width, height }, targets, 5 * current.scale, current.guides));
      }
    }
    else {
      const west = current.mode.includes("w"), north = current.mode.includes("n");
      const horizontal = west ? -dx : dx, vertical = north ? -dy : dy;
      const scale = Math.max(minimum.minimumWidth / width, minimum.minimumHeight / height,
        1 + (horizontal * width + vertical * height) / (width * width + height * height));
      if (west) x += width * (1 - scale);
      if (north) y += height * (1 - scale);
      width *= scale;
      height *= scale;
    }
    current.frame = { x, y, width, height };
    current.guides = guides;
    return { id: current.item.id, initial: current.initial, frame: current.frame, guides };
  };
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (current === undefined || current.pointer !== event.pointerId) return;
    const next = update(event, current);
    if (next !== undefined) {
      setLiveDraft(next);
      onDraft(next);
    }
  };
  const finish = (event: React.PointerEvent<SVGSVGElement>, abort = false) => {
    const current = gesture.current; if (!current || current.pointer !== event.pointerId) return;
    const next = abort ? undefined : update(event, current);
    gesture.current = undefined;
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
    setLiveDraft(undefined);
    if (next === undefined || JSON.stringify(current.initial) === JSON.stringify(current.frame)) { onDraft(undefined); return; }
    onCommit(next);
  };
  const visibleDraft = liveDraft ?? draft;
  const frame = selected?.layout && (visibleDraft?.id === selected.id ? visibleDraft.frame : selected.layout);
  const handles: readonly [Mode, number, number][] = frame ? [["nw", frame.x, frame.y], ["ne", frame.x + frame.width, frame.y], ["se", frame.x + frame.width, frame.y + frame.height], ["sw", frame.x, frame.y + frame.height]] : [];
  return <svg ref={svg} className="nle-transform-controls" viewBox={`0 0 ${scene.canvas.width} ${scene.canvas.height}`} onPointerMove={move} onPointerUp={finish} onPointerCancel={event => finish(event, true)} onLostPointerCapture={cancel}>
    {!disabled && <rect className="nle-transform-background" width={scene.canvas.width} height={scene.canvas.height}
      onPointerDown={event => { if (event.button === 0) onSelect([]); }}/>}
    {!disabled && layers.map(layer => {
      const value = visibleDraft?.id === layer.id ? visibleDraft.frame : layer.layout!;
      const x = Math.max(0, value.x), y = Math.max(0, value.y);
      const width = Math.min(scene.canvas.width, value.x + value.width) - x;
      const height = Math.min(scene.canvas.height, value.y + value.height) - y;
      if (width <= 0 || height <= 0) return null;
      return <rect key={layer.id} className="nle-transform-hit" x={x} y={y} width={width} height={height}
        onPointerDown={event => begin(event, layer, "move")}/>;
    })}
    {selected && frame && <g className="nle-transform-selection">
      <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="none" stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
      {selected.affordances.resize !== false && handles.map(([mode, x, y]) => <circle key={mode}
        className="nle-transform-handle" data-corner={mode} cx={x} cy={y}
        r={5 * scene.canvas.width / Math.max(1, svg.current?.getBoundingClientRect().width ?? scene.canvas.width)}
        onPointerDown={event => begin(event, selected, mode)}/>)}
    </g>}
    <AnimatePresence>{visibleDraft?.guides?.map(({ axis, at }) => <motion.line key={axis} {...fadeMotion(reduced)} className="nle-transform-guide"
      x1={axis === "x" ? at : 0} x2={axis === "x" ? at : scene.canvas.width}
      y1={axis === "y" ? at : 0} y2={axis === "y" ? at : scene.canvas.height}/>)}</AnimatePresence>
  </svg>;
}
