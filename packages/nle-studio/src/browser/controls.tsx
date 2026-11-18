import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check as CheckIcon, ChevronDown, ChevronUp, Triangle } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { enterMotion, expandMotion } from "./motion.js";

export function Section({ title, children, defaultOpen = true }: { readonly title: ReactNode; readonly children: ReactNode; readonly defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const reduced = useReducedMotion();
  return <motion.section className="nle-section" {...enterMotion(reduced)}><header className="nle-section-header">
    <button type="button" className="nle-section-title" aria-expanded={open} onClick={() => setOpen(value => !value)}><span>{title}</span><Triangle size={7} fill="currentColor" strokeWidth={0} className={open ? "" : "collapsed"}/></button>
  </header><AnimatePresence initial={false}>{open && <motion.div className="nle-section-body" {...expandMotion(reduced)}><div className="nle-section-content">{children}</div></motion.div>}</AnimatePresence></motion.section>;
}

export function Row({ label, children }: { readonly label: ReactNode; readonly children: ReactNode }) {
  return <div className="nle-row"><span className="nle-row-label">{label}</span><div className="nle-row-content">{children}</div></div>;
}

export function NumberField({ value, min = -Infinity, max = Infinity, step = 1, precision = 2, disabled, label, onCommit }: {
  readonly value: number; readonly min?: number; readonly max?: number; readonly step?: number;
  readonly precision?: number;
  readonly disabled?: boolean; readonly label: string; readonly onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const cancelled = useRef(false);
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(precision);
  const commit = (raw: string) => {
    setDraft(undefined); const parsed = Number(raw);
    if (cancelled.current || raw.trim().length === 0 || !Number.isFinite(parsed)) return;
    const next = Math.max(min, Math.min(max, parsed));
    if (next !== value) onCommit(next);
  };
  return <span className={`nle-number${disabled ? " disabled" : ""}`}><span className="nle-number-box"><input aria-label={label} inputMode="decimal" disabled={disabled} value={draft ?? formatted} onFocus={event => { cancelled.current = false; setDraft(String(value)); requestAnimationFrame(() => event.target.select()); }} onChange={event => setDraft(event.target.value)} onBlur={event => commit(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { cancelled.current = true; setDraft(undefined); event.currentTarget.blur(); } }}/></span><span className="nle-stepper"><button type="button" tabIndex={-1} aria-label={`${label} +`} disabled={disabled || value >= max} onClick={() => onCommit(Math.min(max, value + step))}><ChevronUp size={10}/></button><button type="button" tabIndex={-1} aria-label={`${label} -`} disabled={disabled || value <= min} onClick={() => onCommit(Math.max(min, value - step))}><ChevronDown size={10}/></button></span></span>;
}

export function Toggle({ checked, disabled, label, onChange }: { readonly checked: boolean; readonly disabled?: boolean; readonly label: string; readonly onChange: (value: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`nle-toggle${checked ? " on" : ""}`} onClick={() => onChange(!checked)}><span/></button>;
}

export function Check({ checked, disabled, label, onChange }: { readonly checked: boolean; readonly disabled?: boolean; readonly label: string; readonly onChange: (value: boolean) => void }) {
  return <button type="button" role="checkbox" aria-checked={checked} aria-label={label} disabled={disabled} className={`nle-check${checked ? " on" : ""}`} onClick={() => onChange(!checked)}><CheckIcon size={10} strokeWidth={3}/></button>;
}
