import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";

type CanvasSize = { readonly width: number; readonly height: number };

type EditorDialogProps = {
  readonly title: string;
  readonly onClose: () => void;
} & (
  | { readonly initialName: string; readonly canvas?: CanvasSize; readonly onSubmit: (name: string, canvas?: CanvasSize) => void }
  | { readonly initialName?: never; readonly canvas: CanvasSize; readonly onSubmit: (canvas: CanvasSize) => void }
);

export function EditorDialog(props: EditorDialogProps) {
  const { title, initialName, canvas, onClose } = props;
  const [open, setOpen] = useState(true);
  const [name, setName] = useState(initialName ?? ""), [width, setWidth] = useState(canvas?.width ?? 1920), [height, setHeight] = useState(canvas?.height ?? 1080);
  return <Dialog.Root open={open} onOpenChange={setOpen} onOpenChangeComplete={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Backdrop className="studio-dialog-backdrop"/><Dialog.Popup className="studio-dialog modal"><Dialog.Title>{title}</Dialog.Title><form onSubmit={event => {
    event.preventDefault();
    if (props.initialName === undefined) props.onSubmit({ width, height });
    else {
      if (!name.trim()) return;
      props.onSubmit(name.trim(), canvas ? { width, height } : undefined);
    }
    setOpen(false);
  }}>
    {initialName !== undefined && <label>名称<input autoFocus required value={name} onChange={event => setName(event.target.value)} onFocus={event => event.target.select()}/></label>}
    {canvas && <div className="studio-dialog-size"><label>画布宽度<input type="number" min={1} autoFocus={initialName === undefined} required value={width} onChange={event => setWidth(Number(event.target.value))}/></label><label>画布高度<input type="number" min={1} required value={height} onChange={event => setHeight(Number(event.target.value))}/></label></div>}
    <footer><button type="button" className="button" onClick={() => setOpen(false)}>取消</button><button type="submit" className="button primary">确定</button></footer>
  </form></Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
