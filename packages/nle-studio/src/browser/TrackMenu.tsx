import { useIsPresent } from "motion/react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { FoldHorizontal, Pencil, Rows3, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { EditorDialog } from "./EditorDialog.js";

export function TrackMenu({ children, name, disabled, pixels, gaps, onCloseGap, onRename, onRemove, onHeight }: {
  readonly children: ReactNode;
  readonly name: string;
  readonly disabled: boolean;
  readonly pixels: number;
  readonly gaps: readonly { readonly start: number; readonly end: number }[];
  readonly onCloseGap: (frame: number) => void;
  readonly onRename: (name: string) => void;
  readonly onRemove?: () => void;
  readonly onHeight: ((height: number | null) => void) | undefined;
}) {
  const present = useIsPresent();
  const [at, setAt] = useState(0), [rename, setRename] = useState(false);
  return <><ContextMenu.Root disabled={disabled || !present}><ContextMenu.Trigger style={{ display: "contents", pointerEvents: present ? undefined : "none" }} onContextMenu={event => {
    if ((event.target as Element).closest(".nle-clip")) return;
    const content = (event.target as Element).closest<HTMLElement>(".nle-track-content");
    setAt(content ? Math.max(0, Math.floor((event.clientX - content.getBoundingClientRect().left) / pixels)) : 0);
  }}>{children}</ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Positioner className="dropdown-positioner" sideOffset={4} collisionPadding={12}><ContextMenu.Popup className="dropdown-content dropdown-menu" onPointerDown={event => event.stopPropagation()}>
    <ContextMenu.Item className="dropdown-item" disabled={!gaps.some(gap => at >= gap.start && at < gap.end)} onClick={() => onCloseGap(at)}><FoldHorizontal size={16}/>关闭此处间隙</ContextMenu.Item>
    <ContextMenu.Item className="dropdown-item" onClick={() => setRename(true)}><Pencil size={16}/>重命名轨道</ContextMenu.Item>
    {onHeight && <>
      <ContextMenu.Item className="dropdown-item" onClick={() => onHeight(36)}><Rows3 size={16}/>紧凑轨道</ContextMenu.Item>
      <ContextMenu.Item className="dropdown-item" onClick={() => onHeight(86)}><Rows3 size={16}/>展开轨道</ContextMenu.Item>
      <ContextMenu.Item className="dropdown-item" onClick={() => onHeight(null)}><Rows3 size={16}/>默认轨道高度</ContextMenu.Item>
    </>}
    {onRemove && <ContextMenu.Item className="dropdown-item" onClick={onRemove}><Trash2 size={16}/>删除空轨道</ContextMenu.Item>}
  </ContextMenu.Popup></ContextMenu.Positioner></ContextMenu.Portal></ContextMenu.Root>{rename && <EditorDialog title="重命名轨道" initialName={name} onClose={() => setRename(false)} onSubmit={onRename}/>}</>;
}
