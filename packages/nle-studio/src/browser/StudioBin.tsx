import { ContextMenu } from "@base-ui/react/context-menu";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { ProjectMediaAssetChange, ProjectMediaLibraryChange, ProjectMediaLibraryFolder } from "@hypit/media-asset/service";
import { ChevronRight, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { exactTemporalRational, type ExactTemporalValue } from "@hypit/temporal/algebra";
import type {
  NleStudioAdjustCatalogEntry,
  NleStudioCatalogProjection,
  NleStudioComponentCatalogEntry,
  NleStudioMediaEntry,
  NleStudioMediaLibraryProjection,
  NleStudioProcessCatalogEntry,
  NleStudioMediaProjection,
  NleStudioTransitionCatalogEntry,
} from "../protocol.js";
import { catalogDragId, type CatalogDrag } from "./catalogDrag.js";
import { IconButton } from "./common.js";
import { MediaThumbnail } from "./MediaThumbnail.js";
import { EditorDialog } from "./EditorDialog.js";
import { LibraryDisplayOptions } from "./LibraryDisplayOptions.js";
import { arrangeLibraryItems, filterLibraryFolders, libraryMediaLabel, type LibraryFilter, type LibrarySort } from "./library-media.js";
import { useMarqueeSelection } from "./useMarqueeSelection.js";
import { studioIcons } from "./studio-icons.js";


export type BinTab = "assets" | "text" | "subtitles" | "transitions" | "filters" | "effects";

const labels: Record<BinTab, string> = { assets: "素材", text: "新建", subtitles: "字幕", transitions: "转场", filters: "滤镜", effects: "特效" };

const fileNameSegments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const mediaSearchPlaceholder = "搜索文件名";

function mediaDuration(duration: ExactTemporalValue): string {
  const { numerator, denominator } = exactTemporalRational(duration);
  const seconds = (numerator + denominator / 2n) / denominator;
  const minutes = seconds / 60n;
  const parts = minutes < 60n ? [minutes, seconds % 60n] : [minutes / 60n, minutes % 60n, seconds % 60n];
  return parts.map(part => String(part).padStart(2, "0")).join(":");
}

function MediaCardName({ name, extensionLength }: { readonly name: string; readonly extensionLength: number }) {
  const stem = name.slice(0, name.length - extensionLength);
  const suffix = useMemo(() => [...fileNameSegments.segment(stem)].at(-6)?.index ?? 0, [stem]);
  return <span className="library-card-name" title={name}>
    <span className="library-card-name-prefix">{name.slice(0, suffix)}</span>
    <span className="library-card-name-suffix">{name.slice(suffix)}</span>
  </span>;
}

function Empty({ children }: { readonly children: React.ReactNode }) {
  return <p className="nle-preset-empty">{children}</p>;
}

function Browser({ heading, entries, empty, onSelect, disabled, onBeginDrag }: {
  readonly disabled: boolean;
  readonly onBeginDrag: (event: PointerEvent, id: string) => void;
  readonly heading: string;
  readonly entries: readonly { readonly id: string; readonly name: string; readonly kind: Exclude<keyof typeof studioIcons, "assets"> }[];
  readonly empty: string;
  readonly onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = entries.filter(entry => entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="nle-bin-split"><nav className="nle-bin-side"><button type="button" aria-pressed="true">{heading}</button></nav><div className="nle-bin-main"><div className="nle-bin-toolbar"><label className="nle-preset-search"><Search size={14}/><input value={query} placeholder="搜索" onChange={event => setQuery(event.target.value)}/></label></div><div className="nle-bin-label">{heading}</div>{filtered.length === 0 ? <Empty>{empty}</Empty> : <div className="nle-preset-grid">{filtered.map(entry => {
    const Icon = studioIcons[entry.kind];
    return <article className="nle-preset" key={entry.id}><button type="button" className={`nle-preset-preview studio-preset ${entry.kind}`} disabled={disabled} onPointerDown={event => onBeginDrag(event, entry.id)} onClick={event => { if (event.detail === 0) onSelect(entry.id); }}><span><Icon size={22}/></span><small>{entry.name}</small></button><IconButton className="nle-preset-add" label="添加到时间线" disabled={disabled} onClick={() => onSelect(entry.id)}><Plus size={14}/></IconButton><span className="nle-preset-name">{entry.name}</span></article>;
  })}</div>}</div></div>;
}

type FolderLocation = { readonly folder: ProjectMediaLibraryFolder; readonly trail: readonly ProjectMediaLibraryFolder[] };

function folderLocations(folders: readonly ProjectMediaLibraryFolder[], parents: readonly ProjectMediaLibraryFolder[] = []): FolderLocation[] {
  return folders.flatMap(folder => {
    const trail = [...parents, folder];
    return [{ folder, trail }, ...folderLocations(folder.folders, trail)];
  });
}

type LibraryTarget =
  | { readonly kind: "folder"; readonly value: ProjectMediaLibraryFolder }
  | { readonly kind: "asset"; readonly value: NleStudioMediaEntry };

type LibraryDialog =
  | { readonly kind: "create"; readonly parent: string | null; readonly name: string }
  | { readonly kind: "rename" | "remove"; readonly target: LibraryTarget };

function LibraryItemMenu({ target, canRename = true, canRemove = true, onSelect }: {
  readonly target: LibraryTarget;
  readonly canRename?: boolean;
  readonly canRemove?: boolean;
  readonly onSelect: (dialog: LibraryDialog) => void;
}) {
  return <ContextMenu.Portal><ContextMenu.Positioner className="dropdown-positioner">
    <ContextMenu.Popup className="dropdown-content dropdown-menu library-context-menu">
      <ContextMenu.Item className="dropdown-item" disabled={!canRename}
        onClick={() => onSelect({ kind: "rename", target })}>重命名</ContextMenu.Item>
      <ContextMenu.Item className="dropdown-item danger" disabled={!canRemove} onClick={() => onSelect({ kind: "remove", target })}>删除</ContextMenu.Item>
    </ContextMenu.Popup>
  </ContextMenu.Positioner></ContextMenu.Portal>;
}

function Assets({ media, library, usedMedia, disabled, folderDrop, onImport, onEdit, onEditMedia, onPlace, onPreview, onOpenFolder, onBeginDrag }: {
  readonly media: NleStudioMediaProjection;
  readonly library: NleStudioMediaLibraryProjection;
  readonly usedMedia: readonly string[];
  readonly disabled: boolean;
  readonly folderDrop: string | null | undefined;
  readonly onImport: (files: readonly File[], folder: string | null) => void;
  readonly onEdit: (change: ProjectMediaLibraryChange) => void;
  readonly onEditMedia: (change: ProjectMediaAssetChange) => void;
  readonly onPlace: (entry: NleStudioMediaEntry) => void;
  readonly onPreview: (entry: NleStudioMediaEntry) => void;
  readonly onOpenFolder: () => void;
  readonly onBeginDrag: (event: PointerEvent, entry: NleStudioMediaEntry, onClick: () => void) => void;
}) {
  const [query, setQuery] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [listView, setListView] = useState(false);
  const [sort, setSort] = useState<LibrarySort>({ field: "adoptedAt", direction: "ascending" });
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [dialog, setDialog] = useState<LibraryDialog>();
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const breadcrumbs = useRef<HTMLElement>(null);
  const added = useMemo(() => new Set(usedMedia), [usedMedia]);
  const search = query.trim().toLocaleLowerCase();
  const locations = useMemo(() => folderLocations(library.state === "available" ? library.root.folders : []), [library]);
  const current = locations.find(({ folder }) => folder.id === folderId);
  const activeFolder = current?.folder.id ?? null;
  const currentFolders = useMemo(() => current?.folder.folders ?? (library.state === "available" ? library.root.folders : []),
    [current, library]);
  const items = useMemo(() => {
    const folders = search ? [] : filterLibraryFolders(currentFolders, media.entries, filter);
    const assigned = library.state === "available" ? new Set((current?.folder.assets ?? library.root.assets).map(asset => asset.path)) : undefined;
    const listedMedia = media.entries.filter(entry => search ? libraryMediaLabel(entry).toLocaleLowerCase().includes(search)
      : assigned === undefined || assigned.has(entry.id));
    const present = new Set(media.entries.map(entry => entry.id));
    const missing: NleStudioMediaEntry[] = (current?.folder.assets ?? []).filter(asset => !present.has(asset.path)).map(({ path }) => ({
      id: path, name: path.split("/").at(-1)!.replace(/\.media\.json$/u, ""),
      state: "missing", kind: "unknown", diagnostic: `素材已找不到：${path}`,
    }));
    return arrangeLibraryItems(folders, search ? listedMedia : [...listedMedia, ...missing], filter, sort);
  }, [current, currentFolders, library, media.entries, search, filter, sort]);
  const canEdit = !disabled && library.state === "available";
  const selected = useMemo(() => new Set(selection), [selection]);
  const { box: marqueeBox, start: startMarquee, cancel: cancelMarquee } = useMarqueeSelection({
    selection, onSelect: setSelection, targetAttribute: "data-library-entry", exclude: "button",
    disabled: disabled || dialog !== undefined || dragging,
  });
  useEffect(() => cancelMarquee, [cancelMarquee, items, listView]);
  useEffect(() => {
    const ids = new Set(items.map(item => item.value.id));
    setSelection(current => current.every(id => ids.has(id)) ? current : current.filter(id => ids.has(id)));
  }, [items]);
  useEffect(() => {
    const nav = breadcrumbs.current;
    if (nav) nav.scrollLeft = nav.scrollWidth;
  }, [activeFolder]);
  const emptyMessage = search || filter !== "all" ? "没有匹配的素材" : "将文件拖到这里，或点击导入";
  const accept = (files: FileList | null) => {
    const selected = files === null ? [] : Array.from(files);
    if (selected.length > 0) onImport(selected, activeFolder);
  };
  const openFolder = (next: string | null) => {
    setFolderId(next);
    setQuery("");
    setSelection([]);
    onOpenFolder();
  };
  const toggleSelection = (id: string) => setSelection(current =>
    current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const selectMedia = (entry: NleStudioMediaEntry) => {
    setSelection([entry.id]);
    onPreview(entry);
  };
  const createFolder = () => {
    const names = new Set(currentFolders.map(folder => folder.name));
    let name = "新建文件夹";
    for (let number = 2; names.has(name); number += 1) name = `新建文件夹 ${number}`;
    setDialog({ kind: "create", parent: activeFolder, name });
  };
  const remove = (target: LibraryTarget) => {
    if (target.kind === "folder") onEdit({ kind: "folder.remove", folder: target.value.id });
    else onEditMedia({ kind: "asset.remove", asset: { path: target.value.id } });
  };
  return <div className={`project-library library-editor${dragging ? " import-dragging" : ""}`}
    onDragEnter={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
    onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
    onDragLeave={event => { const target = event.relatedTarget; if (!(target instanceof Node) || !event.currentTarget.contains(target)) setDragging(false); }}
    onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled) accept(event.dataTransfer.files); }}>
    <nav className="nle-bin-side library-sources" aria-label="素材来源">
      <span aria-current="page">导入</span>
    </nav>
    <div className="library-toolbar">
      <input ref={input} type="file" accept="image/*,audio/*,video/*" multiple hidden
        onChange={event => { accept(event.currentTarget.files); event.currentTarget.value = ""; }}/>
      <button className="button library-import" type="button" disabled={disabled} onClick={() => input.current?.click()}>
        导入
      </button>
      <label className="library-search">
        <Search size={14} aria-hidden="true"/>
        <span className="library-search-field">
          <input value={query} aria-label="搜索素材" placeholder={mediaSearchPlaceholder} onChange={event => setQuery(event.target.value)}/>
          <span className="library-search-placeholder" aria-hidden="true">{mediaSearchPlaceholder}</span>
        </span>
      </label>
      <LibraryDisplayOptions listView={listView} onToggleView={() => setListView(value => !value)}
        sort={sort} onSort={setSort} filter={filter} onFilter={setFilter}/>
    </div>
    <div className="library-heading">
      <nav className="library-breadcrumb" aria-label="素材文件夹" ref={breadcrumbs}>
        <button type="button" onClick={() => openFolder(null)} data-media-folder-drop={canEdit ? "" : undefined}
          data-drop-active={folderDrop === null}>全部</button>
        {current?.trail.map(part => <span key={part.id}><ChevronRight size={12} aria-hidden="true"/>
          <button type="button" onClick={() => openFolder(part.id)} title={part.name}
            data-media-folder-drop={canEdit ? part.id : undefined} data-drop-active={folderDrop === part.id}>{part.name}</button>
        </span>)}
      </nav>
      {library.state === "invalid" && <div className="library-diagnostic" role="status">{library.diagnostic}</div>}
    </div>
    <ContextMenu.Root disabled={!canEdit}>
    <ContextMenu.Trigger render={<div className={`library-grid${listView ? " library-list" : ""}`} tabIndex={-1} onPointerDown={event => {
      if (startMarquee(event)) event.currentTarget.focus({ preventScroll: true });
    }}/>}>
      {items.length === 0 && <div className="library-empty nle-empty">
        <studioIcons.assets size={26}/><span>{dragging ? "释放以导入素材" : emptyMessage}</span>
      </div>}
      {items.map(item => {
        if (item.kind === "folder") {
          const folder = item.value;
          return <ContextMenu.Root key={folder.id} disabled={!canEdit}>
            <ContextMenu.Trigger render={<button type="button" className={`library-folder library-card-main${selected.has(folder.id) ? " selected" : ""}`}
              aria-label={`打开文件夹 ${folder.name}`} aria-pressed={selected.has(folder.id)} data-library-entry={folder.id}
              data-media-folder-drop={canEdit ? folder.id : undefined} data-drop-active={folderDrop === folder.id}
              onClick={event => {
                if (event.metaKey || event.ctrlKey) toggleSelection(folder.id);
                else openFolder(folder.id);
              }}/>}>
              <span className="library-thumbnail library-folder-thumbnail" aria-hidden="true"/>
              <span className="library-card-name library-folder-name" title={folder.name}>{folder.name}</span>
            </ContextMenu.Trigger>
            <LibraryItemMenu target={{ kind: "folder", value: folder }} onSelect={setDialog}/>
          </ContextMenu.Root>;
        }
        const entry = item.value;
        const duration = entry.state === "available" && entry.duration !== undefined ? mediaDuration(entry.duration) : undefined;
        const used = added.has(entry.id);
        const label = libraryMediaLabel(entry);
        return <ContextMenu.Root key={entry.id} disabled={!canEdit}>
        <ContextMenu.Trigger render={<article className={`library-card${selected.has(entry.id) ? " selected" : ""}`}
          data-library-entry={entry.id} title={entry.diagnostic}/>}>
          <button type="button" className="library-card-main" disabled={disabled || entry.state !== "available"}
            aria-label={[label, duration, used ? "已添加" : undefined].filter(Boolean).join("，")}
            aria-pressed={selected.has(entry.id)}
            onPointerDown={event => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
              const card = event.currentTarget;
              onBeginDrag(event, entry, () => {
                card.focus({ preventScroll: true });
                selectMedia(entry);
              });
            }}
            onClick={event => {
              if (event.metaKey || event.ctrlKey) toggleSelection(entry.id);
              else if (event.detail === 0) selectMedia(entry);
            }}
            onDoubleClick={event => { if (!event.metaKey && !event.ctrlKey) onPlace(entry); }}>
            <MediaThumbnail entry={entry} strip={listView} mediaGeneration={media.derivedViews ? media.generation : undefined}>
              {used && <span className="library-added">已添加</span>}
              {duration !== undefined && <span className="library-duration">{duration}</span>}
            </MediaThumbnail>
            <MediaCardName name={label} extensionLength={entry.fileExtension?.length ?? 0}/>
          </button>
          {entry.state === "available" && <span className="library-card-actions">
            <IconButton label="添加到播放头" disabled={disabled} onClick={() => onPlace(entry)}><Plus size={14}/></IconButton>
          </span>}
        </ContextMenu.Trigger>
        <LibraryItemMenu target={{ kind: "asset", value: entry }} canRename={entry.adoptedAt !== undefined}
          canRemove={media.removeAssets} onSelect={setDialog}/>
        </ContextMenu.Root>;
      })}
      {marqueeBox && <div className="nle-marquee" style={marqueeBox} aria-hidden="true"/>}
    </ContextMenu.Trigger>
    <ContextMenu.Portal><ContextMenu.Positioner className="dropdown-positioner"><ContextMenu.Popup className="dropdown-content dropdown-menu library-context-menu">
      <ContextMenu.Item className="dropdown-item" onClick={createFolder}>新建文件夹</ContextMenu.Item>
    </ContextMenu.Popup></ContextMenu.Positioner></ContextMenu.Portal>
    </ContextMenu.Root>
    {dialog?.kind === "create" && <EditorDialog title="新建文件夹" initialName={dialog.name}
      onClose={() => setDialog(undefined)} onSubmit={name => {
        onEdit({ kind: "folder.create", parent: dialog.parent, name });
        setQuery("");
        setFilter("all");
      }}/>}
    {dialog?.kind === "rename" && <EditorDialog title={dialog.target.kind === "folder" ? "重命名文件夹" : "重命名素材"}
      initialName={dialog.target.value.name} onClose={() => setDialog(undefined)} onSubmit={name => {
        const { kind, value } = dialog.target;
        if (name === value.name) return;
        if (kind === "folder") onEdit({ kind: "folder.rename", folder: value.id, name });
        else onEditMedia({ kind: "asset.rename", asset: { path: value.id }, displayName: name });
      }}/>}
    {dialog?.kind === "remove" && <AlertDialog.Root defaultOpen onOpenChangeComplete={open => { if (!open) setDialog(undefined); }}>
      <AlertDialog.Portal><AlertDialog.Backdrop className="studio-dialog-backdrop"/>
        <AlertDialog.Popup className="studio-dialog modal">
          <AlertDialog.Title>删除{dialog.target.kind === "folder" ? "文件夹" : "素材"}</AlertDialog.Title>
          <AlertDialog.Description>
            {dialog.target.kind === "folder"
              ? `删除「${dialog.target.value.name}」后，里面的素材和子文件夹会移到上一级。`
              : `从项目素材库删除「${dialog.target.value.name}」。媒体文件和附件会保留。`}
          </AlertDialog.Description>
          <footer><AlertDialog.Close className="button">取消</AlertDialog.Close>
            <AlertDialog.Close className="button danger" onClick={() => remove(dialog.target)}>删除</AlertDialog.Close></footer>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>}
  </div>;
}

export function StudioBin({
  tab, catalog, media, mediaLibrary, usedMedia, disabled, folderDrop, onImportMedia, onEditLibrary, onEditMedia, onPlaceMedia, onMaterialize, onMaterializeAdjust, onMaterializeTransition, onPreviewMedia, onOpenMediaFolder, onBeginMediaDrag, onBeginPresetDrag, processSignals, onMaterializeProcess,
}: {
  readonly tab: BinTab;
  readonly catalog: NleStudioCatalogProjection;
  readonly media: NleStudioMediaProjection;
  readonly mediaLibrary: NleStudioMediaLibraryProjection;
  readonly folderDrop: string | null | undefined;
  readonly usedMedia: readonly string[];
  readonly disabled: boolean;
  readonly onImportMedia: (files: readonly File[], folder: string | null) => void;
  readonly onEditLibrary: (change: ProjectMediaLibraryChange) => void;
  readonly onEditMedia: (change: ProjectMediaAssetChange) => void;
  readonly onPlaceMedia: (entry: NleStudioMediaEntry) => void;
  readonly onPreviewMedia: (entry: NleStudioMediaEntry) => void;
  readonly onOpenMediaFolder: () => void;
  readonly onBeginPresetDrag: (event: PointerEvent, value: CatalogDrag) => void;
  readonly onBeginMediaDrag: (event: PointerEvent, entry: NleStudioMediaEntry, onClick: () => void) => void;
  readonly processSignals: { readonly picture: boolean; readonly audio: boolean } | undefined;
  readonly onMaterializeProcess: (entry: NleStudioProcessCatalogEntry) => void;
  readonly onMaterialize: (entry: NleStudioComponentCatalogEntry) => void;
  readonly onMaterializeAdjust: (entry: NleStudioAdjustCatalogEntry) => void;
  readonly onMaterializeTransition: (entry: NleStudioTransitionCatalogEntry) => void;
}) {
  const values = useMemo(() => {
    const presets: CatalogDrag[] = [];
    if (tab === "text" || tab === "subtitles" || tab === "effects") {
      const role = tab === "subtitles" ? "subtitle" : tab === "effects" ? "effect" : "text";
      for (const entry of catalog.components) {
        if (entry.role === role || tab === "text" && entry.role === "picture") {
          presets.push({ kind: "component", entry });
        }
      }
    }
    if (tab === "effects" || tab === "filters") {
      const role = tab === "filters" ? "filter" : "effect";
      for (const entry of catalog.adjusts) if (entry.role === role) presets.push({ kind: "adjust", entry });
    }
    if (tab === "transitions") for (const entry of catalog.transitions) presets.push({ kind: "transition", entry });
    return presets.map(preset => ({
      id: catalogDragId(preset),
      name: preset.entry.title,
      kind: preset.kind === "transition" ? preset.kind : preset.entry.role,
      preset,
    }));
  }, [catalog, tab]);
  if (tab === "assets") return <Assets media={media} library={mediaLibrary} usedMedia={usedMedia} disabled={disabled} folderDrop={folderDrop}
    onImport={onImportMedia} onEdit={onEditLibrary} onEditMedia={onEditMedia} onPlace={onPlaceMedia} onPreview={onPreviewMedia}
    onOpenFolder={onOpenMediaFolder} onBeginDrag={onBeginMediaDrag}/>;
  const processes = tab === "effects" ? catalog.processes.filter(entry => processSignals?.[entry.medium]) : [];
  return <>{processes.length > 0 && <div className="library-actions" aria-label="片段效果">{processes.map(entry =>
    <button type="button" className="button" disabled={disabled} key={entry.package + "/" + entry.offering}
      onClick={() => onMaterializeProcess(entry)}>{entry.title} · 片段</button>)}</div>}
    <Browser heading={labels[tab]} entries={values} disabled={disabled} onBeginDrag={(event, id) => {
      const preset = values.find(value => value.id === id)?.preset;
      if (preset !== undefined) onBeginPresetDrag(event, preset);
    }} empty={tab === "text" ? "项目没有选择文本或图形组件" : tab === "subtitles" ? "项目没有选择字幕组件" : tab === "transitions" ? "项目没有选择转场" : tab === "filters" ? "项目没有选择滤镜" : "项目没有选择特效"} onSelect={id => {
      const preset = values.find(value => value.id === id)?.preset;
      if (preset?.kind === "component") onMaterialize(preset.entry);
      else if (preset?.kind === "adjust") onMaterializeAdjust(preset.entry);
      else if (preset?.kind === "transition") onMaterializeTransition(preset.entry);
    }}/></>;
}
