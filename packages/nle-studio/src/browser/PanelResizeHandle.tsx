import { useRef, useState, type PointerEvent } from 'react';

export const defaultPanelWidths = { bin: 560, properties: 360 };
export type PanelSide = keyof typeof defaultPanelWidths;

export function PanelResizeHandle({ side, label, width, onResize }: {
  side: PanelSide;
  label: string;
  width: number;
  onResize(width: number, save: boolean): void;
}) {
  const gesture = useRef<{ pointer: number; x: number; initial: number; value: number; max: number } | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const maximum = (element: HTMLElement) => {
    const available = element.parentElement!.getBoundingClientRect().width;
    return Math.max(180, Math.min(900, available > 860 ? available * (side === 'bin' ? .46 : .3) : available - (side === 'bin' ? 240 : 80)));
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    current.value = Math.round(Math.max(180, Math.min(current.max, current.initial + (event.clientX - current.x) * (side === 'bin' ? 1 : -1))));
    onResize(current.value, false);
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointer !== event.pointerId) return;
    onResize(gesture.current.value, true);
    gesture.current = undefined;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className={`nle-panel-resizer nle-panel-resizer-${side}${dragging ? ' dragging' : ''}`} role="separator" aria-label={label} aria-orientation="vertical" aria-valuenow={Math.round(width)} aria-valuemin={180} aria-valuemax={900} tabIndex={0}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const panel = event.currentTarget.parentElement!.querySelector<HTMLElement>(side === 'bin' ? '.nle-bin' : '.nle-properties')!;
      const initial = panel.getBoundingClientRect().width;
      gesture.current = { pointer: event.pointerId, x: event.clientX, initial, value: initial, max: maximum(event.currentTarget) };
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={move} onPointerUp={event => { move(event); finish(event); }} onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      const delta = (event.key === 'ArrowRight' ? 10 : -10) * (side === 'bin' ? 1 : -1);
      onResize(Math.max(180, Math.min(maximum(event.currentTarget), event.key === 'Home' ? defaultPanelWidths[side] : width + delta)), true);
    }}/>;
}

export const minimumTimelineHeight = 220, minimumUpperHeight = 240;

/**
 * Horizontal separator between the upper panels and the Timeline. Dragging sets the Timeline height; `undefined`
 * returns to the default proportional height (double-click or Home).
 */
export function TimelineResizeHandle({ height, onResize }: {
  height: number | undefined;
  onResize(height: number | undefined, save: boolean): void;
}) {
  const gesture = useRef<{ pointer: number; y: number; initial: number; value: number; max: number } | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const bounds = (element: HTMLElement) => {
    const editor = element.parentElement!, timeline = editor.querySelector<HTMLElement>(':scope > .nle-timeline');
    const upper = editor.querySelector<HTMLElement>(':scope > .nle-upper');
    const current = timeline?.getBoundingClientRect().height ?? minimumTimelineHeight;
    const room = current + (upper?.getBoundingClientRect().height ?? minimumUpperHeight);
    return { current, max: Math.max(minimumTimelineHeight, room - minimumUpperHeight) };
  };
  const clamp = (value: number, max: number) => Math.round(Math.max(minimumTimelineHeight, Math.min(max, value)));
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    current.value = clamp(current.initial - (event.clientY - current.y), current.max);
    onResize(current.value, false);
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointer !== event.pointerId) return;
    onResize(gesture.current.value, true);
    gesture.current = undefined;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className={`nle-timeline-resizer${dragging ? ' dragging' : ''}`} role="separator" aria-label="调整时间线高度" aria-orientation="horizontal"
    aria-valuenow={height === undefined ? undefined : Math.round(height)} aria-valuemin={minimumTimelineHeight} tabIndex={0} title="拖动调整时间线高度，双击恢复默认"
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const { current, max } = bounds(event.currentTarget);
      gesture.current = { pointer: event.pointerId, y: event.clientY, initial: current, value: current, max };
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={move} onPointerUp={event => { move(event); finish(event); }} onPointerCancel={finish} onLostPointerCapture={finish}
    onDoubleClick={() => onResize(undefined, true)}
    onKeyDown={event => {
      if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') { onResize(undefined, true); return; }
      const { current, max } = bounds(event.currentTarget);
      onResize(clamp(current + (event.key === 'ArrowUp' ? 10 : -10), max), true);
    }}/>;
}
