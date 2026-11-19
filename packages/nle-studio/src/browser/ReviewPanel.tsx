import type { NleTimelineScene } from "@hypit/nle/view";
import { ArrowUp, CircleCheck, Clock3, MessageSquareText, Pencil, RotateCcw, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "./common.js";
import { enterMotion } from "./motion.js";
import { demoReviewComments } from "./reviewDemo.js";
import { reviewTime, useReviewComments, type ReviewComment } from "./reviewComments.js";

type Filter = "all" | "open" | "done";
const filters: readonly { readonly id: Filter; readonly label: string }[] = [
  { id: "all", label: "全部" }, { id: "open", label: "待处理" }, { id: "done", label: "已完成" },
];

const byTime = (a: ReviewComment, b: ReviewComment) => a.frame - b.frame || a.number - b.number;

/** Review mode's comment column. A frontend prototype: comments stay in this browser (see reviewComments.ts). */
export function ReviewPanel({ storageKey, scene, frame, onJump }: {
  readonly storageKey: string;
  readonly scene: NleTimelineScene;
  readonly frame: number;
  readonly onJump: (frame: number) => void;
}) {
  const reduced = useReducedMotion();
  const fps = scene.editRate.numerator / scene.editRate.denominator;
  const { comments, add, update, remove, replace } = useReviewComments(storageKey, scene.composition);
  const [filter, setFilter] = useState<Filter>("all"), [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ readonly id: string; readonly text: string }>();
  const list = useRef<HTMLOListElement>(null);
  const sorted = [...comments].sort(byTime);
  const shown = sorted.filter(comment => filter === "all" || (filter === "done") === comment.resolved);
  const active = sorted.find(comment => comment.frame === frame)?.id;
  useEffect(() => {
    if (active) list.current?.querySelector(`[data-comment="${CSS.escape(active)}"]`)?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [active, reduced]);
  const submit = () => { const text = draft.trim(); if (text) { add(frame, text); setDraft(""); } };
  const save = () => { if (editing && editing.text.trim()) update(editing.id, { text: editing.text.trim() }); setEditing(undefined); };
  const emptyText = filter === "open" ? "没有待处理的评论" : filter === "done" ? "还没有已完成的评论" : "还没有评论";
  return <div className="nle-review">
    <header className="nle-review-header"><MessageSquareText size={16} strokeWidth={1.6}/><span>评论</span><b>{comments.length}</b>
      {comments.length > 0 && <IconButton label="重置为示例评论" onClick={() => replace(demoReviewComments(scene))}><RotateCcw size={15}/></IconButton>}</header>
    <div className="nle-review-filters" role="tablist">{filters.map(value => <button key={value.id} type="button" role="tab" aria-selected={filter === value.id} onClick={() => setFilter(value.id)}>{value.label}</button>)}</div>
    {shown.length === 0 ? <div className="nle-review-empty"><MessageSquareText size={26} strokeWidth={1.4}/><strong>{emptyText}</strong>
      {filter === "all" && <><span>播放到想调整的地方，在下方写下意见</span><button type="button" className="nle-review-demo" onClick={() => replace(demoReviewComments(scene))}>填入示例评论</button></>}</div>
      : <ol ref={list} className="nle-review-list"><AnimatePresence initial={false}>{shown.map(comment => <motion.li key={comment.id} data-comment={comment.id} {...enterMotion(reduced)}
        className={`${comment.resolved ? "resolved" : ""}${active === comment.id ? " active" : ""}`}>
        <div className="nle-review-card-head">
          <button type="button" className="nle-review-time" onClick={() => onJump(comment.frame)}>{reviewTime(comment.frame, fps)}</button>
          <span className="nle-review-number">#{comment.number}</span>
          <IconButton className="nle-review-resolve" label={comment.resolved ? "标记为待处理" : "标记为已完成"} aria-pressed={comment.resolved} onClick={() => update(comment.id, { resolved: !comment.resolved })}><CircleCheck size={16} strokeWidth={1.7}/></IconButton>
          <IconButton label="编辑" onClick={() => setEditing({ id: comment.id, text: comment.text })}><Pencil size={15} strokeWidth={1.6}/></IconButton>
          <IconButton label="删除" onClick={() => remove(comment.id)}><Trash2 size={15} strokeWidth={1.6}/></IconButton>
        </div>
        {editing?.id === comment.id
          ? <textarea className="nle-review-edit" autoFocus value={editing.text} rows={3} onChange={event => setEditing({ id: comment.id, text: event.target.value })} onBlur={save}
            onKeyDown={event => { if (event.key === "Escape") setEditing(undefined); else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); save(); } }}/>
          : <p className="nle-review-text" onClick={() => onJump(comment.frame)}>{comment.text}</p>}
      </motion.li>)}</AnimatePresence></ol>}
    <div className="nle-review-compose">
      <span className="nle-review-anchor"><Clock3 size={14} strokeWidth={1.8}/>{reviewTime(frame, fps)}</span>
      <div className="nle-review-input">
        <textarea value={draft} placeholder="想调整哪里？" rows={3} onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}/>
        <button type="button" className="nle-review-send" aria-label="发送评论" disabled={!draft.trim()} onClick={submit}><ArrowUp size={16} strokeWidth={2}/></button>
      </div>
    </div>
  </div>;
}

/** Previous / next comment, replacing frame stepping in review mode's transport. */
export function ReviewStepButtons({ storageKey, composition, frame, onJump, children }: {
  readonly storageKey: string;
  readonly composition: string;
  readonly frame: number;
  readonly onJump: (frame: number) => void;
  /** The transport's play button, placed between the two steps. */
  readonly children: React.ReactNode;
}) {
  const { comments } = useReviewComments(storageKey, composition);
  const frames = [...new Set(comments.map(comment => comment.frame))].sort((a, b) => a - b);
  const previous = frames.filter(value => value < frame).at(-1), next = frames.find(value => value > frame);
  return <>
    <IconButton label="上一条评论" disabled={previous === undefined} onClick={() => previous !== undefined && onJump(previous)}><SkipBack size={15}/></IconButton>
    {children}
    <IconButton label="下一条评论" disabled={next === undefined} onClick={() => next !== undefined && onJump(next)}><SkipForward size={15}/></IconButton>
  </>;
}

/** A plain programme scrubber shown under the enlarged review preview. */
export function ReviewScrubber({ frame, end, onSeek }: { readonly frame: number; readonly end: number; readonly onSeek: (frame: number) => void }) {
  return <div className="nle-review-scrubber"><input type="range" aria-label="播放位置" min={0} max={Math.max(1, end)} step={1} value={frame} onChange={event => onSeek(Number(event.target.value))}/></div>;
}
