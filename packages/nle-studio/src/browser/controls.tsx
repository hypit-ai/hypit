import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check as CheckIcon, ChevronDown, ChevronUp, Triangle } from "lucide-react";
import { useState, type ReactNode } from "react";

export function Section({ title, children, defaultOpen = true }: { readonly title: ReactNode; readonly children: ReactNode; readonly defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const reduced = useReducedMotion();
  return <section className="nle-section"><header className="nle-section-header">
    <button type="button" className="nle-section-title" aria-expanded={open} onClick={() => setOpen(value => !value)}><span>{title}</span><Triangle size={7} fill="currentColor" strokeWidth={0} className={open ? "" : "collapsed"}/></button>
  </header><AnimatePresence initial={false}>{open && <motion.div className="nle-section-body" initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduced ? {} : { height: 0, opacity: 0 }}><div className="nle-section-content">{children}</div></motion.div>}</AnimatePresence></section>;
}

export function Row({ label, children }: { readonly label: ReactNode; readonly children: ReactNode }) {
  return <div className="nle-row"><span className="nle-row-label">{label}</span><div className="nle-row-content">{children}</div></div>;
}

export function NumberField({ value, min = -Infinity, max = Infinity, step = 1, disabled, label, onCommit }: {
  readonly value: number; readonly min?: number; readonly max?: number; readonly step?: number;
  readonly disabled?: boolean; readonly label: string; readonly onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const commit = (raw: string) => {
    setDraft(undefined); const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const next = Math.max(min, Math.min(max, parsed));
    if (next !== value) onCommit(next);
  };
  return <span className={`nle-number${disabled ? " disabled" : ""}`}><span className="nle-number-box"><input aria-label={label} disabled={disabled} value={draft ?? String(value)} onFocus={event => { setDraft(String(value)); requestAnimationFrame(() => event.target.select()); }} onChange={event => setDraft(event.target.value)} onBlur={event => commit(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}/></span><span className="nle-stepper"><button type="button" tabIndex={-1} disabled={disabled || value >= max} onClick={() => onCommit(Math.min(max, value + step))}><ChevronUp size={10}/></button><button type="button" tabIndex={-1} disabled={disabled || value <= min} onClick={() => onCommit(Math.max(min, value - step))}><ChevronDown size={10}/></button></span></span>;
}

export function Toggle({ checked, disabled, label, onChange }: { readonly checked: boolean; readonly disabled?: boolean; readonly label: string; readonly onChange: (value: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`nle-toggle${checked ? " on" : ""}`} onClick={() => onChange(!checked)}><span/></button>;
}

export function Check({ checked, disabled, label, onChange }: { readonly checked: boolean; readonly disabled?: boolean; readonly label: string; readonly onChange: (value: boolean) => void }) {
  return <button type="button" role="checkbox" aria-checked={checked} aria-label={label} disabled={disabled} className={`nle-check${checked ? " on" : ""}`} onClick={() => onChange(!checked)}><CheckIcon size={10} strokeWidth={3}/></button>;
}
