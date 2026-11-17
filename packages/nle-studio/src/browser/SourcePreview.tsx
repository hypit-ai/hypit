import { AudioLines, ArrowLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { NleStudioMediaEntry } from "../protocol.js";

export function SourcePreview({ entry, onClose }: {
  readonly entry: NleStudioMediaEntry | undefined;
  readonly onClose: () => void;
}) {
  return <AnimatePresence>{entry !== undefined && <motion.div className="studio-source-preview" key={entry.id}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}>
    <header><button type="button" className="button" onClick={onClose}><ArrowLeft size={14}/>返回剪辑</button><span>{entry.name}</span></header>
    <div className="studio-source-content">{entry.resource === undefined ? <p>{entry.diagnostic ?? "素材暂时不可用"}</p>
      : entry.mediaType?.startsWith("image/") ? <img src={entry.resource} alt={entry.name}/>
      : entry.mediaType?.startsWith("video/") ? <video src={entry.resource} controls playsInline preload="metadata"/>
      : <div className="studio-source-audio"><AudioLines size={48}/><audio src={entry.resource} controls preload="metadata"/></div>}</div>
  </motion.div>}</AnimatePresence>;
}
