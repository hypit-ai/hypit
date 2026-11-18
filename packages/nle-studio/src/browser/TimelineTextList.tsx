import type { NleInspectorScene, NleTimelineScene, NleTimelineSceneItem } from "@hypit/nle/view";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { enterMotion, expandMotion } from "./motion.js";
import { timecode } from "./timecode.js";
import { InspectorSections } from "./Inspector.js";

export function TimelineTextList({ scene, selection, textItems, inspector, disabled, onSelect, onEdit, onInvoke }: {
  readonly scene: NleTimelineScene;
  readonly selection: readonly string[];
  readonly textItems: ReadonlySet<string>;
  readonly inspector: NleInspectorScene | undefined;
  readonly disabled: boolean;
  readonly onSelect: (item: NleTimelineSceneItem) => void;
  readonly onInvoke: (item: string, section: string, collection: string, row: string, action: string) => void;
  readonly onEdit: (item: string, section: string, field: string, value: string | number | boolean) => void;
}) {
  const reduced = useReducedMotion();
  const fps = scene.editRate.numerator / scene.editRate.denominator;
  const active = inspector && inspector.item === selection[0] ? { ...inspector,
    sections: inspector.sections.filter(section => section.owner.kind === "package"
      || section.owner.kind === "shared-value" && section.owner.declaration.kind === "component"),
  } : undefined;
  const entries = scene.tracks.flatMap(track => track.items.flatMap(item => {
    const text = item.display.layers.flatMap(layer => layer.kind === "text" ? [layer.text] : []);
    return item.source === "component" && (text.length || textItems.has(item.id)) ? [{ item, text }] : [];
  })).sort((a, b) => a.item.startFrame - b.item.startFrame);
  if (!entries.length) return <p className="nle-empty">当前时间线暂无文本条目</p>;
  return <ol className="nle-caption-list studio-text-list"><AnimatePresence initial={false}>
    {entries.map(({ item, text }) => <motion.li key={item.id} {...enterMotion(reduced)} className={selection.includes(item.id) ? "selected" : undefined}>
      <button type="button" className="studio-text-entry" aria-current={selection.includes(item.id) || undefined} onClick={() => onSelect(item)}>
        <time>{timecode(item.startFrame, fps)}</time>
        <span>{item.display.title}</span>
        {text.some(line => line !== item.display.title) && <span className="studio-text-entry-content">{text.filter(line => line !== item.display.title).join("\n")}</span>}
      </button>
      <AnimatePresence initial={false}>{active?.item === item.id && active.sections.length > 0 &&
        <motion.div key={item.id} className="studio-text-entry-fields" {...expandMotion(reduced)}>
          <InspectorSections scene={active} disabled={disabled} onInvoke={onInvoke} onEdit={(section, field, value) => onEdit(item.id, section, field, value)}/>
        </motion.div>}</AnimatePresence>
    </motion.li>)}
  </AnimatePresence></ol>;
}
