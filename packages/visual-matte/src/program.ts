import { sealVisualProcessEffect } from "@hypit/composition";
import type { VisualProcessEffect } from "@hypit/composition";
import { htmlVisual } from "@hypit/html-program";

export type VisualMatteChannel = "alpha" | "luminance";

/**
 * Build one two-input Picture process. Content and matte remain independent, already-formed
 * Pictures; this programme only applies the selected matte interpretation.
 */
export function visualMatteEffect(
  channel: VisualMatteChannel = "alpha",
  invert = false,
): VisualProcessEffect {
  if (channel !== "alpha" && channel !== "luminance") {
    throw new Error(`Visual Matte channel ${String(channel)} is invalid.`);
  }
  if (typeof invert !== "boolean") throw new Error("Visual Matte invert must be boolean.");
  const program = htmlVisual({
    html: `<div data-hypit-matte-inputs style="display:none">{{content}}{{matte}}</div><canvas data-hypit-matte-canvas style="position:absolute;inset:0;width:100%;height:100%"></canvas>`,
    css: ":scope { position:absolute; inset:0; overflow:hidden; isolation:isolate; }",
    setup: `const canvas = root.querySelector('[data-hypit-matte-canvas]');
const content = root.querySelector('[data-hypit-process-input="content"] [data-hypit-process-raster-key]');
const matte = root.querySelector('[data-hypit-process-input="matte"] [data-hypit-process-raster-key]');
if (!(canvas instanceof HTMLCanvasElement) || !(content instanceof HTMLImageElement) || !(matte instanceof HTMLImageElement)) throw new Error('Visual Matte structure is incomplete.');
const width = context.width;
const height = context.height;
if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) throw new Error('Visual Matte requires a non-empty Picture extent.');
canvas.width = width;
canvas.height = height;
const output = canvas.getContext('2d');
const signal = document.createElement('canvas');
signal.width = width;
signal.height = height;
const signalContext = signal.getContext('2d', { willReadFrequently: ${channel === "luminance" ? "true" : "false"} });
if (output === null || signalContext === null) throw new Error('Visual Matte canvas is unavailable.');
return () => {
  if (!content.complete || content.naturalWidth === 0 || !matte.complete || matte.naturalWidth === 0) return;
  output.clearRect(0, 0, width, height);
  output.globalCompositeOperation = 'source-over';
  output.drawImage(content, 0, 0, width, height);
  ${channel === "luminance" ? `signalContext.clearRect(0, 0, width, height);
  signalContext.drawImage(matte, 0, 0, width, height);
  const pixels = signalContext.getImageData(0, 0, width, height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const alpha = pixels.data[index + 3] / 255;
    const luminance = alpha * (0.2126 * pixels.data[index] + 0.7152 * pixels.data[index + 1] + 0.0722 * pixels.data[index + 2]);
    pixels.data[index] = 255;
    pixels.data[index + 1] = 255;
    pixels.data[index + 2] = 255;
    pixels.data[index + 3] = ${invert ? "255 - luminance" : "luminance"};
  }
  signalContext.putImageData(pixels, 0, 0);` : ""}
  output.globalCompositeOperation = '${invert && channel === "alpha" ? "destination-out" : "destination-in"}';
  output.drawImage(${channel === "luminance" ? "signal" : "matte"}, 0, 0, width, height);
  output.globalCompositeOperation = 'source-over';
};`,
    data: { channel, invert },
  });
  return sealVisualProcessEffect({ inputs: ["content", "matte"], program });
}
