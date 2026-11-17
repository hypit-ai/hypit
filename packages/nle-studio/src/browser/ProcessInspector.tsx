import { AnimatePresence } from "motion/react";
import type { NleCommand, NleItem, NleProcess } from "@hypit/nle";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { IconButton } from "./common.js";
import { Row, Section, Toggle } from "./controls.js";

export function ProcessInspector({ item, disabled, onEdit }: { readonly item: NleItem; readonly disabled: boolean; readonly onEdit: (commands: readonly NleCommand[]) => void }) {
  if (item.kind !== "present") return <Section title="效果"><Row label="状态"><Toggle label="启用效果" checked={item.enabled} disabled={disabled} onChange={enabled => onEdit([{ kind: "item.update", id: item.id, enabled }])}/></Row></Section>;
  const chain = (medium: "picture" | "audio", processes: readonly NleProcess[]) => processes.map((process, index) => <Section key={process.id} title={`${medium === "picture" ? "画面效果" : "音频效果"} ${index + 1}`}>
    <Row label="名称"><output>{process.operator.symbol}</output></Row>
    <Row label="启用"><Toggle label={`启用效果 ${process.id}`} disabled={disabled} checked={process.enabled} onChange={enabled => onEdit([{ kind: "process.replace", item: item.id, medium, process: { ...process, enabled } }])}/></Row>
    <Row label="顺序"><IconButton label="效果上移" disabled={disabled || index === 0} onClick={() => onEdit([{ kind: "process.move", item: item.id, medium, id: process.id, before: processes[index - 1]!.id }])}><ArrowUp size={14}/></IconButton><IconButton label="效果下移" disabled={disabled || index === processes.length - 1} onClick={() => onEdit([{ kind: "process.move", item: item.id, medium, id: process.id, ...(processes[index + 2] ? { before: processes[index + 2]!.id } : {}) }])}><ArrowDown size={14}/></IconButton><IconButton label="删除效果" disabled={disabled} onClick={() => onEdit([{ kind: "process.remove", item: item.id, medium, id: process.id }])}><Trash2 size={14}/></IconButton></Row>
  </Section>);
  return <AnimatePresence initial={false}>{chain("picture", item.picture?.processes ?? [])}{chain("audio", item.audio?.processes ?? [])}</AnimatePresence>;
}
