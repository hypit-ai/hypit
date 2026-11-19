import type { NleTimelineScene } from "@hypit/nle/view";
import type { ReviewComment } from "./reviewComments.js";

/** Sample review notes for demonstrating review mode, spread over the active composition's real duration. */
const samples: readonly { readonly at: number; readonly text: string; readonly resolved?: boolean }[] = [
  { at: .58, text: "这里节奏有点拖，可以考虑剪掉 2 秒。" },
  { at: .02, text: "开头黑场有点长，建议压到半秒以内，直接进画面。", resolved: true },
  { at: .21, text: "这句字幕比口播早了大概 6 帧，往后挪一点。" },
  { at: .74, text: "结尾音乐收得太突然，加 1 秒淡出。" },
  { at: .33, text: "标题字号再大一档，颜色换成品牌粉。" },
  { at: .12, text: "这个镜头色彩偏冷，和后面不太统一，可以稍微加点暖色。", resolved: true },
  { at: .46, text: "转场换成交叉溶解会更顺，现在的硬切有点跳。" },
  { at: .9, text: "最后停留的画面再多给半秒，让人看清楚 logo。" },
  { at: .4, text: "调色强度太高了，人物肤色有点发灰。", resolved: true },
  { at: .65, text: "这里的画面能不能换成产品特写？现在信息太散了。" },
];

export function demoReviewComments(scene: NleTimelineScene, now = Date.now()): ReviewComment[] {
  const end = Math.max(1, scene.maximumFrame);
  return samples.map((sample, index) => ({
    id: crypto.randomUUID(), number: index + 1, composition: scene.composition,
    frame: Math.round(end * sample.at), text: sample.text, resolved: sample.resolved === true,
    created: now - (samples.length - index) * 7 * 60_000,
  }));
}
