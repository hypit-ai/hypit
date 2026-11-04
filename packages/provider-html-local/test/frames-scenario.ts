import { compileHtmlPictureProgram } from "@hypit/html-program";

export function htmlFrameFixture() {
  return compileHtmlPictureProgram({
    id: "frames",
    frameRate: { numerator: 12, denominator: 1 },
    frameCount: 12,
    canvas: { width: 96, height: 64, clearColor: "#000000" },
    root: { id: "frames-root", kind: "box", spans: [{ startFrame: 0, endFrameExclusive: 12 }],
      style: [], children: Array.from({ length: 9 }, (_, index) => {
        const frame = index + 3;
        return {
          id: `box-${frame}`,
          kind: "box" as const,
          spans: [{ startFrame: frame, endFrameExclusive: frame + 1 }],
          style: [
            { name: "position", value: "absolute" },
            { name: "left", value: `${(frame - 3) * 8}px` },
            { name: "top", value: 0 },
            { name: "width", value: "8px" },
            { name: "height", value: "64px" },
            { name: "background", value: "#ff0000" },
          ],
          children: [],
        };
      }) },
  });
}
