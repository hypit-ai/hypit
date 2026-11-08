import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runProcess } from "@hypit/media-local/process";

const EVIDENCE_SAMPLE_RATE = 16_000;

type WavShape = {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bits: number;
  readonly codec: number;
  readonly dataBytes: number;
};

function wavShape(bytes: Uint8Array): WavShape | undefined {
  const fourCc = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.byteLength < 44 || fourCc(0) !== "RIFF" || fourCc(8) !== "WAVE") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let format: Omit<WavShape, "dataBytes"> | undefined;
  let dataBytes: number | undefined;
  while (offset + 8 <= bytes.byteLength) {
    const name = fourCc(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (body + size > bytes.byteLength) return undefined;
    if (name === "fmt " && size >= 16) {
      format = { codec: view.getUint16(body, true), channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
    } else if (name === "data") dataBytes = size;
    offset = body + size + (size % 2);
  }
  return format === undefined || dataBytes === undefined ? undefined : { ...format, dataBytes };
}

function canonicalEvidence(shape: WavShape | undefined): shape is WavShape {
  return shape !== undefined && shape.codec === 1 && shape.channels === 1
    && shape.sampleRate === EVIDENCE_SAMPLE_RATE && shape.bits === 16;
}

/** Project one named local media file into WhisperX's canonical 16 kHz mono PCM evidence. */
export async function speechEvidenceFile(path: string): Promise<{
  readonly bytes: Uint8Array;
  readonly sampleFrames: number;
  readonly extracted: boolean;
}> {
  const original = new Uint8Array(await readFile(path));
  const shape = wavShape(original);
  if (canonicalEvidence(shape)) return { bytes: original, sampleFrames: shape.dataBytes / 2, extracted: false };
  const scratch = await mkdtemp(join(tmpdir(), "hypit-speech-evidence-"));
  try {
    const target = join(scratch, "speech.wav");
    await runProcess("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path,
      "-map", "0:a:0", "-vn", "-ac", "1", "-ar", String(EVIDENCE_SAMPLE_RATE),
      "-c:a", "pcm_s16le", "-bitexact", target]);
    const bytes = new Uint8Array(await readFile(target));
    const extracted = wavShape(bytes);
    if (!canonicalEvidence(extracted)) throw new Error("ffmpeg did not produce 16 kHz mono PCM audio");
    return { bytes, sampleFrames: extracted.dataBytes / 2, extracted: true };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
