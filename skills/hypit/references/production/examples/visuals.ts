import { sealPresentVisualTrack } from "@hypit/composition";
import { htmlVisualElement } from "@hypit/html-program";
import type { FontArtifactRef } from "@hypit/media";
import type { FrameSpan, Timeline } from "@hypit/timeline";

// The caller supplies its projected Window, resolved Frame and selected font faces.
export function renderCard(input: {
  id: string;
  timeline: Timeline;
  span: FrameSpan;
  frame: { x: number; y: number; width: number; height: number };
  text: string;
  fonts: readonly FontArtifactRef[];
  color: string;
  textColor: string;
  size: number;
  padding: number;
  entranceFrames: number;
}) {
  const root = `${input.id}-box`;
  const length = input.span.endFrameExclusive - input.span.startFrame;
  const entranceEnd = Math.min(input.entranceFrames, length - 1);
  return sealPresentVisualTrack({
    id: input.id,
    timelineId: input.timeline.id,
    presents: [{
      id: `${input.id}-present`,
      subjectId: input.id,
      span: input.span,
      root: htmlVisualElement({
        kind: "box", id: root,
        style: [
          { name: "position", value: "absolute" },
          { name: "left", value: input.frame.x },
          { name: "top", value: input.frame.y },
          { name: "width", value: input.frame.width },
          { name: "height", value: input.frame.height },
          { name: "background-color", value: input.color },
        ],
        ...(entranceEnd > 0 ? { animation: { keyframes: [
          { atFrame: 0, style: [{ name: "opacity", value: 0 }] },
          { atFrame: entranceEnd, style: [{ name: "opacity", value: 1 }] },
        ] } } : {}),
        children: [{
          kind: "text", id: `${input.id}-text`,
          text: input.text, fonts: input.fonts,
          style: [
            { name: "position", value: "absolute" },
            { name: "left", value: input.padding },
            { name: "top", value: input.padding },
            { name: "width", value: input.frame.width - 2 * input.padding },
            { name: "color", value: input.textColor },
            { name: "font-size", value: input.size },
          ],
        }],
      }),
    }],
  });
}
