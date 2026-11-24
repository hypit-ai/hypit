import { useIsPresent } from "motion/react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { ArrowDown, ArrowLeftToLine, ArrowUp, PanelLeftClose, PanelRightClose, Scissors, Trash2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type ClipMenuAction = {
  readonly label: string;
  readonly Icon: LucideIcon;
  readonly run: () => void;
  readonly disabled?: boolean;
  readonly hint?: string | undefined;
};

function ClipActionItems({ readActions }: {
  readonly readActions: () => readonly ClipMenuAction[];
}) {
  const actions = readActions();
  return <>
    {actions.length > 0 && <ContextMenu.Separator className="dropdown-separator"/>}
    {actions.map(({ label, Icon, run, disabled, hint }) => <ContextMenu.Item key={label} className="dropdown-item"
      disabled={disabled} title={hint} aria-description={hint} onClick={run}><Icon size={16}/>{label}</ContextMenu.Item>)}
  </>;
}

export function ClipMenu({ children, disabled, canSplit, canTrimStart, canTrimEnd, canRippleRemove, onSelect, onSplit, onTrimStart, onTrimEnd, onRemove, onRippleRemove, onRaise, onLower, readActions }: {
  readonly children: ReactNode;
  readonly disabled: boolean;
  readonly canSplit: boolean;
  readonly canTrimStart: boolean;
  readonly canTrimEnd: boolean;
  readonly onSelect: () => void;
  readonly onSplit: () => void;
  readonly onTrimStart: () => void;
  readonly onTrimEnd: () => void;
  readonly canRippleRemove: boolean;
  readonly onRippleRemove: () => void;
  readonly onRemove: () => void;
  readonly onRaise?: () => void;
  readonly onLower?: () => void;
  readonly readActions: () => readonly ClipMenuAction[];
}) {
  const present = useIsPresent();
  return <ContextMenu.Root disabled={disabled || !present}>
    <ContextMenu.Trigger style={{ display: "contents", pointerEvents: present ? undefined : "none" }} onContextMenu={event => { event.stopPropagation(); onSelect(); }}>{children}</ContextMenu.Trigger>
    <ContextMenu.Portal><ContextMenu.Positioner className="dropdown-positioner" sideOffset={4} collisionPadding={12}>
      <ContextMenu.Popup className="dropdown-content dropdown-menu" data-dropdown-content="" onPointerDown={event => event.stopPropagation()}>
        {onRaise && <ContextMenu.Item className="dropdown-item" onClick={onRaise}><ArrowUp size={16}/>上移一层</ContextMenu.Item>}
        {onLower && <ContextMenu.Item className="dropdown-item" onClick={onLower}><ArrowDown size={16}/>下移一层</ContextMenu.Item>}
        <ContextMenu.Item className="dropdown-item" disabled={!canSplit} onClick={onSplit}><Scissors size={16}/>在播放头分割</ContextMenu.Item>
        <ContextMenu.Item className="dropdown-item" disabled={!canTrimStart} onClick={onTrimStart}><PanelLeftClose size={16}/>删除播放头左侧</ContextMenu.Item>
        <ContextMenu.Item className="dropdown-item" disabled={!canTrimEnd} onClick={onTrimEnd}><PanelRightClose size={16}/>删除播放头右侧</ContextMenu.Item>
        <ClipActionItems readActions={readActions}/>
        <ContextMenu.Separator className="dropdown-separator"/>
        <ContextMenu.Item className="dropdown-item" disabled={!canRippleRemove} onClick={onRippleRemove}><ArrowLeftToLine size={16}/>波纹删除</ContextMenu.Item>
        <ContextMenu.Item className="dropdown-item" onClick={onRemove}><Trash2 size={16}/>删除所选片段</ContextMenu.Item>
      </ContextMenu.Popup>
    </ContextMenu.Positioner></ContextMenu.Portal>
  </ContextMenu.Root>;
}
