import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { compileHtmlProgram, materializeHtmlProgram } from "@hypit/html-program";
import { sealComposition } from "@hypit/composition";
import sharp from "sharp";
import test from "node:test";
import { captureBrowserExecutablePath, withCapture } from "@hypit/browser-capture";
import { captionDocument, parseScript } from "@hypit/script";
import { sealTimeline } from "@hypit/timeline";
import type { Recipe } from "@hypit/recipe";
import { projectProgramWindow } from "../../../../test/temporal-fixture.js";
import { fixtureResource } from "../../../../test/fixture-resource.js";
import { fineCaptionStyle, renderFineCaption, scheduleFineCaption } from "../../src/index.js";

const executablePath = process.env.HYPIT_CAPTURE_TEST_BROWSER ?? await captureBrowserExecutablePath();

function cueHtml(source: string, width: number, extra: Recipe["properties"]): string {
  const document = captionDocument(parseScript("layout", `<line>${source}</line>`), "caption", "story");
  const timeline = sealTimeline({ id: "timeline", frameCount: 120, frameRate: { numerator: 30, denominator: 1 } });
  const style = fineCaptionStyle("plain", { path: "caption", properties: {
    align: "center", background: "#00000000", fill: "#000000", "line-height": 1.2,
    "anchor-x": "left", "anchor-y": "top", padding: "0", radius: 0, "stack-order": 1, size: 36, width: 1, x: 0, y: 0, "word-gap": 14, "inline-size": "fixed",
    karaoke: "trail", "active-box": "trail", "active-box-continuity": "joined", "active-box-padding": "0", "active-box-background": "#00800080", "active-box-radius": 0, ...extra,
  } }, [{ sources: [{ artifact: { kind: "blob", resource: fixtureResource("font"), size: 1, mediaType: "font/woff2" } }], weight: 400, style: "normal" }]);
  const program = { id: "p", documentId: document.id, styles: [style], uses: [{ id: "use", styleId: "plain",
    window: projectProgramWindow({ itemId: "use", semantic: timeline, projection: { start: { ref: "timeline.start" }, end: { ref: "timeline.end" } } }),
  }] };
  const timed = { timelineId: timeline.id, documentId: document.id,
    units: document.units.map((unit, index) => ({ unitId: unit.id, startFrame: index * 5, endFrameExclusive: index * 5 + 5 })) };
  const track = renderFineCaption(scheduleFineCaption(timed, program, document), program, document, timeline,
    { xPx: 0, yPx: 0, widthPx: width, heightPx: 500 });
  const compiled = compileHtmlProgram(sealComposition({ id: "test",
    canvas: { width, height: 500, clearColor: "#ffffff" }, tracks: [track] }), timeline);
  // Both copies use the same face. Exact-font loading is exercised by renderer integration.
  return materializeHtmlProgram(compiled, () => "data:font/woff2;base64,AA==")
    .replace("</head>", `<style>[data-hypit-element-id]{font-family:Arial!important}[data-composition-id]{width:${width}px;height:500px}</style></head>`);

}

test("joined activation keeps complete Cue geometry through alignment and wrapping", {
  skip: !existsSync(executablePath) && "Selected capture browser is not prepared",
}, async () => {
  await withCapture({ launch: { executablePath } }, async ({ page }) => {
    for (const style of [{ align: "left" }, { align: "center" }, { align: "right" },
      { align: "center", "active-box-padding": "5 8", "active-box-border-width": 2, padding: "7 11" },
      { align: "center", "max-words-per-line": 2 }, { align: "right", direction: "rtl" },
      { align: "center", "stroke-width": 3 }, { align: "center", "atom-reveal": "typewriter" }]) {
      for (const [source, width] of [["hello world more text", 170], ["supercalifragilisticexpialidocious", 170],
        ["<3개월 만에|> 완료했습니다", 500], ["3D hello", 350]] as const) {
        await page.setContent(cueHtml(source, width, style));
        const mismatches = await page.evaluate(() => Array.from(document.querySelectorAll("[data-hypit-element-id]")).flatMap(element => {
          const match = /^joined-group-(\d+)-word-(\d+)$/u.exec(element.getAttribute("data-hypit-element-id")!);
          if (!match) return [];
          const base = document.querySelector(`[data-hypit-element-id="atom-${Number(match[1]) + 1}-base-${Number(match[2]) + 1}"]`)!;
          const actual = element.getBoundingClientRect(), expected = base.getBoundingClientRect();
          return (["x", "y", "width", "height"] as const).flatMap(key => Math.abs(actual[key] - expected[key]) > 0.1 ? [`${element.id}:${key}`] : []);
        }));
        assert.deepEqual(mismatches, [], JSON.stringify({ source, width, style }));
      }
    }
  });
});

test("joined backgrounds cover wrapped glyphs, preserve opacity and seek without stale geometry", {
  skip: !existsSync(executablePath) && "Selected capture browser is not prepared",
}, async () => {
  await withCapture({ launch: { executablePath } }, async ({ page }) => {
    for (const [source, width] of [["supercalifragilisticexpialidocious more", 170],
      ["<3개월 만에|> 완료했습니다", 170], ["是的 就是这样 3D hello", 170]] as const) {
      await page.setContent(cueHtml(source, width, {
        "active-box-padding": "12 8", "active-box-border-width": 2, "active-box-border-color": "#000000",
        "active-box-radius": 8,
      }));
      // Reverse/repeated seeks and a resized Cue exercise measurement after layout changes.
      for (const [frame, scale, size] of [[0, 1, width], [20, 1, width], [5, .7, width],
        [0, 1, width + 40], [20, 1, width]] as const) {
        const coverage = await page.evaluate(async ({ frame, scale, size }) => {
          const cue = document.querySelector<HTMLElement>('[data-hypit-element-id="cue"]')!;
          cue.style.width = `${size}px`;
          // The box is measured in its own coordinates even while its ancestors move.
          cue.style.transform = `rotate(12deg) scale(${scale})`;
          await (window as typeof window & {
            __hypitFrameProgram: { applyFrame(frame: number): Promise<void> };
          }).__hypitFrameProgram.applyFrame(frame);
          const error = (window as unknown as { __hypitHtmlVisualError?: string }).__hypitHtmlVisualError;
          const layers = Array.from(document.querySelectorAll<HTMLElement>('[data-caption-active-box="joined"]'));
          const index = Math.min(Math.floor(frame / 5), layers.length - 1);
          const path = layers[index]!.querySelector<SVGPathElement>('path')!;
          const missing: string[] = [];
          for (const word of Array.from(document.querySelectorAll<HTMLElement>('[data-fine-box-word]'))) {
            const match = /^joined-group-(\d+)-word-(\d+)$/u.exec(word.getAttribute("data-hypit-element-id")!)!;
            if (Number(match[1]) > index) continue;
            // The local mirror has identical base layout. Offset rectangles are untransformed;
            // use browser Range fragments before applying Cue motion for coverage checks.
            cue.style.transform = "none";
            const range = document.createRange(); range.selectNodeContents(word);
            for (const rect of Array.from(range.getClientRects())) {
              const point = new DOMPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2)
                .matrixTransform(path.getScreenCTM()!.inverse());
              if (!path.isPointInFill(point)) missing.push(word.getAttribute("data-hypit-element-id")!);
            }
            cue.style.transform = `rotate(12deg) scale(${scale})`;
          }
          return { error, missing, path: path.getAttribute("d"), count: layers.filter(layer => Number(getComputedStyle(layer).opacity) > 0).length };
        }, { frame, scale, size });
        assert.equal(coverage.error, undefined);
        assert.deepEqual(coverage.missing, [], JSON.stringify({ source, frame, scale, size }));
        assert.ok(coverage.path);
        assert.equal(coverage.count, 1);
      }
    }
    await page.setContent(cueHtml("supercalifragilisticexpialidocious", 170, {
      "active-box-padding": "12 8", "active-box-border-width": 2, "active-box-border-color": "#000000",
    }));
    const samples = await page.evaluate(async () => {
      const word = document.querySelector('[data-hypit-element-id="atom-1-base-1"]')!;
      const range = document.createRange(); range.selectNodeContents(word);
      const lines = Array.from(range.getClientRects());
      for (const atom of Array.from(document.querySelectorAll<HTMLElement>('[data-caption-atom]'))) atom.style.visibility = "hidden";
      await (window as typeof window & {
        __hypitFrameProgram: { applyFrame(frame: number): Promise<void> };
      }).__hypitFrameProgram.applyFrame(30);
      return {
        count: lines.length,
        points: lines.map(line => ({ x: (line.left + line.right) / 2, y: (line.top + line.bottom) / 2 })).concat(
          lines.slice(1).map((line, i) => ({ x: (Math.max(line.left, lines[i]!.left) + Math.min(line.right, lines[i]!.right)) / 2,
            y: (lines[i]!.bottom + line.top) / 2 }))),
      };
    });
    assert.ok(samples.count > 1, "The fixture must actually wrap within one word");
    const { data, info } = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const point of samples.points) {
      const offset = (Math.floor(point.y) * info.width + Math.floor(point.x)) * info.channels;
      assert.deepEqual([...data.subarray(offset, offset + 3)], [127, 191, 127], `background at ${JSON.stringify(point)}`);
    }
  });
});
