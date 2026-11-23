import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react';

export const defaultPanelWidths = { bin: 416, properties: 360 };
// The Media bin fits the source column, import, search and three display controls.
export const minimumPanelWidths = { bin: 328, properties: 180 };
export const maximumPanelWidths = { bin: 704, properties: 900 };
export type PanelSide = keyof typeof defaultPanelWidths;

function focusResizeHandle(element: HTMLDivElement) {
  element.dataset.resizePointerFocus = '';
  element.focus({ preventScroll: true });
}

function clearResizePointerFocus(event: FocusEvent<HTMLDivElement>) {
  delete event.currentTarget.dataset.resizePointerFocus;
}

export function PanelResizeHandle({ side, label, width, onResize }: {
  side: PanelSide;
  label: string;
  width: number;
  onResize(width: number): void;
}) {
  const gesture = useRef<{ pointer: number; x: number; initial: number; value: number; max: number } | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const minimum = minimumPanelWidths[side];
  const maximumPreferred = maximumPanelWidths[side];
  const maximum = (element: HTMLElement) => {
    const panels = element.parentElement!;
    const available = panels.getBoundingClientRect().width;
    const limit = side === 'bin'
      ? available * (Number.parseFloat(getComputedStyle(panels).getPropertyValue('--nle-bin-share')) || 50) / 100
      : available > 860 ? available * .3 : available - 80;
    return Math.max(minimum, Math.min(maximumPreferred, Math.floor(limit)));
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    current.value = Math.round(Math.max(minimum, Math.min(current.max, current.initial + (event.clientX - current.x) * (side === 'bin' ? 1 : -1))));
    const property = side === 'bin' ? '--nle-bin-preferred' : '--nle-properties-preferred';
    event.currentTarget.closest<HTMLElement>('.nle-editor')?.style.setProperty(property, `${current.value}px`);
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointer !== event.pointerId) return;
    onResize(gesture.current.value);
    gesture.current = undefined;
    event.currentTarget.dataset.resizeReleased = '';
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className={`nle-panel-resizer nle-panel-resizer-${side}${dragging ? ' dragging' : ''}`} role="separator" aria-label={label} aria-orientation="vertical" aria-valuenow={Math.round(width)} aria-valuemin={minimum} aria-valuemax={maximumPreferred} tabIndex={0}
    onPointerLeave={event => { delete event.currentTarget.dataset.resizeReleased; }}
    onBlur={clearResizePointerFocus}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const panel = event.currentTarget.parentElement!.querySelector<HTMLElement>(side === 'bin' ? '.nle-bin' : '.nle-properties')!;
      const initial = panel.getBoundingClientRect().width;
      gesture.current = { pointer: event.pointerId, x: event.clientX, initial, value: initial, max: maximum(event.currentTarget) };
      delete event.currentTarget.dataset.resizeReleased;
      focusResizeHandle(event.currentTarget);
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={move} onPointerUp={event => { move(event); finish(event); }} onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      delete event.currentTarget.dataset.resizePointerFocus;
      const delta = (event.key === 'ArrowRight' ? 10 : -10) * (side === 'bin' ? 1 : -1);
      onResize(Math.max(minimum, Math.min(maximum(event.currentTarget), event.key === 'Home' ? defaultPanelWidths[side] : width + delta)));
    }}/>;
}

function timelineSize(handle: HTMLDivElement) {
  const layout = handle.parentElement!;
  return { layout, available: layout.clientHeight - handle.offsetHeight,
    height: handle.nextElementSibling!.getBoundingClientRect().height };
}

export function TimelineResizeHandle({ controls, onResize }: {
  readonly controls: string;
  readonly onResize: (share: number) => void;
}) {
  const handle = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointer: number; y: number; height: number; layout: HTMLElement } | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const [visibleShare, setVisibleShare] = useState(44);

  useEffect(() => {
    const element = handle.current!;
    const timeline = element.nextElementSibling!;
    const layout = element.parentElement!;
    const measure = () => {
      const available = layout.clientHeight - element.offsetHeight;
      const height = timeline.getBoundingClientRect().height;
      if (available > 0) setVisibleShare(Math.round(100 * height / available));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(layout);
    observer.observe(timeline);
    measure();
    return () => {
      observer.disconnect();
      gesture.current?.layout.style.removeProperty('--nle-timeline-draft');
    };
  }, []);

  const resize = (element: HTMLDivElement, height: number) => {
    const { layout, available } = timelineSize(element);
    if (available > 0) layout.style.setProperty('--nle-timeline-draft', String(Math.max(0, Math.min(1, height / available))));
  };
  const settle = (element: HTMLDivElement, initial: number | undefined) => {
    const { layout, available, height } = timelineSize(element);
    if (initial !== undefined && available > 0 && height !== initial && layout.style.getPropertyValue('--nle-timeline-draft') !== '') {
      const share = height / available;
      layout.style.setProperty('--nle-timeline-share', String(share));
      onResize(share);
    }
    layout.style.removeProperty('--nle-timeline-draft');
  };
  const finish = (element: HTMLDivElement, pointer: number, commit: boolean) => {
    const current = gesture.current;
    if (current?.pointer !== pointer) return;
    gesture.current = undefined;
    settle(element, commit ? current.height : undefined);
    setDragging(false);
    if (element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current?.pointer !== event.pointerId) return;
    if (event.clientY === current.y && current.layout.style.getPropertyValue('--nle-timeline-draft') === '') return;
    resize(event.currentTarget, current.height + current.y - event.clientY);
  };

  return <div ref={handle} className={`nle-panel-resizer nle-panel-resizer-timeline${dragging ? ' dragging' : ''}`}
    role="separator" aria-label="调整时间线高度" aria-orientation="horizontal" aria-controls={controls}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={visibleShare} aria-valuetext={`时间线占 ${visibleShare}%`} tabIndex={0}
    onBlur={clearResizePointerFocus}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      const { layout, height } = timelineSize(event.currentTarget);
      gesture.current = { pointer: event.pointerId, y: event.clientY, height, layout };
      focusResizeHandle(event.currentTarget);
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }}
    onPointerMove={move} onPointerUp={event => { move(event); finish(event.currentTarget, event.pointerId, true); }}
    onPointerCancel={event => finish(event.currentTarget, event.pointerId, false)}
    onLostPointerCapture={event => finish(event.currentTarget, event.pointerId, false)}
    onKeyDown={event => {
      if (gesture.current !== undefined) {
        if (event.key === 'Escape') { event.preventDefault(); finish(event.currentTarget, gesture.current.pointer, false); }
        return;
      }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      delete event.currentTarget.dataset.resizePointerFocus;
      const { height } = timelineSize(event.currentTarget);
      resize(event.currentTarget, height + (event.key === 'ArrowUp' ? 12 : -12));
      settle(event.currentTarget, height);
    }}/>;
}
