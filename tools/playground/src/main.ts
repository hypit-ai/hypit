import { renderPreview } from "./preview/render.js";
import { sealProgramSpace, sealVisualTrack } from "./svml.js";
import type { ProgramSpace, Track, VisualElement } from "./svml.js";
import { createStage } from "./ui/stage.js";

/**
 * Slice 0 fixture.
 *
 * Two Presents that do not overlap, each with an animated child. The compiled
 * document gates neither — it marks every clip visible and starts every
 * animation at load — so this composition renders as one muddle without the
 * runtime shim and as a clean two-shot sequence with it. That difference is the
 * whole point of the fixture: it is what proves the shim before anything is
 * built on top of it.
 */

const programSpace: ProgramSpace = sealProgramSpace({
  contract: "svml.program-space@1",
  durationSec: 4,
  frameRate: { numerator: 30, denominator: 1 },
});

const CANVAS = { width: 1080, height: 1920, clearColor: "#09090b" };

function shot(
  id: string,
  startFrame: number,
  endFrameExclusive: number,
  order: number,
  fill: string,
  label: string,
): Track {
  const duration = endFrameExclusive - startFrame;
  const elements: VisualElement[] = [
    {
      id: "root",
      order: 0,
      kind: "box",
      style: [
        { name: "position", value: "absolute" },
        { name: "inset", value: 0 },
        { name: "display", value: "flex" },
        { name: "align-items", value: "center" },
        { name: "justify-content", value: "center" },
      ],
    },
    {
      id: "card",
      parent: "root",
      order: 1,
      kind: "box",
      style: [
        { name: "width", value: "760px" },
        { name: "height", value: "420px" },
        { name: "background", value: fill },
        { name: "border-radius", value: "36px" },
        { name: "display", value: "flex" },
        { name: "align-items", value: "center" },
        { name: "justify-content", value: "center" },
      ],
      // Fades up and settles. Seeking must land mid-fade, not at the end.
      animation: {
        keyframes: [
          { atFrame: 0, easing: "ease-out", style: [{ name: "opacity", value: 0 }, { name: "transform", value: "translateY(60px)" }] },
          { atFrame: Math.round(duration / 2), style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0px)" }] },
          { atFrame: duration, style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0px)" }] },
        ],
      },
    },
    {
      id: "label",
      parent: "card",
      order: 2,
      kind: "text",
      text: label,
      style: [
        { name: "color", value: "#09090b" },
        { name: "font-family", value: "ui-sans-serif, sans-serif" },
        { name: "font-size", value: "64px" },
        { name: "font-weight", value: 700 },
        { name: "text-align", value: "center" },
      ],
    },
  ];
  return sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id,
    presents: [{
      id: `${id}-present`,
      span: { startFrame, endFrameExclusive },
      stacking: { order, tieBreak: id },
      elements,
    }],
  });
}

const app = document.querySelector<HTMLElement>("#app")!;
const stage = createStage();
app.append(stage.element);

try {
  stage.show(renderPreview({
    id: "slice-0",
    canvas: CANVAS,
    programSpace,
    tracks: [
      shot("shot-a", 0, 60, 10, "#73fbd3", "frames 0–59"),
      shot("shot-b", 60, 120, 20, "#ffd166", "frames 60–119"),
    ],
  }));
} catch (error) {
  stage.showError(error instanceof Error ? error.message : String(error));
}
