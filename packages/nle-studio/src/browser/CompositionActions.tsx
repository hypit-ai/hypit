import { Menu } from "@base-ui/react/menu";
import { ChevronDown, Copy, Layers, Maximize, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import type { NleComposition } from "@hypit/nle";
import { EditorDialog } from "./EditorDialog.js";
import { IconButton } from "./common.js";

export function NewCompositionButton({ canvas, disabled, onCreate }: {
  readonly canvas: NleComposition["canvas"];
  readonly disabled: boolean;
  readonly onCreate: (name: string, canvas: NleComposition["canvas"]) => void;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <IconButton className="nle-timeline-tab-add" label="新建时间线" disabled={disabled} onClick={() => setOpen(true)}><Plus size={16}/></IconButton>
    {open && <EditorDialog title="新建时间线" initialName="新时间线" canvas={canvas}
      onClose={() => setOpen(false)} onSubmit={(name, size) => { if (size) onCreate(name, size); }}/>}
  </>;
}

export function CompositionActions({ composition, disabled, root, referenced, canInsert,
  onRename, onResize, onInsert, onCopy, onRoot, onRemove }: {
  readonly composition: Pick<NleComposition, "name" | "canvas">;
  readonly disabled: boolean;
  readonly root: boolean;
  readonly referenced: boolean;
  readonly canInsert: boolean;
  readonly onRename: (name: string) => void;
  readonly onResize: (canvas: NleComposition["canvas"]) => void;
  readonly onInsert: () => void;
  readonly onCopy: () => void;
  readonly onRoot: () => void;
  readonly onRemove: () => void;
}) {
  const [dialog, setDialog] = useState<"rename" | "resize">();
  return <>
    <Menu.Root modal={false}>
      <Menu.Trigger className="icon-button nle-timeline-tab-menu" disabled={disabled}
        aria-label={`${composition.name} 的菜单`} title={`${composition.name} 的菜单`}><ChevronDown size={14}/></Menu.Trigger>
      <Menu.Portal><Menu.Positioner className="dropdown-positioner" side="bottom" sideOffset={6} align="end">
        <Menu.Popup className="dropdown-content dropdown-menu">
          <Menu.Item className="dropdown-item" onClick={() => setDialog("rename")}><Pencil size={16}/>重命名</Menu.Item>
          <Menu.Item className="dropdown-item" onClick={() => setDialog("resize")}><Maximize size={16}/>调整画布尺寸</Menu.Item>
          <Menu.Separator className="dropdown-separator"/>
          <Menu.Item className="dropdown-item" disabled={!canInsert} onClick={onInsert}><Layers size={16}/>插入到当前时间线</Menu.Item>
          <Menu.Item className="dropdown-item" onClick={onCopy}><Copy size={16}/>创建副本</Menu.Item>
          <Menu.Item className="dropdown-item" disabled={root} onClick={onRoot}><Star size={16}/>设为主时间线</Menu.Item>
          <Menu.Separator className="dropdown-separator"/>
          <Menu.Item className="dropdown-item" disabled={root || referenced} onClick={onRemove}><Trash2 size={16}/>删除</Menu.Item>
        </Menu.Popup>
      </Menu.Positioner></Menu.Portal>
    </Menu.Root>
    {dialog === "rename" && <EditorDialog title="重命名" initialName={composition.name}
      onClose={() => setDialog(undefined)} onSubmit={onRename}/>}
    {dialog === "resize" && <EditorDialog title="调整画布尺寸" canvas={composition.canvas}
      onClose={() => setDialog(undefined)} onSubmit={onResize}/>}
  </>;
}
