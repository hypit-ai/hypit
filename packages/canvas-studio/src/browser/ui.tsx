import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, X } from "lucide-react";
import { enterMotion, popupMotion } from "./motion.js";

import { t } from "./locale.js";
export { t, zh } from "./locale.js";

export function IconButton({ label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className={`icon-button ${className ?? ""}`} title={label} aria-label={label} {...props}/>;
}

export function Notice({ message, problem, close }: { message: string; problem: boolean; close: () => void }) {
  const reduced = useReducedMotion();
  return <AnimatePresence>{message && <motion.div {...enterMotion(reduced)} className={`canvas-notice${problem ? " problem" : ""}`} role={problem ? "alert" : "status"}>
    {problem && <AlertCircle size={18}/>}<span>{message}</span><IconButton label={t("Dismiss", "关闭提示")} onClick={close}><X size={15}/></IconButton>
  </motion.div>}</AnimatePresence>;
}

export function Dialog({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const reduced = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(<motion.dialog ref={dialog} aria-label={title} className={`canvas-dialog${wide ? " wide" : ""}`}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }} {...popupMotion(reduced, .8)}>
    <div className="canvas-dialog-inner">
      <header><strong>{title}</strong><IconButton label={t("Close", "关闭")} onClick={close}><X size={16}/></IconButton></header>
      {children}
    </div>
  </motion.dialog>, document.body);
}

export function DraftField({ value, revision, label, placeholder, multiline, numeric, onSave }: {
  value: string; revision: string; label?: string; placeholder?: string | undefined; multiline?: boolean; numeric?: boolean;
  onSave(value: string, revision: string): Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const base = useRef({ value, revision });
  const pending = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (draft === base.current.value) {
      base.current = { value, revision };
      setDraft(value);
    }
  }, [draft, value, revision]);
  async function save(expected = base.current.revision) {
    if (pending.current !== undefined || draft === base.current.value) return;
    pending.current = draft;
    try {
      await onSave(draft, expected);
      base.current = { value: draft, revision: expected };
      setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { pending.current = undefined; }
  }
  const props = {
    "aria-label": label, placeholder, value: draft,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.currentTarget.value),
    onBlur: () => void save(),
  };
  return <div className="graph-draft">
    {multiline ? <textarea {...props}/> : <input type={numeric ? "number" : "text"} step={numeric ? "any" : undefined} {...props}
      onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}/>}
    {error && <div className="graph-draft-error" role="alert"><span>{error}</span>
      <button type="button" onClick={() => void save(revision)}>{t("Apply draft", "应用草稿")}</button>
      <button type="button" onClick={() => { base.current = { value, revision }; setDraft(value); setError(""); }}>{t("Use current value", "使用当前值")}</button>
    </div>}
  </div>;
}
