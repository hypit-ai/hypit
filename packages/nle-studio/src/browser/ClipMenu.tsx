import { useIsPresent } from "motion/react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Layers, PanelLeftClose, PanelRightClose, Scissors, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

export function ClipMenu({ children, disabled, canSplit, canTrimStart, canTrimEnd, onSelect, onSplit, onTrimStart, onTrimEnd, onRemove, onOpen, onDuplicate, onUnpack, onRippleRemove }: {
  readonly children: ReactNode;
  readonly disabled: boolean;
  readonly canSplit: boolean;
  readonly canTrimStart: boolean;
  readonly canTrimEnd: boolean;
  readonly onSelect: () => void;
  readonly onSplit: () => void;
  readonly onTrimStart: () => void;
  readonly onTrimEnd: () => void;
  readonly onRippleRemove: () => void;
  readonly onRemove: () => void;
  readonly onDuplicate?: () => void;
  readonly onUnpack?: () => void;
  readonly onOpen?: () => void;
}) {
  const present = useIsPresent();
  return <ContextMenu.Root disabled={disabled || !present}>
    <ContextMenu.Trigger style={{ display: "contents", pointerEvents: present ? undefined : "none" }} onContextMenu={event => { event.stopPropagation(); onSelect(); }}>{children}</ContextMenu.Trigger>
    <ContextMenu.Portal><ContextMenu.Positioner className="dropdown-positioner" sideOffset={4} collisionPadding={12}>
      <ContextMenu.Popup className="dropdown-content dropdown-menu" data-dropdown-content="" onPointerDown={event => event.stopPropagation()}>
        <ContextMenu.Item className="dropdown-item" disabled={!canSplit} onClick={onSplit}><Scissors size={16}/>在播放头分割</ContextMenu.Item>
        <ContextMenu.Item className="dropdown-item" disabled={!canTrimStart} onClick={onTrimStart}><PanelLeftClose size={16}/>删除播放头左侧</ContextMenu.Item>
        <ContextMenu.Item className="dropdown-item" disabled={!canTrimEnd} onClick={onTrimEnd}><PanelRightClose size={16}/>删除播放头右侧</ContextMenu.Item>
        {onOpen && <ContextMenu.Item className="dropdown-item" onClick={onOpen}><Layers size={16}/>打开内部时间线</ContextMenu.Item>}
        {onDuplicate && <ContextMenu.Item className="dropdown-item" onClick={onDuplicate}><Layers size={16}/>独立复制复合片段</ContextMenu.Item>}
        {onUnpack && <ContextMenu.Item className="dropdown-item" onClick={onUnpack}><Layers size={16}/>拆解复合片段</ContextMenu.Item>}
        <ContextMenu.Item className="dropdown-item" onClick={onRippleRemove}><Trash2 size={16}/>波纹删除</ContextMenu.Item>
        <ContextMenu.Item className="dropdown-item" onClick={onRemove}><Trash2 size={16}/>删除所选片段</ContextMenu.Item>
      </ContextMenu.Popup>
    </ContextMenu.Positioner></ContextMenu.Portal>
  </ContextMenu.Root>;
}
