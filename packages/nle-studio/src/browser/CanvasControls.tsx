import type { NleCanvasScene, NleCanvasSceneLayer } from "@hypit/nle/view";
import { useEffect, useRef, useState } from "react";

type Frame = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type Mode = "move" | "nw" | "ne" | "se" | "sw";

export function CanvasControls({ scene, active, selection, disabled, onSelect, onTranslate, onResize }: {
  readonly scene: NleCanvasScene;
  readonly active: ReadonlySet<string>;
  readonly selection: readonly string[];
  readonly disabled: boolean;
  readonly onSelect: (ids: readonly string[]) => void;
  readonly onTranslate: (item: string, deltaX: number, deltaY: number) => void;
  readonly onResize: (item: string, frame: Frame) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<{ readonly id: string; readonly frame: Frame }>();
  const gesture = useRef<{ readonly pointer: number; readonly item: NleCanvasSceneLayer; readonly mode: Mode; readonly start: { x: number; y: number }; readonly initial: Frame; frame: Frame } | undefined>(undefined);
  const layers = scene.layers.filter(layer => active.has(layer.id) && layer.enabled && layer.trackEnabled && layer.layout !== undefined);
  const selected = layers.find(layer => selection.includes(layer.id));
  const point = (event: React.PointerEvent<SVGElement | SVGSVGElement>) => {
    const bounds = svg.current!.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width * scene.canvas.width, y: (event.clientY - bounds.top) / bounds.height * scene.canvas.height };
  };
  const cancel = () => { gesture.current = undefined; setDraft(undefined); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && gesture.current) { event.preventDefault(); cancel(); } };
    window.addEventListener("keydown", key); window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("blur", cancel); };
  }, []);
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
    if (current.mode === "move") { x += dx; y += dy; }
    else {
      if (current.mode.includes("w")) { const right = x + width; x = Math.min(right - minimum.minimumWidth, x + dx); width = right - x; }
      if (current.mode.includes("e")) width = Math.max(minimum.minimumWidth, width + dx);
      if (current.mode.includes("n")) { const bottom = y + height; y = Math.min(bottom - minimum.minimumHeight, y + dy); height = bottom - y; }
      if (current.mode.includes("s")) height = Math.max(minimum.minimumHeight, height + dy);
    }
    current.frame = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
    setDraft({ id: current.item.id, frame: current.frame });
  };
  const finish = (event: React.PointerEvent<SVGSVGElement>, abort = false) => {
    const current = gesture.current; if (!current || current.pointer !== event.pointerId) return;
    if (!abort) move(event);
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
    gesture.current = undefined; setDraft(undefined);
    if (abort || JSON.stringify(current.initial) === JSON.stringify(current.frame)) return;
    if (current.mode === "move") onTranslate(current.item.id, current.frame.x - current.initial.x, current.frame.y - current.initial.y);
    else onResize(current.item.id, current.frame);
  };
  const frame = selected?.layout && (draft?.id === selected.id ? draft.frame : selected.layout);
  const handles: readonly [Mode, number, number][] = frame ? [["nw", frame.x, frame.y], ["ne", frame.x + frame.width, frame.y], ["se", frame.x + frame.width, frame.y + frame.height], ["sw", frame.x, frame.y + frame.height]] : [];
  return <svg ref={svg} className="nle-transform-controls" viewBox={`0 0 ${scene.canvas.width} ${scene.canvas.height}`} onPointerMove={move} onPointerUp={finish} onPointerCancel={event => finish(event, true)}>
    {!disabled && layers.map(layer => { const value = draft?.id === layer.id ? draft.frame : layer.layout!; return <rect key={layer.id} className="nle-transform-hit" x={value.x} y={value.y} width={value.width} height={value.height} onPointerDown={event => begin(event, layer, "move")}/>; })}
    {selected && frame && <g className="nle-transform-selection"><rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="none" stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke" pointerEvents="none"/>{selected.affordances.resize !== false && handles.map(([mode, x, y]) => <circle key={mode} className="nle-transform-handle" cx={x} cy={y} r={5 * scene.canvas.width / Math.max(1, svg.current?.getBoundingClientRect().width ?? scene.canvas.width)} onPointerDown={event => begin(event, selected, mode)}/>)}</g>}
  </svg>;
}
