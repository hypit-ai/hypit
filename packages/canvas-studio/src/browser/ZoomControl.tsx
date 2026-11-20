import { useEffect, useRef, useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { useViewport } from '@xyflow/react';
import { maxZoom, minZoom } from './viewport.js';

export type ZoomCommand = { id: string; label: string; shortcut?: string; disabled?: boolean; separatorBefore?: boolean; run(): void };

const minPercent = Math.round(minZoom * 100), maxPercent = Math.round(maxZoom * 100);

/** The zoom percentage. Opening it turns the percentage into a field that takes 8–800 and shows the zoom commands above. */
export function ZoomControl({ label, commands, onZoomTo }: { label: string; commands: ZoomCommand[]; onZoomTo(percent: number): void }) {
  const { zoom } = useViewport(), percent = Math.round(zoom * 100);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(''), edited = useRef(false);
  const input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null);
  // A committed value shows until the viewport reaches it, or for 400ms at most.
  const [pending, setPending] = useState<number>();
  useEffect(() => { if (pending === percent) setPending(undefined); }, [pending, percent]);
  useEffect(() => { if (pending === undefined) return; const timer = setTimeout(() => setPending(undefined), 400); return () => clearTimeout(timer); }, [pending]);
  const shown = pending ?? percent;
  useEffect(() => { if (open && !edited.current && document.activeElement !== input.current) setDraft(String(percent)); }, [open, percent]);
  // The menu takes focus when it opens; the field takes it back on the next frame, with its value selected.
  const focusField = () => { input.current?.focus({ preventScroll: true }); input.current?.select(); };
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(focusField);
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const reset = () => { edited.current = false; setDraft(String(percent)); };
  const commit = () => {
    if (!edited.current) return;
    edited.current = false;
    const value = /^\d+%?$/.test(draft.trim()) ? Number.parseInt(draft, 10) : NaN;
    if (!Number.isSafeInteger(value)) { setDraft(String(percent)); return; }
    const next = Math.min(maxPercent, Math.max(minPercent, value));
    setPending(next); setDraft(String(next)); onZoomTo(next);
  };
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  return <Menu.Root modal={false} open={open} onOpenChangeComplete={next => { if (next) focusField(); }} onOpenChange={(next, details) => {
    if (next) { reset(); setOpen(true); return; }
    // Pressing in the field or moving focus into it keeps the menu open.
    const event = details.event as (Event & { relatedTarget?: EventTarget | null }) | undefined;
    if ((details.reason === 'outside-press' || details.reason === 'focus-out') && input.current && (event?.target === input.current || event?.relatedTarget === input.current)) { details.cancel(); return; }
    commit(); setOpen(false);
  }}>
    <div className="graph-zoom">
      <Menu.Trigger ref={trigger} className="graph-zoom-trigger" aria-label={`${label}, ${shown}%`} data-editing={open} tabIndex={open ? -1 : undefined}>{shown}%</Menu.Trigger>
      {open && <input ref={input} className="graph-zoom-input" aria-label={label} inputMode="numeric" pattern="[0-9]*" autoComplete="off" spellCheck={false} value={draft}
        onChange={event => { edited.current = true; setDraft(event.currentTarget.value.replace(/\D+/g, '')); }}
        onBlur={() => { if (!edited.current) setDraft(String(percent)); }}
        onKeyDown={event => {
          if (['ArrowDown', 'Home', 'ArrowUp', 'End'].includes(event.key)) {
            event.preventDefault(); event.stopPropagation();
            const items = document.querySelectorAll<HTMLElement>('.graph-zoom-menu [role="menuitem"]');
            items.item(event.key === 'ArrowUp' || event.key === 'End' ? items.length - 1 : 0)?.focus();
          } else if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation();
            if (event.key === 'Escape') reset(); else commit();
            close();
          }
        }}/>}
    </div>
    <Menu.Portal><Menu.Positioner className="dropdown-positioner" side="top" align="end" sideOffset={12} collisionPadding={16}>
      <Menu.Popup className="dropdown-content dropdown-menu graph-zoom-menu nowheel" data-dropdown-content="" finalFocus={false}>
        {commands.map(command => <div key={command.id} className="graph-zoom-menu-group">
          {command.separatorBefore && <Menu.Separator className="dropdown-separator"/>}
          <Menu.Item className="dropdown-item graph-zoom-item" disabled={command.disabled} closeOnClick={false} onClick={() => { edited.current = false; command.run(); }}>
            <span>{command.label}</span><span aria-hidden="true" className="graph-zoom-shortcut">{command.shortcut ?? ''}</span>
          </Menu.Item>
        </div>)}
      </Menu.Popup>
    </Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
