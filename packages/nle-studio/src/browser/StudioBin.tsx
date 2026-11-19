import { ContextMenu } from "@base-ui/react/context-menu";
import { AudioLines, Blend, Captions, ChevronRight, Eye, Film, Image as ImageIcon, Images, Plus, Search, Sparkles, Trash2, Type, Wand2 } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import type {
  NleStudioAdjustCatalogEntry,
  NleStudioCatalogProjection,
  NleStudioComponentCatalogEntry,
  NleStudioMediaEntry,
  NleStudioMediaProjection,
  NleStudioTransitionCatalogEntry,
} from "../protocol.js";
import type { CatalogDrag } from "./catalogDrag.js";
import { IconButton } from "./common.js";
import { MediaThumbnail } from "./MediaThumbnail.js";


export type BinTab = "assets" | "text" | "subtitles" | "transitions" | "effects";

const labels: Record<BinTab, string> = { assets: "素材", text: "新建", subtitles: "字幕", transitions: "转场", effects: "效果" };

function Empty({ children }: { readonly children: React.ReactNode }) {
  return <p className="nle-preset-empty">{children}</p>;
}

function Browser({ heading, entries, empty, onSelect, disabled, onBeginDrag }: {
  readonly disabled: boolean;
  readonly onBeginDrag: (event: PointerEvent, id: string) => void;
  readonly heading: string;
  readonly entries: readonly { readonly id: string; readonly name: string; readonly detail?: string; readonly kind: "text" | "transition" | "effect" | "subtitle" }[];
  readonly empty: string;
  readonly onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = entries.filter(entry => entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="nle-bin-split"><nav className="nle-bin-side"><button type="button" aria-pressed="true">{heading}</button></nav><div className="nle-bin-main"><div className="nle-bin-toolbar"><label className="nle-preset-search"><Search size={14}/><input value={query} placeholder="搜索" onChange={event => setQuery(event.target.value)}/></label></div>{filtered.length === 0 ? <Empty>{empty}</Empty> : <div className="nle-preset-grid">{filtered.map(entry => <article className="nle-preset" key={entry.id}><button type="button" className={`nle-preset-preview studio-preset ${entry.kind}`} disabled={disabled} onPointerDown={event => onBeginDrag(event, entry.id)} onClick={event => { if (event.detail === 0) onSelect(entry.id); }}><span>{entry.kind === "text" ? <Type size={22}/> : entry.kind === "transition" ? <Blend size={22}/> : entry.kind === "subtitle" ? <Captions size={22}/> : <Wand2 size={22}/>}</span><small>{entry.name}</small></button><IconButton className="nle-preset-add" label="添加到时间线" disabled={disabled} onClick={() => onSelect(entry.id)}><Plus size={14}/></IconButton><span className="nle-preset-name">{entry.name}</span></article>)}</div>}</div></div>;
}

type MediaSource = "imported" | "generated";
type MediaFormat = "video" | "image" | "audio";
type MediaFilter = { readonly source?: MediaSource; readonly format?: MediaFormat };

const mediaSources: readonly { readonly id: MediaSource; readonly label: string }[] = [
  { id: "imported", label: "素材" },
  { id: "generated", label: "AI生成" },
];
const mediaFormats: readonly { readonly id: MediaFormat; readonly label: string }[] = [
  { id: "video", label: "视频" },
  { id: "image", label: "图片" },
  { id: "audio", label: "音频" },
];

const formatHints: Record<MediaFormat, string> = {
  video: "支持 MP4、MOV 等视频格式",
  image: "支持 JPG、PNG、SVG 等图片格式",
  audio: "支持 MP3、WAV 等音频格式",
};

function mediaFormat(entry: NleStudioMediaEntry): MediaFormat | undefined {
  if (entry.kind === "audio") return "audio";
  if (entry.mediaType?.startsWith("image/")) return "image";
  return entry.kind === "picture" || entry.kind === "audiovisual" ? "video" : undefined;
}

/** Project Media entries carry no generation provenance yet, so every entry is an imported source. */
const mediaSource = (_entry: NleStudioMediaEntry): MediaSource => "imported";

function Assets({ media, disabled, onImport, onPlace, onPreview, onBeginDrag, selected }: {
  readonly media: NleStudioMediaProjection;
  readonly disabled: boolean;
  readonly onImport: (files: readonly File[]) => void;
  readonly onPlace: (entry: NleStudioMediaEntry) => void;
  readonly onPreview: (entry: NleStudioMediaEntry) => void;
  readonly onBeginDrag: (event: PointerEvent, entry: NleStudioMediaEntry) => void;
  readonly selected: string | undefined;
}) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState<MediaFilter>({});
  const [expanded, setExpanded] = useState<ReadonlySet<MediaSource>>(() => new Set());
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const entries = media.entries.filter(entry => (filter.source === undefined || mediaSource(entry) === filter.source)
    && (filter.format === undefined || mediaFormat(entry) === filter.format)
    && entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const expand = (source: MediaSource, open: boolean) => setExpanded(previous => {
    const next = new Set(previous);
    if (open) next.add(source); else next.delete(source);
    return next;
  });
  const formatLabel = mediaFormats.find(value => value.id === filter.format)?.label ?? "";
  const searching = query.trim() !== "";
  const emptyText = dragging ? "释放以导入素材" : searching ? "没有找到相关素材"
    : filter.source === "generated" ? `还没有 AI 生成的${formatLabel}素材` : `还没有${formatLabel}素材`;
  const emptyHint = dragging ? undefined : searching ? "换个关键词试试"
    : filter.source === "generated" ? `AI 生成的${formatLabel || "视频、图片和音频"}会出现在这里`
    : filter.format === undefined ? "支持视频、图片和音频" : formatHints[filter.format];
  const EmptyIcon = searching ? Search : filter.source === "generated" ? Sparkles
    : filter.format === "video" ? Film : filter.format === "image" ? ImageIcon : filter.format === "audio" ? AudioLines : Images;
  const accept = (files: FileList | null) => {
    const selected = files === null ? [] : Array.from(files);
    if (selected.length > 0) onImport(selected);
  };
  return <div className={`project-library library-editor${dragging ? " import-dragging" : ""}`} onDragEnter={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDragLeave={event => { const target = event.relatedTarget; if (!(target instanceof Node) || !event.currentTarget.contains(target)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled) accept(event.dataTransfer.files); }}><nav className="library-filters"><button type="button" aria-selected={filter.source === undefined} onClick={() => setFilter({})}>全部</button>{mediaSources.map(source => {
      const open = expanded.has(source.id);
      return <div key={source.id} className="library-filter-group">
        <div className="library-filter-row"><button type="button" aria-selected={filter.source === source.id && filter.format === undefined} onClick={() => { setFilter({ source: source.id }); expand(source.id, true); }}>{source.label}</button>
          <button type="button" className="library-filter-toggle" aria-label={`${open ? "收起" : "展开"}${source.label}`} aria-expanded={open} onClick={() => expand(source.id, !open)}><ChevronRight size={14} strokeWidth={1.5}/></button></div>
        {open && <div className="library-filter-children">{mediaFormats.map(format => <button type="button" key={format.id} aria-selected={filter.source === source.id && filter.format === format.id} onClick={() => setFilter({ source: source.id, format: format.id })}>{format.label}</button>)}</div>}
      </div>;
    })}</nav><input ref={input} type="file" accept="image/*,audio/*,video/*" multiple hidden onChange={event => { accept(event.currentTarget.files); event.currentTarget.value = ""; }}/>{media.entries.length === 0 ? <button type="button" className="library-import-card" disabled={disabled} onClick={() => input.current?.click()}>
      <span className="library-import-title"><span className="library-import-icon"><Plus size={16} strokeWidth={2.4}/></span>导入</span>
      <span className="library-import-hint">{dragging ? "释放以导入素材" : "视频、音频、图片，支持将文件拖入这里"}</span>
    </button> : <><div className="library-actions"><button className="button library-import-button" type="button" disabled={disabled} onClick={() => input.current?.click()}><Plus size={14} strokeWidth={1.8}/>导入</button></div><label className="library-search"><Search size={14}/><input value={query} placeholder="搜索素材" onChange={event => setQuery(event.target.value)}/></label>{entries.length === 0 ? <div className="library-empty library-empty-state">
      <span className="library-empty-icon"><EmptyIcon size={26} strokeWidth={1.4}/></span>
      <span className="library-empty-title">{emptyText}</span>
      {emptyHint && <span className="library-empty-hint">{emptyHint}</span>}
    </div> :<div className="library-grid">{entries.map(entry => <MediaMenu key={entry.id} available={!disabled && entry.state === "available"} onPreview={() => onPreview(entry)} onPlace={() => onPlace(entry)}><article className={`library-card${selected === entry.id ? " selected" : ""}`} title={entry.diagnostic}>
    <button type="button" className="library-card-main" disabled={disabled || entry.state !== "available"}
      onPointerDown={event => onBeginDrag(event, entry)} onClick={event => { if (event.detail === 0) onPreview(entry); }} onDoubleClick={() => onPlace(entry)}>
      <MediaThumbnail entry={entry}/><span className="library-card-name">{entry.name}</span>
      <small className="library-card-meta">{entry.state === "available" ? entry.kind === "audio" ? "音频" : entry.mediaType?.startsWith("image/") ? "图片" : "视频" : entry.state === "missing" ? "文件缺失" : "无法读取"}</small>
    </button>{entry.state === "available" && <span className="library-card-actions"><IconButton label="添加到时间线" disabled={disabled} onClick={() => onPlace(entry)}><Plus size={14}/></IconButton></span>}
  </article></MediaMenu>)}</div>}</>}</div>;
}

/** Right-click actions for one Media bin entry. Removal is shown but stays unavailable until Project Media can remove accepted media. */
function MediaMenu({ children, available, onPreview, onPlace }: {
  readonly children: React.ReactNode;
  readonly available: boolean;
  readonly onPreview: () => void;
  readonly onPlace: () => void;
}) {
  return <ContextMenu.Root>
    <ContextMenu.Trigger style={{ display: "contents" }}>{children}</ContextMenu.Trigger>
    <ContextMenu.Portal><ContextMenu.Positioner className="dropdown-positioner" sideOffset={4} collisionPadding={12}>
      <ContextMenu.Popup className="dropdown-content dropdown-menu library-media-menu" data-dropdown-content="">
        <ContextMenu.Item className="dropdown-item" disabled={!available} onClick={onPreview}><Eye size={16}/>预览</ContextMenu.Item>
        <ContextMenu.Item className="dropdown-item" disabled={!available} onClick={onPlace}><Plus size={16}/>添加到时间线</ContextMenu.Item>
        <ContextMenu.Separator className="dropdown-separator"/>
        <ContextMenu.Item className="dropdown-item" disabled><Trash2 size={16}/>删除</ContextMenu.Item>
      </ContextMenu.Popup>
    </ContextMenu.Positioner></ContextMenu.Portal>
  </ContextMenu.Root>;
}

export function StudioBin({
  tab, catalog, media, disabled, onImportMedia, onPlaceMedia, onMaterialize, onMaterializeAdjust, onMaterializeTransition, onPreviewMedia, onBeginMediaDrag, onBeginPresetDrag, selectedMedia,
}: {
  readonly tab: BinTab;
  readonly catalog: NleStudioCatalogProjection;
  readonly media: NleStudioMediaProjection;
  readonly disabled: boolean;
  readonly onImportMedia: (files: readonly File[]) => void;
  readonly onPlaceMedia: (entry: NleStudioMediaEntry) => void;
  readonly onPreviewMedia: (entry: NleStudioMediaEntry) => void;
  readonly onBeginPresetDrag: (event: PointerEvent, value: CatalogDrag) => void;
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
  return <Browser heading={labels[tab]} entries={values} disabled={disabled} onBeginDrag={(event, id) => {
    const [packageName, offering] = id.split("\u0000");
    if (tab === "effects") { const entry = catalog.adjusts.find(entry => entry.package === packageName && entry.offering === offering); if (entry) onBeginPresetDrag(event, { kind: "effect", entry }); }
    else if (tab === "transitions") { const entry = catalog.transitions.find(entry => entry.package === packageName && entry.offering === offering); if (entry) onBeginPresetDrag(event, { kind: "transition", entry }); }
    else { const entry = catalog.components.find(entry => entry.package === packageName && entry.offering === offering); if (entry) onBeginPresetDrag(event, { kind: "component", entry }); }
  }} empty={tab === "text" ? "项目没有选择文本或图形组件" : tab === "subtitles" ? "项目没有选择字幕组件" : tab === "transitions" ? "项目没有选择转场" : "项目没有选择效果"} onSelect={id => {
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
