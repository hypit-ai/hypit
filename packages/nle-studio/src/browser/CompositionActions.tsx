import { Menu } from "@base-ui/react/menu";
import { Ellipsis, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import type { NleComposition } from "@hypit/nle";
import { EditorDialog } from "./EditorDialog.js";

export function CompositionActions({ composition, disabled, root, referenced, onCreate, onEdit, onRoot, onRemove }: {
  readonly composition: NleComposition;
  readonly disabled: boolean;
  readonly root: boolean;
  readonly referenced: boolean;
  readonly onCreate: (name: string, canvas: { width: number; height: number }) => void;
  readonly onEdit: (name: string, canvas: { width: number; height: number }) => void;
  readonly onRoot: () => void;
  readonly onRemove: () => void;
}) {
  const [dialog, setDialog] = useState<"create" | "edit">();
  return <><Menu.Root modal={false}><Menu.Trigger className="icon-button" disabled={disabled} aria-label="时间线管理" title="时间线管理"><Ellipsis size={16}/></Menu.Trigger><Menu.Portal><Menu.Positioner className="dropdown-positioner" side="bottom" sideOffset={6} align="start"><Menu.Popup className="dropdown-content dropdown-menu">
    <Menu.Item className="dropdown-item" onClick={() => setDialog("create")}><Plus size={16}/>新建时间线</Menu.Item>
    <Menu.Item className="dropdown-item" onClick={() => setDialog("edit")}><Pencil size={16}/>时间线设置</Menu.Item>
    <Menu.Item className="dropdown-item" disabled={root} onClick={onRoot}><Star size={16}/>设为主时间线</Menu.Item>
    <Menu.Item className="dropdown-item" disabled={root || referenced} onClick={onRemove}><Trash2 size={16}/>删除时间线</Menu.Item>
  </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>{dialog && <EditorDialog title={dialog === "create" ? "新建时间线" : "时间线设置"} initialName={dialog === "create" ? "新时间线" : composition.name} canvas={composition.canvas} onClose={() => setDialog(undefined)} onSubmit={(name, canvas) => { if (canvas) (dialog === "create" ? onCreate : onEdit)(name, canvas); }}/>}</>;
}
