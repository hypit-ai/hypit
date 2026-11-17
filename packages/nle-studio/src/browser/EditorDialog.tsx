import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";

export function EditorDialog({ title, initialName, canvas, onClose, onSubmit }: {
  readonly title: string;
  readonly initialName: string;
  readonly canvas?: { readonly width: number; readonly height: number };
  readonly onClose: () => void;
  readonly onSubmit: (name: string, canvas?: { width: number; height: number }) => void;
}) {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState(initialName), [width, setWidth] = useState(canvas?.width ?? 1920), [height, setHeight] = useState(canvas?.height ?? 1080);
  return <Dialog.Root open={open} onOpenChange={setOpen} onOpenChangeComplete={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Backdrop className="studio-dialog-backdrop"/><Dialog.Popup className="studio-dialog modal"><Dialog.Title>{title}</Dialog.Title><form onSubmit={event => { event.preventDefault(); if (!name.trim()) return; onSubmit(name.trim(), canvas ? { width, height } : undefined); setOpen(false); }}>
    <label>名称<input autoFocus required value={name} onChange={event => setName(event.target.value)} onFocus={event => event.target.select()}/></label>
    {canvas && <div className="studio-dialog-size"><label>画布宽度<input type="number" min={1} required value={width} onChange={event => setWidth(Number(event.target.value))}/></label><label>画布高度<input type="number" min={1} required value={height} onChange={event => setHeight(Number(event.target.value))}/></label></div>}
    <footer><button type="button" className="button" onClick={() => setOpen(false)}>取消</button><button type="submit" className="button primary">确定</button></footer>
  </form></Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
