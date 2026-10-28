import { sealComposition, sealPresentVisualTrack } from "@hypit/composition";
import { htmlVisual, compileHtmlProgram } from "@hypit/html-program";
import { sealTimeline } from "@hypit/timeline";

export function htmlFrameFixture() {
  const space = sealTimeline({ id: "space", frameCount: 12, frameRate: { numerator: 12, denominator: 1 } });
  return compileHtmlProgram(sealComposition({ id: "frames", visual: { canvas: { width: 96, height: 64, clearColor: "#000000" }, root: { members: [{ kind: "track", id: "motion", track: sealPresentVisualTrack({ id: "motion", timelineId: space.id, visualIr: "hypit.visual-ir@1", presents: [{ id: "reveal",
      span: { startFrame: 3, endFrameExclusive: 12 }, root: { id: "program",
        kind: "program", style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
        slots: [],
        program: htmlVisual({ html: '<div class="box"></div>', css: '.box{position:absolute;top:0;width:8px;height:64px;background:#ff0000}',
          setup: 'return frame => { root.querySelector(".box").style.left = `${frame * 8}px`; };' }),
      } }] }) }] } }, audio: { contributions: [] } }), space);
}
