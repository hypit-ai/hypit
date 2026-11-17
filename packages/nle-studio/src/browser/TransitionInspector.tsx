import { Trash2 } from "lucide-react";
import { NumberField, Row, Section } from "./controls.js";
import { IconButton } from "./common.js";
export function TransitionInspector({ duration, disabled, onDuration, onRemove }: { readonly duration: number; readonly disabled: boolean; readonly onDuration: (frames: number) => void; readonly onRemove: () => void }) {
  return <Section title="转场"><Row label="重叠帧数"><NumberField label="转场重叠帧数" value={duration} min={1} precision={0} disabled={disabled} onCommit={onDuration}/></Row><Row label="删除"><IconButton label="删除转场" disabled={disabled} onClick={onRemove}><Trash2 size={14}/></IconButton></Row></Section>;
}
