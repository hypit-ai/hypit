import { readMediaAssetDocumentFile } from "@hypit/media-asset/node";
import { findNleItem, type NleMediaItem, type NleProject } from "@hypit/nle";
import type { NleInspectorObservation, NleInspectorSection } from "@hypit/nle-view";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import { projectReference } from "@hypit/project/node";

function seconds(value: ExactTemporalValue): number {
  return Number(BigInt(value.ticks)) * value.timeBase.numerator / value.timeBase.denominator;
}

function mediaItems(project: NleProject, asset: string): readonly string[] {
  return project.tracks.flatMap((track) => track.items.flatMap((item) => item.kind === "present"
    && item.source === "media" && item.asset.path === asset ? [item.id] : []));
}

export class NleMediaInspector {
  constructor(private readonly projectRoot: string, private readonly projectFile: string) {}

  async observation(project: NleProject, id: string): Promise<NleInspectorObservation | undefined> {
    const { item } = findNleItem(project, id);
    if (item.kind !== "present" || item.source !== "media") return undefined;
    return await this.mediaObservation(project, item);
  }

  private async mediaObservation(project: NleProject, item: NleMediaItem): Promise<NleInspectorObservation> {
    const parts = item.asset.path.split("/");
    const fallbackName = parts[parts.length - 1]!.replace(/\.media\.json$/u, "");
    const sourceFields: NleInspectorSection["fields"][number][] = [
      { id: "name", label: "名称", control: "readout", value: fallbackName },
      { id: "asset", label: "Asset", control: "readout", value: item.asset.path },
    ];
    const sections: NleInspectorSection[] = [{
      id: "media-source",
      label: "素材来源",
      domain: "how",
      page: { id: "media", label: "素材" },
      owner: {
        kind: "media",
        media: item.asset.path,
        asset: item.asset.path,
        sharedBy: mediaItems(project, item.asset.path),
      },
      fields: sourceFields,
    }];
    try {
      const manifest = projectReference(
        this.projectRoot, this.projectFile, item.asset.path, `NLE Item ${item.id} Media Asset`,
      );
      const document = await readMediaAssetDocumentFile(manifest);
      sourceFields[0] = { ...sourceFields[0]!, value: document.id };
      const interpretation = document.media.interpretation;
      sourceFields.push({ id: "media-type", label: "文件类型", control: "readout",
        value: document.media.file.mediaType });
      const fields: NleInspectorSection["fields"][number][] = [];
      if (interpretation.domain !== undefined) {
        fields.push({ id: "duration", label: "素材时长", control: "number",
          value: seconds(interpretation.domain.duration), unit: "秒" });
      }
      const picture = interpretation.picture;
      if (picture !== undefined) {
        fields.push({ id: "picture-kind", label: "画面", control: "readout",
          value: picture.kind === "constant" ? "静态画面" : "视频信号" });
        fields.push({ id: "dimensions", label: "编码尺寸", control: "readout",
          value: `${picture.interpretation.codedWidth} × ${picture.interpretation.codedHeight}` });
        fields.push({ id: "rotation", label: "旋转解释", control: "number",
          value: picture.interpretation.rotationDegrees, unit: "°" });
      }
      if (interpretation.audio !== undefined) {
        fields.push({ id: "audio", label: "音频", control: "readout",
          value: `流 ${interpretation.audio.streamIndex}` });
      }
      fields.push({ id: "representations", label: "附加表达", control: "readout",
        value: `${document.representations.length} 个` });
      sections.push({
        id: "media-facts",
        label: "媒体事实",
        domain: "how",
        page: { id: "media", label: "素材" },
        owner: { kind: "host" },
        fields,
      });
    } catch (error) {
      sections.push({
        id: "media-facts",
        label: "媒体事实",
        domain: "how",
        page: { id: "media", label: "素材" },
        owner: { kind: "host" },
        fields: [{ id: "status", label: "读取状态", control: "readout",
          value: error instanceof Error ? error.message : String(error) }],
      });
    }
    return { item: item.id, sections };
  }
}
