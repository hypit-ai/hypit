import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  cliEndpointLine,
  cliEndpointView,
  createCliScratchResources,
  openCliRuntimeHost,
  selectCliEndpoint,
} from "@hypit/hypit/cli";
import type { CliApplicationContext, CliCommandModule, CliIo, CliRuntimeHost } from "@hypit/hypit/cli";
import { speechEvidenceFile } from "@hypit/media-local/files";
import type { Need } from "@hypit/hypit/protocol";
import { sealSpeechEvidenceAudio, speechEvidenceTypes, speechTranscriptSource } from "@hypit/speech-evidence";
import type { SpeechTranscriptEvidence } from "@hypit/speech-evidence";

import { whisperXRequestForEvidenceAudio } from "./evidence.js";
import { whisperXCapabilities } from "./manifest.js";
import { parseWhisperXLanguage } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Parsed = {
  readonly positionals: readonly string[];
  readonly options: ReadonlyMap<string, string>;
  readonly json: boolean;
};

function parse(argv: readonly string[]): Parsed {
  const allowed = new Set(["--language", "--to", "--runtime", "--project"]);
  const positionals: string[] = [];
  const options = new Map<string, string>();
  let json = false;
  for (let index = 1; index < argv.length; index++) {
    const item = argv[index]!;
    if (item === "--json") { json = true; continue; }
    if (["--debug", "--verbose", "--no-color"].includes(item)) continue;
    if (item === "--color") { index += 1; continue; }
    if (!item.startsWith("--")) { positionals.push(item); continue; }
    assert(allowed.has(item), `unknown option ${item}`);
    assert(!options.has(item), `${item} cannot be repeated`);
    const value = argv[++index];
    assert(value !== undefined && !value.startsWith("--"), `${item} requires a value`);
    options.set(item, value);
  }
  return { positionals, options, json };
}

async function destination(parsed: Parsed, cwd: string): Promise<string> {
  const named = parsed.options.get("--to");
  assert(named !== undefined, "--to is required: the transcript file to write");
  const path = resolve(cwd, named);
  assert(!await stat(path).then(() => true, () => false), `Destination ${path} already exists`);
  return path;
}

async function writeNew(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  try { await writeFile(path, content, { flag: "wx" }); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error(`Destination ${path} already exists`);
    }
    throw error;
  }
}

export type TranscribeEnvironment = {
  readonly cwd: string;
  openHost(runtime: string | undefined, project: string | undefined): Promise<{
    readonly profile: string;
    readonly host: Pick<CliRuntimeHost, "endpoints" | "invoke">;
  }>;
};

export function transcribeEnvironment(application: CliApplicationContext): TranscribeEnvironment {
  return {
    cwd: application.cwd,
    openHost: async (runtime, project) => await openCliRuntimeHost(application, runtime, project),
  };
}

export function writeTranscribeHelp(io: CliIo): void {
  io.write("hypit transcribe\nCreate editable speech evidence through the WhisperX transcription Endpoint selected by the Runtime Profile.\n\n"
    + "  hypit transcribe <audio|video> --to <name.transcript.svml> --language <code> [--runtime <profile>] [--project <directory>]\n\n"
    + "The local media capability projects 16 kHz mono audio; WhisperX returns exact provider-neutral evidence.\n"
    + "This is one immediate request: no Build or Result state is created.\n");
}

export async function runTranscribeCli(
  argv: readonly string[],
  io: CliIo,
  environment: TranscribeEnvironment,
): Promise<void> {
  if (argv.includes("--help")) { writeTranscribeHelp(io); return; }
  const parsed = parse(argv);
  assert(parsed.positionals.length === 1, "transcribe takes exactly one audio or video file");
  const source = resolve(environment.cwd, parsed.positionals[0]!);
  const language = parseWhisperXLanguage(parsed.options.get("--language"), "transcribe --language");
  const to = await destination(parsed, environment.cwd);
  const { profile, host } = await environment.openHost(parsed.options.get("--runtime"), parsed.options.get("--project"));
  const evidence = await speechEvidenceFile(source);
  const resources = createCliScratchResources();
  const artifact = await resources.put(evidence.bytes, "audio/wav");
  const audio = sealSpeechEvidenceAudio({ artifact, sampleFrames: evidence.sampleFrames });
  const need: Need = {
    id: "need:hypit-transcribe",
    capability: whisperXCapabilities.transcription,
    returns: speechEvidenceTypes.transcript,
    constraints: whisperXRequestForEvidenceAudio(audio, { language }),
    result: "record:hypit-transcribe",
  };
  const endpoint = await selectCliEndpoint(host, need, profile);
  if (!parsed.json) io.write(`Transcribing through ${cliEndpointLine(endpoint)}\n`);
  const report = parsed.json ? io.writeProgress : io.writeProgress ?? io.write;
  let previousPhase: string | undefined;
  const fulfillment = await host.invoke(need, resources, {
    reportProgress: async (progress) => {
      if (progress.phase === previousPhase) return;
      previousPhase = progress.phase;
      report?.(`  · ${progress.phase}\n`);
    },
    reportDiagnostic: async (diagnostic) => { report?.(`  · ${diagnostic.message}\n`); },
  });
  const transcript = fulfillment as unknown as SpeechTranscriptEvidence;
  const words = transcript.passages.reduce((total, passage) => total + passage.words.length, 0);
  const audioSeconds = transcript.sampleFrames / 16_000;
  await writeNew(to, speechTranscriptSource("transcript", transcript));
  const view = { format: "hypit.whisperx-transcribe@1", source, language,
    audio_seconds: audioSeconds, extracted: evidence.extracted, ...cliEndpointView(endpoint),
    passages: transcript.passages.length, words, path: to };
  if (parsed.json) io.write(`${JSON.stringify(view, null, 2)}\n`);
  else io.write(`✓ Transcript written\n\n  ${words} words in ${transcript.passages.length} passage${
    transcript.passages.length === 1 ? "" : "s"} over ${audioSeconds}s\n  ${to}\n`);
}

export const cliCommandModules = [{
  format: "hypit.cli-command@1",
  id: "@hypit/whisperx",
  commands: ["transcribe"],
  writeRootHelp(io) { io.write("\nSpeech evidence\n  transcribe\n  hypit transcribe --help for inputs and Runtime selection\n"); },
  writeHelp(_argv, io) { writeTranscribeHelp(io); },
  async run(argv, io, context) { await runTranscribeCli(argv, io, transcribeEnvironment(context)); },
}] as const satisfies readonly CliCommandModule[];
