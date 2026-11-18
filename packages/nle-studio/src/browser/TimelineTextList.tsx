import type { NleTimelineScene, NleTimelineSceneItem } from "@hypit/nle/view";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { enterMotion } from "./motion.js";
import { timecode } from "./timecode.js";

export function TimelineTextList({ scene, selection, onSelect }: {
  readonly scene: NleTimelineScene;
  readonly selection: readonly string[];
  readonly onSelect: (item: NleTimelineSceneItem) => void;
}) {
  const reduced = useReducedMotion();
  const fps = scene.editRate.numerator / scene.editRate.denominator;
  const entries = scene.tracks.flatMap(track => track.items.flatMap(item => {
    const text = item.display.layers.flatMap(layer => layer.kind === "text" ? [layer.text] : []);
    return item.source === "component" && text.length ? [{ item, text }] : [];
  })).sort((a, b) => a.item.startFrame - b.item.startFrame);
  if (!entries.length) return <p className="nle-empty">当前时间线暂无文本条目</p>;
  return <ol className="nle-caption-list studio-text-list"><AnimatePresence initial={false}>
    {entries.map(({ item, text }) => <motion.li key={item.id} {...enterMotion(reduced)} className={selection.includes(item.id) ? "selected" : undefined}>
      <button type="button" className="studio-text-entry" aria-current={selection.includes(item.id) || undefined} onClick={() => onSelect(item)}>
        <time>{timecode(item.startFrame, fps)}</time>
        <span>{item.display.title}</span>
        {text.some(line => line !== item.display.title) && <span className="studio-text-entry-content">{text.filter(line => line !== item.display.title).join("\n")}</span>}
      </button>
    </motion.li>)}
  </AnimatePresence></ol>;
}
