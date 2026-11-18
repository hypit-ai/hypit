import type { NleCanvasScene, NleCanvasSceneLayer } from "@hypit/nle/view";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import { fadeMotion } from "./motion.js";

type Frame = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type Mode = "move" | "nw" | "ne" | "se" | "sw";
type Guide = { readonly axis: "x" | "y"; readonly at: number };
export type CanvasDraft = { readonly id: string; readonly frame: Frame; readonly guides?: readonly Guide[] };

function snapFrame(frame: Frame, targets: readonly Frame[], tolerance: number) {
  const guides: Guide[] = [];
  const snap = (axis: Guide["axis"], size: "width" | "height") => {
    let best = tolerance;
    let result = frame[axis];
    let guide: number | undefined;
    for (const target of targets) {
      for (const fraction of [0, .5, 1]) {
        const at = target[axis] + target[size] * fraction;
        for (const offset of [0, frame[size] / 2, frame[size]]) {
          const distance = Math.abs(at - (frame[axis] + offset));
          if (distance > best) continue;
          best = distance;
          result = at - offset;
          guide = at;
        }
      }
    }
    if (guide !== undefined) guides.push({ axis, at: guide });
    return result;
  };
  const x = snap("x", "width"), y = snap("y", "height");
  return { x, y, guides };
}

export function CanvasControls({ scene, active, selection, disabled, draft, onDraft, onSelect, onTranslate, onResize }: {
  readonly scene: NleCanvasScene;
  readonly active: ReadonlySet<string>;
  readonly selection: readonly string[];
  readonly disabled: boolean;
  readonly draft: CanvasDraft | undefined;
  readonly onDraft: (value: CanvasDraft | undefined) => void;
  readonly onSelect: (ids: readonly string[]) => void;
  readonly onTranslate: (item: string, deltaX: number, deltaY: number) => Promise<void>;
  readonly onResize: (item: string, frame: Frame) => Promise<void>;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();
  const gesture = useRef<{ readonly pointer: number; readonly item: NleCanvasSceneLayer; readonly mode: Mode; readonly start: { x: number; y: number }; readonly initial: Frame; frame: Frame } | undefined>(undefined);
  const layers = scene.layers.filter(layer => active.has(layer.id) && layer.enabled && layer.trackEnabled && layer.layout !== undefined);
  const selected = layers.find(layer => selection.includes(layer.id));
  const point = (event: React.PointerEvent<SVGElement | SVGSVGElement>) => {
    const bounds = svg.current!.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width * scene.canvas.width, y: (event.clientY - bounds.top) / bounds.height * scene.canvas.height };
  };
  const cancel = useCallback(() => {
    const current = gesture.current; if (!current) return;
    gesture.current = undefined;
    if (svg.current?.hasPointerCapture(current.pointer)) svg.current.releasePointerCapture(current.pointer);
    onDraft(undefined);
  }, [onDraft]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && gesture.current) { event.preventDefault(); cancel(); } };
    window.addEventListener("keydown", key); window.addEventListener("blur", cancel);
    return () => { cancel(); window.removeEventListener("keydown", key); window.removeEventListener("blur", cancel); };
  }, [cancel]);
  useEffect(() => () => cancel(), [scene, active, disabled, cancel]);
  const begin = (event: React.PointerEvent<SVGElement>, item: NleCanvasSceneLayer, mode: Mode) => {
    if (disabled || event.button !== 0 || item.layout === undefined) return;
    if (mode === "move" && !item.affordances.translate) { onSelect([item.id]); return; }
    if (mode !== "move" && item.affordances.resize === false) return;
    event.preventDefault(); event.stopPropagation(); onSelect([item.id]);
    const initial = { x: item.layout.x, y: item.layout.y, width: item.layout.width, height: item.layout.height };
    gesture.current = { pointer: event.pointerId, item, mode, start: point(event), initial, frame: initial };
    svg.current!.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = gesture.current; if (!current || current.pointer !== event.pointerId) return;
    const at = point(event), dx = at.x - current.start.x, dy = at.y - current.start.y, minimum = current.item.affordances.resize === false ? { minimumWidth: 1, minimumHeight: 1 } : current.item.affordances.resize;
    let { x, y, width, height } = current.initial;
    let guides: readonly Guide[] = [];
    if (current.mode === "move") {
      x += dx; y += dy;
      if ((dx !== 0 || dy !== 0) && !event.ctrlKey && !event.metaKey) {
        const targets = [{ x: 0, y: 0, ...scene.canvas }, ...layers.flatMap(layer => layer.id === current.item.id || !layer.layout ? [] : [layer.layout])];
        ({ x, y, guides } = snapFrame({ x, y, width, height }, targets, 5 * scene.canvas.width / svg.current!.getBoundingClientRect().width));
      }
    }
    else if (event.shiftKey) {
      const west = current.mode.includes("w"), north = current.mode.includes("n");
      const horizontal = west ? -dx : dx, vertical = north ? -dy : dy;
      const scale = Math.max(minimum.minimumWidth / width, minimum.minimumHeight / height,
        1 + (horizontal * width + vertical * height) / (width * width + height * height));
      if (west) x += width * (1 - scale);
      if (north) y += height * (1 - scale);
      width *= scale;
      height *= scale;
    }
    else {
      if (current.mode.includes("w")) { const right = x + width; x = Math.min(right - minimum.minimumWidth, x + dx); width = right - x; }
      if (current.mode.includes("e")) width = Math.max(minimum.minimumWidth, width + dx);
      if (current.mode.includes("n")) { const bottom = y + height; y = Math.min(bottom - minimum.minimumHeight, y + dy); height = bottom - y; }
      if (current.mode.includes("s")) height = Math.max(minimum.minimumHeight, height + dy);
    }
    current.frame = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
    onDraft({ id: current.item.id, frame: current.frame, guides });
  };
  const finish = async (event: React.PointerEvent<SVGSVGElement>, abort = false) => {
    const current = gesture.current; if (!current || current.pointer !== event.pointerId) return;
    if (!abort) move(event);
    gesture.current = undefined;
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
    if (abort || JSON.stringify(current.initial) === JSON.stringify(current.frame)) { onDraft(undefined); return; }
    onDraft({ id: current.item.id, frame: current.frame });
    try {
      if (current.mode === "move") await onTranslate(current.item.id, current.frame.x - current.initial.x, current.frame.y - current.initial.y);
      else await onResize(current.item.id, current.frame);
    } finally { onDraft(undefined); }
  };
  const frame = selected?.layout && (draft?.id === selected.id ? draft.frame : selected.layout);
  const handles: readonly [Mode, number, number][] = frame ? [["nw", frame.x, frame.y], ["ne", frame.x + frame.width, frame.y], ["se", frame.x + frame.width, frame.y + frame.height], ["sw", frame.x, frame.y + frame.height]] : [];
  return <svg ref={svg} className="nle-transform-controls" viewBox={`0 0 ${scene.canvas.width} ${scene.canvas.height}`} onPointerMove={move} onPointerUp={finish} onPointerCancel={event => finish(event, true)} onLostPointerCapture={cancel}>
    {!disabled && layers.map(layer => { const value = draft?.id === layer.id ? draft.frame : layer.layout!; return <rect key={layer.id} className="nle-transform-hit" x={value.x} y={value.y} width={value.width} height={value.height} onPointerDown={event => begin(event, layer, "move")}/>; })}
    {selected && frame && <g className="nle-transform-selection"><rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="none" stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke" pointerEvents="none"/>{selected.affordances.resize !== false && handles.map(([mode, x, y]) => <circle key={mode} className="nle-transform-handle" cx={x} cy={y} r={5 * scene.canvas.width / Math.max(1, svg.current?.getBoundingClientRect().width ?? scene.canvas.width)} onPointerDown={event => begin(event, selected, mode)}/>)}</g>}
    <AnimatePresence>{draft?.guides?.map(({ axis, at }) => <motion.line key={axis} {...fadeMotion(reduced)} className="nle-transform-guide"
      x1={axis === "x" ? at : 0} x2={axis === "x" ? at : scene.canvas.width}
      y1={axis === "y" ? at : 0} y2={axis === "y" ? at : scene.canvas.height}/>)}</AnimatePresence>
  </svg>;
}
