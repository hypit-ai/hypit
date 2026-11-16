import type { NleProject } from "@hypit/nle";
import { AudioLines, Blend, Captions, Film, Images, Plus, Search, Type, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { NleStudioMediaProjection } from "../protocol.js";
import { IconButton } from "./common.js";

export type BinTab = "assets" | "text" | "subtitles" | "transitions" | "effects";

const labels: Record<BinTab, string> = { assets: "素材", text: "文本", subtitles: "字幕", transitions: "转场", effects: "效果" };

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
  return <div className="nle-bin-split"><nav className="nle-bin-side"><button type="button" aria-pressed="true">{heading}</button></nav><div className="nle-bin-main"><div className="nle-bin-toolbar"><label className="nle-preset-search"><Search size={14}/><input value={query} placeholder="搜索" onChange={event => setQuery(event.target.value)}/></label></div><div className="nle-bin-label">{heading}</div>{filtered.length === 0 ? <Empty>{empty}</Empty> : <div className="nle-preset-grid">{filtered.map(entry => <article className="nle-preset" key={entry.id}><button type="button" className={`nle-preset-preview studio-preset ${entry.kind}`} onDoubleClick={() => onSelect(entry.id)} onClick={() => onSelect(entry.id)}><span>{entry.kind === "text" ? <Type size={22}/> : entry.kind === "transition" ? <Blend size={22}/> : entry.kind === "subtitle" ? <Captions size={22}/> : <Wand2 size={22}/>}</span>{entry.detail && <small>{entry.detail}</small>}</button><IconButton className="nle-preset-add" label="在时间线中选择" onClick={() => onSelect(entry.id)}><Plus size={14}/></IconButton><span className="nle-preset-name">{entry.name}</span></article>)}</div>}</div></div>;
}

function Assets({ media }: { readonly media: NleStudioMediaProjection }) {
  const [query, setQuery] = useState(""), [kind, setKind] = useState<"all" | "picture" | "audio">("all");
  const entries = media.entries.filter(entry => (kind === "all" || entry.kind === kind || entry.kind === "audiovisual") && entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="project-library library-editor"><nav className="library-filters"><button type="button" aria-selected={kind === "all"} onClick={() => setKind("all")}>全部</button><button type="button" aria-selected={kind === "picture"} onClick={() => setKind("picture")}>画面</button><button type="button" aria-selected={kind === "audio"} onClick={() => setKind("audio")}>音频</button></nav><div className="library-actions"><button className="button" type="button" disabled>导入</button></div><label className="library-search"><Search size={14}/><input value={query} placeholder="搜索素材" onChange={event => setQuery(event.target.value)}/></label><div className="library-heading">项目素材</div>{entries.length === 0 ? <div className="library-empty nle-empty"><Images size={26}/><span>Project Media Service 中还没有媒体</span></div> : <div className="library-grid">{entries.map(entry => <article className="library-card" key={entry.id}><div className="library-thumbnail studio-library-thumbnail">{entry.resource ? <img src={entry.resource}/> : entry.kind === "audio" ? <AudioLines size={24}/> : <Film size={24}/>}</div><div className="library-card-name">{entry.name}</div><small className="library-card-meta">{entry.kind}</small></article>)}</div>}</div>;
}

export function StudioBin({ tab, project, media, onSelect }: {
  readonly tab: BinTab;
  readonly project: NleProject;
  readonly media: NleStudioMediaProjection;
  readonly onSelect: (id: string) => void;
}) {
  const values = useMemo(() => {
    const items = project.compositions.flatMap(composition => composition.tracks.flatMap(track => track.items));
    if (tab === "text" || tab === "subtitles") return items.filter(item => item.kind === "present" && item.source === "component").map(item => ({ id: item.id, name: item.name ?? item.component.symbol, detail: item.component.package, kind: tab === "text" ? "text" as const : "subtitle" as const }));
    if (tab === "effects") return items.flatMap(item => item.kind === "adjust" ? [{ id: item.id, name: item.name ?? item.operator.symbol, detail: item.operator.package, kind: "effect" as const }] : item.kind === "present" ? [...(item.picture?.processes ?? []), ...(item.audio?.processes ?? [])].map(process => ({ id: item.id, name: process.operator.symbol, detail: process.operator.package, kind: "effect" as const })) : []);
    if (tab === "transitions") return project.compositions.flatMap(composition => composition.transitions.map(transition => ({ id: transition.incoming, name: transition.operator.symbol, detail: transition.operator.package, kind: "transition" as const })));
    return [];
  }, [project, tab]);
  if (tab === "assets") return <Assets media={media}/>;
  return <Browser heading={labels[tab]} entries={values} empty={tab === "text" ? "当前 Project 中没有组件文本" : tab === "subtitles" ? "当前 Project 中没有字幕组件" : tab === "transitions" ? "当前 Composition 中没有转场" : "当前 Project 中没有效果"} onSelect={onSelect}/>;
}
