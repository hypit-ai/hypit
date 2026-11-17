import { AudioLines, Blend, Captions, Film, Images, Plus, Search, Type, Wand2 } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import type {
  NleStudioAdjustCatalogEntry,
  NleStudioCatalogProjection,
  NleStudioComponentCatalogEntry,
  NleStudioMediaEntry,
  NleStudioMediaProjection,
  NleStudioTransitionCatalogEntry,
} from "../protocol.js";
import { IconButton } from "./common.js";
import { MediaThumbnail } from "./MediaThumbnail.js";


export type BinTab = "assets" | "text" | "subtitles" | "transitions" | "effects";

const labels: Record<BinTab, string> = { assets: "素材", text: "新建", subtitles: "字幕", transitions: "转场", effects: "效果" };

function Empty({ children }: { readonly children: React.ReactNode }) {
  return <p className="nle-preset-empty">{children}</p>;
}

function Browser({ heading, entries, empty, onSelect }: {
  readonly heading: string;
  readonly entries: readonly { readonly id: string; readonly name: string; readonly detail?: string; readonly kind: "text" | "transition" | "effect" | "subtitle" }[];
  readonly empty: string;
  readonly onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = entries.filter(entry => entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="nle-bin-split"><nav className="nle-bin-side"><button type="button" aria-pressed="true">{heading}</button></nav><div className="nle-bin-main"><div className="nle-bin-toolbar"><label className="nle-preset-search"><Search size={14}/><input value={query} placeholder="搜索" onChange={event => setQuery(event.target.value)}/></label></div><div className="nle-bin-label">{heading}</div>{filtered.length === 0 ? <Empty>{empty}</Empty> : <div className="nle-preset-grid">{filtered.map(entry => <article className="nle-preset" key={entry.id}><button type="button" className={`nle-preset-preview studio-preset ${entry.kind}`} onClick={() => onSelect(entry.id)}><span>{entry.kind === "text" ? <Type size={22}/> : entry.kind === "transition" ? <Blend size={22}/> : entry.kind === "subtitle" ? <Captions size={22}/> : <Wand2 size={22}/>}</span>{entry.detail && <small>{entry.detail}</small>}</button><IconButton className="nle-preset-add" label="添加到时间线" onClick={() => onSelect(entry.id)}><Plus size={14}/></IconButton><span className="nle-preset-name">{entry.name}</span></article>)}</div>}</div></div>;
}

function Assets({ media, disabled, onImport, onPlace, onPreview, onBeginDrag, selected }: {
  readonly media: NleStudioMediaProjection;
  readonly disabled: boolean;
  readonly onImport: (files: readonly File[]) => void;
  readonly onPlace: (entry: NleStudioMediaEntry) => void;
  readonly onPreview: (entry: NleStudioMediaEntry) => void;
  readonly onBeginDrag: (event: PointerEvent, entry: NleStudioMediaEntry) => void;
  readonly selected: string | undefined;
}) {
  const [query, setQuery] = useState(""), [kind, setKind] = useState<"all" | "picture" | "audio">("all");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const entries = media.entries.filter(entry => (kind === "all" || entry.kind === kind || entry.kind === "audiovisual") && entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const accept = (files: FileList | null) => {
    const selected = files === null ? [] : Array.from(files);
    if (selected.length > 0) onImport(selected);
  };
  return <div className={`project-library library-editor${dragging ? " import-dragging" : ""}`} onDragEnter={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDragLeave={event => { const target = event.relatedTarget; if (!(target instanceof Node) || !event.currentTarget.contains(target)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled) accept(event.dataTransfer.files); }}><nav className="library-filters"><button type="button" aria-selected={kind === "all"} onClick={() => setKind("all")}>全部</button><button type="button" aria-selected={kind === "picture"} onClick={() => setKind("picture")}>画面</button><button type="button" aria-selected={kind === "audio"} onClick={() => setKind("audio")}>音频</button></nav><div className="library-actions"><input ref={input} type="file" accept="image/*,audio/*,video/*" multiple hidden onChange={event => { accept(event.currentTarget.files); event.currentTarget.value = ""; }}/><button className="button" type="button" disabled={disabled} onClick={() => input.current?.click()}>导入</button></div><label className="library-search"><Search size={14}/><input value={query} placeholder="搜索素材" onChange={event => setQuery(event.target.value)}/></label><div className="library-heading">项目素材</div>{entries.length === 0 ? <div className="library-empty nle-empty"><Images size={26}/><span>{dragging ? "释放以导入素材" : "将文件拖到这里，或点击导入"}</span></div> : <div className="library-grid">{entries.map(entry => <article className={`library-card${selected === entry.id ? " selected" : ""}`} key={entry.id} title={entry.diagnostic}>
    <button type="button" className="library-card-main" disabled={disabled || entry.state !== "available"}
      onPointerDown={event => onBeginDrag(event, entry)} onClick={event => { if (event.detail === 0) onPreview(entry); }} onDoubleClick={() => onPlace(entry)}>
      <MediaThumbnail entry={entry}/><span className="library-card-name">{entry.name}</span>
      <small className="library-card-meta">{entry.state === "available" ? entry.kind === "audio" ? "音频" : entry.mediaType?.startsWith("image/") ? "图片" : "视频" : entry.state === "missing" ? "文件缺失" : "无法读取"}</small>
    </button>{entry.state === "available" && <span className="library-card-actions"><IconButton label="添加到时间线" disabled={disabled} onClick={() => onPlace(entry)}><Plus size={14}/></IconButton></span>}
  </article>)}</div>}</div>;
}

export function StudioBin({
  tab, catalog, media, disabled, onImportMedia, onPlaceMedia, onMaterialize, onMaterializeAdjust, onMaterializeTransition, onPreviewMedia, onBeginMediaDrag, selectedMedia,
}: {
  readonly tab: BinTab;
  readonly catalog: NleStudioCatalogProjection;
  readonly media: NleStudioMediaProjection;
  readonly disabled: boolean;
  readonly onImportMedia: (files: readonly File[]) => void;
  readonly onPlaceMedia: (entry: NleStudioMediaEntry) => void;
  readonly onPreviewMedia: (entry: NleStudioMediaEntry) => void;
  readonly onBeginMediaDrag: (event: PointerEvent, entry: NleStudioMediaEntry) => void;
  readonly selectedMedia: string | undefined;
  readonly onMaterialize: (entry: NleStudioComponentCatalogEntry) => void;
  readonly onMaterializeAdjust: (entry: NleStudioAdjustCatalogEntry) => void;
  readonly onMaterializeTransition: (entry: NleStudioTransitionCatalogEntry) => void;
}) {
  const values = useMemo(() => {
    if (tab === "text" || tab === "subtitles") return catalog.components
      .filter(entry => tab === "text" ? entry.category === "text" || entry.category === "graphic" : entry.category === "subtitle")
      .map(entry => ({ id: `${entry.package}\u0000${entry.offering}`, name: entry.title, detail: entry.package,
        kind: tab === "text" ? "text" as const : "subtitle" as const }));
    if (tab === "effects") return catalog.adjusts.map(entry => ({
      id: `${entry.package}\u0000${entry.offering}`,
      name: entry.title,
      detail: entry.medium === "picture" ? "画面效果" : "音频效果",
      kind: "effect" as const,
    }));
    if (tab === "transitions") return catalog.transitions.map(entry => ({
      id: `${entry.package}\u0000${entry.offering}`,
      name: entry.title,
      detail: entry.package,
      kind: "transition" as const,
    }));
    return [];
  }, [catalog, tab]);
  if (tab === "assets") return <Assets media={media} disabled={disabled} onImport={onImportMedia} onPlace={onPlaceMedia} onPreview={onPreviewMedia} onBeginDrag={onBeginMediaDrag} selected={selectedMedia}/>;
  return <Browser heading={labels[tab]} entries={values} empty={tab === "text" ? "项目没有选择文本或图形组件" : tab === "subtitles" ? "项目没有选择字幕组件" : tab === "transitions" ? "项目没有选择转场" : "项目没有选择效果"} onSelect={id => {
    const [packageName, offering] = id.split("\u0000");
    if (tab === "effects") {
      const entry = catalog.adjusts.find(candidate => candidate.package === packageName && candidate.offering === offering);
      if (entry !== undefined) onMaterializeAdjust(entry);
      return;
    }
    if (tab === "transitions") {
      const entry = catalog.transitions.find(candidate => candidate.package === packageName && candidate.offering === offering);
      if (entry !== undefined) onMaterializeTransition(entry);
      return;
    }
    const entry = catalog.components.find(candidate => candidate.package === packageName && candidate.offering === offering);
    if (entry !== undefined) onMaterialize(entry);
  }}/>;
}
