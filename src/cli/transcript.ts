import { resolve } from "node:path";
import { alignTranscript, assertTimedTranscript, encodeTimedTranscript } from "@hypit/timed-transcript";
import { readJsonInput, writeNewFile, type CliResult } from "./io.js";

export async function transcriptAlignCommand(
  input: string | undefined, wordFile: string | undefined, start: string | undefined, end: string | undefined,
  destination: string | undefined, signal: AbortSignal,
): Promise<CliResult> {
  if (!input || !wordFile || !end?.trim() || !destination) {
    throw new Error("transcript align requires a transcript, --words, --end and --to.");
  }
  if (input === "-" && wordFile === "-") throw new Error("Choose a file for either the transcript or --words.");
  if (start?.trim() === "") throw new Error("--start requires a time in seconds.");
  const [transcript, words] = await Promise.all([readJsonInput(input), readJsonInput(wordFile)]);
  assertTimedTranscript(transcript);
  if (!Array.isArray(words)) throw new Error("--words must contain a JSON array of authored words.");

  const window = { start: Number(start ?? 0), end: Number(end) };
  const aligned = alignTranscript({ transcript, words, window });
  const path = resolve(destination);
  await writeNewFile(path, [Buffer.from(encodeTimedTranscript(aligned.transcript))], signal);
  const wordCount = aligned.transcript.words.length;
  const estimated = aligned.timingSources.filter(source => source === "estimated").length;
  const distributed = aligned.timingSources.filter(source => source === "distributed").length;
  return { value: { path, wordCount, timingSources: aligned.timingSources },
    text: `Wrote ${wordCount} words to ${path} (${estimated} estimated, ${distributed} distributed).` };
}
