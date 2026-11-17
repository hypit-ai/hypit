import { Menu } from "@base-ui/react/menu";
import { ChevronDown, Copy, Layers, LogIn, Ungroup } from "lucide-react";

export function CompoundMenu({ disabled, selected, nested, onCreate, onOpen, onDuplicate, onUnpack }: {
  readonly disabled: boolean;
  readonly selected: boolean;
  readonly nested: boolean;
  readonly onCreate: () => void;
  readonly onOpen: () => void;
  readonly onDuplicate: () => void;
  readonly onUnpack: () => void;
}) {
  return <Menu.Root modal={false}><Menu.Trigger className="nle-tool-trigger" disabled={disabled || !selected} aria-label="复合片段" title="复合片段"><Layers size={16}/><ChevronDown size={12}/></Menu.Trigger><Menu.Portal><Menu.Positioner className="dropdown-positioner" side="bottom" sideOffset={6} align="start" collisionPadding={12}><Menu.Popup className="dropdown-content dropdown-menu">
    <Menu.Item className="dropdown-item" onClick={onCreate}><Layers size={16}/>创建复合片段</Menu.Item>
    <Menu.Item className="dropdown-item" disabled={!nested} onClick={onOpen}><LogIn size={16}/>打开内部时间线</Menu.Item>
    <Menu.Item className="dropdown-item" disabled={!nested} onClick={onDuplicate}><Copy size={16}/>独立复制复合片段</Menu.Item>
    <Menu.Item className="dropdown-item" disabled={!nested} onClick={onUnpack}><Ungroup size={16}/>拆解复合片段</Menu.Item>
  </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>;
}
