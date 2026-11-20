import { useEffect, useMemo, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { AudioLines, Box, Image, Search, Video } from "lucide-react";
import type { CanvasNode, CanvasSelection } from "@hypit/canvas";
import type { CanvasModel, CanvasPreviewRequest } from "../protocol.js";
import { preview } from "./session.js";
import { t } from "./ui.js";
import { filename, nodeTitle, type Catalog } from "./wiring.js";

export const categories = [
  { id: "image", icon: Image, label: t("Image", "图片") },
  { id: "video", icon: Video, label: t("Video", "视频") },
  { id: "audio", icon: AudioLines, label: t("Audio", "音频") },
] as const;

export type Category = typeof categories[number]["id"];

export function modelCategory(model?: CanvasModel) {
  return categories.find(category => Object.values(model?.outputs ?? {}).some(output => output.media === category.id));
}

export function cardIcon(node: CanvasNode, catalog: Catalog) {
  if ("capability" in node) return modelCategory(catalog.models.find(model => model.id === node.capability))?.icon ?? Box;
  const item = catalog.media.entries.find(entry => entry.reference.path === node.media.path);
  return categories.find(category => item?.state === "available" && item.mediaType.startsWith(category.id + "/"))?.icon ?? Box;
}

const labels: Record<string, string> = {
  prompt: "提示词", text: "文本", mode: "模式", aspectRatio: "画面比例", duration: "时长", resolution: "分辨率",
  size: "尺寸", seed: "随机种子", images: "图片参考", image: "图片", video: "视频", audio: "音频", model: "模型",
  firstFrame: "首帧", lastFrame: "尾帧", referenceImages: "参考图片", referenceVideos: "参考视频", referenceAudios: "参考音频",
  quality: "质量", background: "背景", outputFormat: "输出格式", voice: "声音", speed: "速度", n: "数量",
  generateAudio: "生成音频", frames: "首尾帧", references: "参考素材", edit: "编辑", width: "宽度", height: "高度", negativePrompt: "负面提示词",
};

export function fieldLabel(name: string) {
  return t("", labels[name] ?? "") || name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ")
    .replace(/^\w/, letter => letter.toUpperCase());
}

export { filename as mediaName };

export function usePreview(node: string, selection?: CanvasSelection, enabled = true, identity = "") {
  return useResourcePreview(node ? { node, ...(selection ? { selection } : {}) } : undefined, enabled, identity);
}

function useResourcePreview(input: CanvasPreviewRequest | undefined, enabled: boolean, identity = "") {
  const [resource, setResource] = useState<{ url: string; mediaType: string }>();
  const [error, setError] = useState("");
  const key = JSON.stringify(input);
  useEffect(() => {
    setResource(undefined); setError("");
    if (!enabled || !input) return;
    let active = true;
    void preview(input).then(value => { if (active) setResource(value); }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [key, enabled, identity]);
  return { resource, error };
}

export function MediaPreview({ resource, title, controls = false, className }: {
  resource: { url: string; mediaType: string }; title: string; controls?: boolean; className?: string;
}) {
  return resource.mediaType.startsWith("image/") ? <img className={className} src={resource.url} alt={title} draggable={false}/>
    : resource.mediaType.startsWith("audio/") ? <audio className={`nodrag nowheel ${className ?? ""}`} src={resource.url} controls preload="metadata"/>
    : <video className={`nodrag ${className ?? ""}`} src={resource.url} controls={controls} muted={!controls} preload="metadata" playsInline/>;
}

export function MediaThumbnail({ path, title }: { path: string; title: string }) {
  const { resource } = useResourcePreview({ media: { path } }, true);
  return <span className="reference-thumbnail">
    {resource?.mediaType.startsWith("image/") ? <img src={resource.url} alt={title} draggable={false}/>
      : resource?.mediaType.startsWith("video/") ? <video src={resource.url} muted preload="metadata"/>
      : resource?.mediaType.startsWith("audio/") ? <AudioLines size={17}/> : <Image size={17}/>}
  </span>;
}

export function ObjectSearch({ nodes, catalog, choose }: { nodes: readonly CanvasNode[]; catalog: Catalog; choose: (id: string) => void }) {
  const items = useMemo(() => nodes.map(node => ({
    value: node.id, label: nodeTitle(node, catalog.models),
    type: "media" in node ? t("Project Media", "项目素材") : catalog.models.find(model => model.id === node.capability)?.title ?? node.capability,
  })), [nodes, catalog]);
  return <div className="graph-search">
    <Search size={16}/>
    <Combobox.Root<(typeof items)[number]> items={items} autoHighlight itemToStringLabel={item => item.label} onValueChange={item => { if (item) choose(item.value); }}
      filter={(item, query) => `${item.label} ${item.value} ${item.type}`.toLowerCase().includes(query.toLowerCase())}>
      <Combobox.Input aria-label={t("Find object", "查找对象")} placeholder={t("Find object", "查找对象")}/>
      <Combobox.Portal><Combobox.Positioner className="dropdown-positioner" sideOffset={6} collisionPadding={12}>
        <Combobox.Popup className="dropdown-content graph-search-results">
          <Combobox.Empty className="dropdown-empty">{t("No matching objects", "没有匹配对象")}</Combobox.Empty>
          <Combobox.List className="dropdown-list">{item => <Combobox.Item className="dropdown-item" key={item.value} value={item}>
            <span className="dropdown-item-label">{item.label}<small>{item.type}</small></span>
          </Combobox.Item>}</Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner></Combobox.Portal>
    </Combobox.Root>
  </div>;
}
