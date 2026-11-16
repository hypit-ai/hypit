import { Menu } from "@base-ui/react/menu";
import { ArrowLeftToLine, ArrowRightToLine, ChevronDown, MousePointer2, Slice } from "lucide-react";

const tools = [
  { id: "select", label: "选择", shortcut: "A", icon: MousePointer2 },
  { id: "cut", label: "分割", shortcut: "B", icon: Slice },
  { id: "left", label: "向左选择", shortcut: "[", icon: ArrowLeftToLine },
  { id: "right", label: "向右选择", shortcut: "]", icon: ArrowRightToLine },
] as const;
export type TimelineTool = typeof tools[number]["id"];

export function ToolSelector({ value, onChange }: { readonly value: TimelineTool; readonly onChange: (value: TimelineTool) => void }) {
  const selected = tools.find(tool => tool.id === value)!; const Icon = selected.icon;
  return <Menu.Root modal={false}><Menu.Trigger className="nle-tool-trigger" aria-label={`${selected.label} (${selected.shortcut})`} title={`${selected.label} (${selected.shortcut})`}><Icon size={16}/><ChevronDown size={12}/></Menu.Trigger>
    <Menu.Portal><Menu.Positioner className="dropdown-positioner" side="bottom" sideOffset={6} align="start" collisionPadding={12}><Menu.Popup className="dropdown-content dropdown-menu nle-tool-menu" data-dropdown-content="">
      {tools.map(tool => <Menu.Item key={tool.id} className="dropdown-item" onClick={() => onChange(tool.id)} aria-current={value === tool.id ? "true" : undefined}><tool.icon size={16}/><span>{tool.label}</span><kbd>{tool.shortcut}</kbd></Menu.Item>)}
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
