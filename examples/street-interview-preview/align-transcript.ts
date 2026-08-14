/**
 * Turn the recorded transcript into a measured timeline for this Source.
 *
 * The footage in `docs/public/street-interview/` ships with a word-level
 * transcript, but a transcript is not a SemanticMap: a map is keyed by *this*
 * Script's own anchor identities, and pairing loose words with authored tokens
 * is the aligner's job, not a rename. So this runs the real aligner —
 * `locateSpeechTiming` — over evidence built from the transcript, and writes the
 * two values a Run Source can then satisfy `timing.map` and `speech.space` with.
 *
 *   node --import tsx examples/street-interview-preview/align-transcript.ts
 *
 * Doing it here rather than in the Playground is deliberate. The preview reads;
 * deriving a new value from evidence is authoring, and it belongs next to the
 * Source whose words it is about.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseScript } from "@narratage/script";
import type { AlignedTranscriptEvidence, AlignedTranscriptSegment } from "@narratage/speech-evidence";
import { locateSpeechTiming } from "@narratage/speech-alignment";
import type { SpeechAudioBasis } from "@narratage/speech";
import { programSpaceFrameCount, sealProgramSpace } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");
const FRAME_RATE = { numerator: 24, denominator: 1 } as const;

/** Scene files in Script order. Each one is a Segment's worth of speech. */
const SCENES = [
  { segmentId: "hook", file: "scene-1.mp4" },
  { segmentId: "price", file: "scene-2.mp4" },
  { segmentId: "rainbow", file: "scene-3.mp4" },
  { segmentId: "payment", file: "scene-4.mp4" },
] as const;

type Word = { readonly text: string; readonly start: number; readonly end: number };

function sceneDuration(file: string): number {
  // Probing keeps the split honest: the boundary between two Segments is where
  // one recording ends, not where a hand-written constant says it does.
  const raw = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
    join(repoRoot, "docs/public/street-interview", file),
  ], { encoding: "utf8" });
  return Number(raw.trim());
}

function scriptBody(source: string): { readonly text: string; readonly offset: number } {
  const open = source.indexOf(">", source.indexOf("<script"));
  const close = source.indexOf("</script>");
  if (open < 0 || close < 0) throw new Error("main.svml has no <script> body.");
  return { text: source.slice(open + 1, close), offset: open + 1 };
}

const source = readFileSync(join(here, "main.svml"), "utf8");
const body = scriptBody(source);
const narrative = parseScript("main.svml", body.text, body.offset);

const transcript = JSON.parse(
  readFileSync(join(repoRoot, "docs/public/street-interview/transcript.json"), "utf8"),
) as readonly Word[];

// The programme is the four recordings back to back, so a Segment's window is
// its own scene's window on that timeline.
const bounds: { segmentId: string; startSec: number; endSec: number }[] = [];
let elapsed = 0;
for (const scene of SCENES) {
  const startSec = elapsed;
  elapsed += sceneDuration(scene.file);
  bounds.push({ segmentId: scene.segmentId, startSec, endSec: elapsed });
}

// A ProgramSpace must end on an exact frame boundary, so the programme is as
// long as the whole frames its recordings occupy.
const frameCount = Math.ceil(elapsed * FRAME_RATE.numerator / FRAME_RATE.denominator);
const space: ProgramSpace = sealProgramSpace({
  contract: "svml.program-space@1",
  durationSec: frameCount * FRAME_RATE.denominator / FRAME_RATE.numerator,
  frameRate: { ...FRAME_RATE },
});
if (programSpaceFrameCount(space) !== frameCount) throw new Error("ProgramSpace does not round-trip.");
bounds[bounds.length - 1] = { ...bounds.at(-1)!, endSec: space.durationSec };

const segments: AlignedTranscriptSegment[] = bounds.map((segment) => ({
  sourceSegmentId: segment.segmentId,
  startSec: segment.startSec,
  endSec: segment.endSec,
  words: transcript
    .filter((word) => word.start >= segment.startSec && word.start < segment.endSec)
    .map((word) => ({
      text: word.text,
      startSec: word.start,
      endSec: Math.min(word.end, segment.endSec),
    })),
  // WhisperX can emit character alignment; this transcript carries none, and
  // the aligner treats its absence as "no finer evidence" rather than an error.
  chars: [],
}));

const evidence: AlignedTranscriptEvidence = {
  contract: "svml.aligned-transcript-evidence@1",
  durationSec: space.durationSec,
  segments,
};

/**
 * The audio this transcript describes is inside the scene files rather than
 * beside them, so the basis names it by a digest over what is actually known
 * about it. The aligner reads the digest for identity only; it never fetches
 * the bytes.
 */
const basis: SpeechAudioBasis = {
  contract: "svml.speech-audio-basis@1",
  programSpace: space,
  audio: {
    kind: "blob",
    digest: `sha256:${createHash("sha256")
      .update(`street-interview ${SCENES.map((scene) => scene.file).join(" ")} ${space.durationSec}`)
      .digest("hex")}`,
    size: 0,
    mediaType: "audio/wav",
  },
  segments: bounds.map(({ segmentId, startSec, endSec }) => ({ segmentId, startSec, endSec })),
};

const map = locateSpeechTiming(narrative, basis, evidence);

writeFileSync(join(here, "timing.json"), `${JSON.stringify(map, null, 2)}\n`, "utf8");
writeFileSync(join(here, "space.json"), `${JSON.stringify(space, null, 2)}\n`, "utf8");

const words = segments.reduce((sum, segment) => sum + segment.words.length, 0);
process.stdout.write(
  `Aligned ${words} transcript words onto ${narrative.tokens.length} Script tokens.\n`
  + `${map.anchors.length} anchors across ${frameCount} frames (${space.durationSec.toFixed(3)}s).\n`
  + "Wrote timing.json and space.json.\n",
);
