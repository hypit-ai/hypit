import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

import { findRuntimeProfile } from "@hypit/cli";
import type { CliIo } from "@hypit/cli";
import { MemoryResourceStore } from "@hypit/driver-node";
import { geminiCapabilities, geminiModels, sealGeminiRequest } from "@hypit/gemini";
import type { GeminiMediaPart, GeminiModel } from "@hypit/gemini";
import { verifyGeneratedAudioSet } from "@hypit/generation";
import type { GeneratedAudioSet } from "@hypit/generation";
import { mimoTtsEndpoints, sealMimoTtsRequest } from "@hypit/mimo-tts";
import type { CanonicalValue, CapabilityRef, Need, StoredValue } from "@hypit/protocol";
import type { ResourceStore } from "@hypit/runtime";
import type { RuntimeHostCapabilityProvider } from "@hypit/runtime-host-node";
import { sealSpeechEvidenceAudio } from "@hypit/speech";
import { speechEvidenceTypes } from "@hypit/speech-evidence";
import type { AlignedTranscriptEvidence } from "@hypit/speech-evidence";
import { textTypes } from "@hypit/text";
import { whisperXCapabilities, whisperXRequestForEvidenceAudio } from "@hypit/whisperx";
import type { WhisperXLanguage } from "@hypit/whisperx";

import { videoCliDistribution } from "./distribution.js";

/**
 * Creation-time tools: see a picture, hear a recording, speak a line.
 *
 * Each is one immediate Need executed through the selected Runtime Profile, exactly as a Build would
 * resolve it — same Endpoint, same credential, same Provider — without a Build, Result or state. The
 * command names the Endpoint and its price page before it spends anything, writes one file the caller
 * chose, and nothing else. Slow paid generation (pictures, clips) is not here: it is a Build.
 */

export const creationCommands = ["observe", "transcribe", "speak"] as const;
export type CreationCommand = typeof creationCommands[number];

/** The slice of the Runtime host these commands use; tests hand in a fake. */
export type CreationHost = {
  providers(capabilities: readonly CapabilityRef[]): Promise<readonly RuntimeHostCapabilityProvider[]>;
  invoke(need: Need, resources: ResourceStore): Promise<{ readonly value: StoredValue }>;
};

export type CreationEnvironment = {
  /** Open the host behind `--runtime`, or behind the project's own selection when none is named. */
  readonly openHost: (runtime: string | undefined) => Promise<{ readonly profile: string; readonly host: CreationHost }>;
  readonly cwd: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function isCreationCommand(value: string | undefined): value is CreationCommand {
  return (creationCommands as readonly string[]).includes(value ?? "");
}

async function nearestPackageRoot(start: string): Promise<string> {
  let directory = resolve(start);
  while (true) {
    const manifest = resolve(directory, "package.json");
    if (await stat(manifest).then((item) => item.isFile(), () => false)) return directory;
    const parent = dirname(directory);
    if (parent === directory) return resolve(start);
    directory = parent;
  }
}

/** The default environment: the project's Profile, opened through this Distribution's Runtime. */
export function creationEnvironment(cwd = process.cwd()): CreationEnvironment {
  return {
    cwd,
    openHost: async (runtime) => {
      let profile: string;
      if (runtime !== undefined) {
        profile = resolve(cwd, runtime);
      } else {
        const projectRoot = await nearestPackageRoot(cwd);
        const selected = await findRuntimeProfile(projectRoot);
        assert(selected !== undefined,
          `No Runtime Profile is selected for ${projectRoot}; run hypit runtime use <profile> there, or pass --runtime <profile>`);
        profile = selected.profile;
      }
      const host = await videoCliDistribution.openRuntimeHost(profile, {
        packageRoot: await nearestPackageRoot(dirname(profile)),
        ...(videoCliDistribution.packageRoot === undefined ? {} : { distributionPackageRoot: videoCliDistribution.packageRoot }),
      });
      return { profile, host };
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Arguments

type Parsed = {
  readonly positionals: readonly string[];
  readonly options: ReadonlyMap<string, string>;
  readonly json: boolean;
};

function parseArguments(argv: readonly string[], allowed: readonly string[]): Parsed {
  const positionals: string[] = [];
  const options = new Map<string, string>();
  let json = false;
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (item === "--json") { json = true; continue; }
    if (item === "--debug" || item === "--verbose" || item === "--no-color") continue;
    if (item === "--color") { index += 1; continue; }
    if (!item.startsWith("--")) { positionals.push(item); continue; }
    if (!allowed.includes(item)) throw new Error(`unknown option ${item}`);
    if (options.has(item)) throw new Error(`${item} cannot be repeated`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${item} requires a value`);
    options.set(item, value);
    index += 1;
  }
  return { positionals, options, json };
}

function required(parsed: Parsed, option: string, hint: string): string {
  const value = parsed.options.get(option);
  if (value === undefined) throw new Error(`${option} is required: ${hint}`);
  return value;
}

/** An option that takes prose: the text itself, or the path of a file holding it. */
async function textOrFile(value: string, option: string, cwd: string): Promise<string> {
  const path = resolve(cwd, value);
  const isFile = await stat(path).then((item) => item.isFile(), () => false);
  const text = (isFile ? await readFile(path, "utf8") : value).trim();
  if (text.length === 0) throw new Error(isFile ? `${option} file ${path} is empty` : `${option} is empty`);
  return text;
}

async function destination(parsed: Parsed, cwd: string): Promise<string> {
  const to = resolve(cwd, required(parsed, "--to", "the file to write"));
  if (await stat(to).then(() => true, () => false)) throw new Error(`Destination ${to} already exists`);
  return to;
}

async function writeNew(path: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, content, { flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error(`Destination ${path} already exists`);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------
// Provider and price page

function capabilityName(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

/** Which Endpoint will serve this call and where its Provider publishes prices, before spending. */
async function selectedProvider(host: CreationHost, capability: CapabilityRef, profile: string): Promise<RuntimeHostCapabilityProvider> {
  const [provider] = await host.providers([capability]);
  const subject = capabilityName(capability);
  assert(provider !== undefined && provider.status !== "unresolved",
    `No Endpoint in ${profile} serves ${subject}; hypit plan --runtime ${profile} shows which Endpoint each capability needs`);
  assert(provider.status !== "ambiguous",
    `Several Endpoints in ${profile} serve ${subject}: ${(provider.endpoints ?? []).join(", ")}; keep exactly one`);
  return provider;
}

function priceLine(provider: RuntimeHostCapabilityProvider): string {
  return provider.pricing === undefined
    ? "price source unknown"
    : provider.pricing.kind === "local" ? "local, no Provider charge" : provider.pricing.url;
}

function providerView(provider: RuntimeHostCapabilityProvider) {
  return {
    endpoint: provider.endpoint ?? null,
    use: provider.use ?? null,
    pricing: provider.pricing ?? null,
  };
}

function providerLine(provider: RuntimeHostCapabilityProvider): string {
  return `${provider.endpoint} (${provider.use})  ·  ${priceLine(provider)}`;
}

// ---------------------------------------------------------------------------------------------------
// Media

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
};

function mediaType(path: string): string {
  const type = MEDIA_TYPES[extname(path).toLowerCase()];
  assert(type !== undefined, `${path} has no media type this command knows; supported: ${Object.keys(MEDIA_TYPES).join(", ")}`);
  return type;
}

function run(executable: string, args: readonly string[]): Promise<string> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => reject(new Error(`${executable} could not start: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolveRun(Buffer.concat(out).toString("utf8"));
      else reject(new Error(`${executable} exited with ${code}: ${Buffer.concat(err).toString("utf8").trim()}`));
    });
  });
}

const EVIDENCE_SAMPLE_RATE = 16_000;

type WavShape = { readonly sampleRate: number; readonly channels: number; readonly bits: number; readonly codec: number; readonly dataBytes: number };

/** Read a RIFF WAV header; undefined when the bytes are not a WAV file. */
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
      format = { codec: view.getUint16(body, true), channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
    } else if (name === "data") {
      dataBytes = size;
    }
    offset = body + size + (size % 2);
  }
  return format === undefined || dataBytes === undefined ? undefined : { ...format, dataBytes };
}

function canonicalEvidence(shape: WavShape | undefined): shape is WavShape {
  return shape !== undefined && shape.codec === 1 && shape.channels === 1 && shape.sampleRate === EVIDENCE_SAMPLE_RATE && shape.bits === 16;
}

/** The 16 kHz mono PCM WAV WhisperX measures; extracted with ffmpeg unless the file already is one. */
async function speechEvidenceBytes(path: string): Promise<{ readonly bytes: Uint8Array; readonly sampleFrames: number; readonly extracted: boolean }> {
  const original = new Uint8Array(await readFile(path));
  const shape = wavShape(original);
  if (canonicalEvidence(shape)) return { bytes: original, sampleFrames: shape.dataBytes / 2, extracted: false };
  const scratch = await mkdtemp(join(tmpdir(), "hypit-transcribe-"));
  try {
    const target = join(scratch, "speech.wav");
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", String(EVIDENCE_SAMPLE_RATE), "-c:a", "pcm_s16le", "-bitexact", target]);
    const bytes = new Uint8Array(await readFile(target));
    const extracted = wavShape(bytes);
    assert(canonicalEvidence(extracted), "ffmpeg did not produce 16 kHz mono PCM audio");
    return { bytes, sampleFrames: extracted.dataBytes / 2, extracted: true };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** Seconds of audio in a file: read from a WAV header, otherwise asked of ffprobe when it is present. */
async function audioSeconds(path: string, bytes: Uint8Array): Promise<number | undefined> {
  const shape = wavShape(bytes);
  if (shape !== undefined && shape.codec === 1 && shape.channels > 0 && shape.sampleRate > 0 && shape.bits > 0) {
    return round(shape.dataBytes / (shape.channels * (shape.bits / 8)) / shape.sampleRate);
  }
  try {
    const seconds = Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])).trim());
    return Number.isFinite(seconds) && seconds > 0 ? round(seconds) : undefined;
  } catch {
    return undefined;
  }
}

function round(value: number): number { return Number(value.toFixed(3)); }
function seconds(sample: number | undefined): number | undefined {
  return sample === undefined ? undefined : round(sample / EVIDENCE_SAMPLE_RATE);
}

// ---------------------------------------------------------------------------------------------------
// observe

async function observe(argv: readonly string[], io: CliIo, environment: CreationEnvironment): Promise<void> {
  const parsed = parseArguments(argv, ["--instruction", "--prompt", "--model", "--to", "--runtime"]);
  assert(parsed.positionals.length > 0, "observe requires at least one media file to look at");
  const modelName = parsed.options.get("--model") ?? geminiModels[0];
  assert((geminiModels as readonly string[]).includes(modelName),
    `Gemini model ${modelName} is not declared by @hypit/gemini; declared models: ${geminiModels.join(", ")}`);
  const model = modelName as GeminiModel;
  const instruction = await textOrFile(required(parsed, "--instruction", "who the observer is and what it returns"), "--instruction", environment.cwd);
  const prompt = await textOrFile(required(parsed, "--prompt", "the question to answer about the media"), "--prompt", environment.cwd);
  const to = await destination(parsed, environment.cwd);
  const { profile, host } = await environment.openHost(parsed.options.get("--runtime"));
  const capability = geminiCapabilities[model];
  const provider = await selectedProvider(host, capability, profile);
  if (!parsed.json) io.write(`Observing with ${model} through ${providerLine(provider)}\n`);
  const resources = new MemoryResourceStore();
  const media: GeminiMediaPart[] = [];
  for (const item of parsed.positionals) {
    const path = resolve(environment.cwd, item);
    media.push({ artifact: await resources.put(new Uint8Array(await readFile(path)), mediaType(path)) });
  }
  const need: Need = {
    id: "need:hypit-observe",
    capability,
    returns: textTypes.text,
    constraints: sealGeminiRequest({ instruction, prompt, media }) as unknown as CanonicalValue,
    result: "record:hypit-observe",
  };
  const fulfillment = await host.invoke(need, resources);
  assert(fulfillment.value.kind === "inline", "the observation came back by reference");
  const text = (fulfillment.value.value as { readonly value?: unknown } | null)?.value;
  assert(typeof text === "string", "the observation is not Text");
  await writeNew(to, `${text}\n`);
  const view = {
    format: "hypit.video-cli-observe@1",
    model,
    media: parsed.positionals.map((item) => resolve(environment.cwd, item)),
    ...providerView(provider),
    characters: text.length,
    path: to,
  };
  if (parsed.json) io.write(`${JSON.stringify(view, null, 2)}\n`);
  else io.write(`✓ Observation written\n\n  ${text.length} characters\n  ${to}\n`);
}

// ---------------------------------------------------------------------------------------------------
// transcribe

type TranscriptWord = { readonly text: string; readonly start_seconds?: number; readonly end_seconds?: number; readonly score?: number };
type TranscriptPassage = { readonly text: string; readonly start_seconds?: number; readonly end_seconds?: number; readonly words: readonly TranscriptWord[] };

function passagesInSeconds(aligned: AlignedTranscriptEvidence): readonly TranscriptPassage[] {
  return aligned.passages.map((passage) => {
    const words = passage.words.map((word): TranscriptWord => {
      const start = seconds(word.startSample);
      const end = seconds(word.endSampleExclusive);
      return {
        text: word.text,
        ...(start === undefined ? {} : { start_seconds: start }),
        ...(end === undefined ? {} : { end_seconds: end }),
        ...(word.score === undefined ? {} : { score: word.score }),
      };
    });
    const start = seconds(passage.startSample);
    const end = seconds(passage.endSampleExclusive);
    return {
      text: words.map((word) => word.text).join(" "),
      ...(start === undefined ? {} : { start_seconds: start }),
      ...(end === undefined ? {} : { end_seconds: end }),
      words,
    };
  });
}

async function transcribe(argv: readonly string[], io: CliIo, environment: CreationEnvironment): Promise<void> {
  const parsed = parseArguments(argv, ["--language", "--to", "--runtime"]);
  assert(parsed.positionals.length === 1, "transcribe takes exactly one audio or video file");
  const source = resolve(environment.cwd, parsed.positionals[0]!);
  const language = parsed.options.get("--language") ?? "en";
  assert(language === "en" || language === "zh" || language === "es", "--language must be en, zh or es");
  const to = await destination(parsed, environment.cwd);
  const { profile, host } = await environment.openHost(parsed.options.get("--runtime"));
  const provider = await selectedProvider(host, whisperXCapabilities.alignment, profile);
  if (!parsed.json) io.write(`Transcribing through ${providerLine(provider)}\n`);
  const evidence = await speechEvidenceBytes(source);
  const resources = new MemoryResourceStore();
  const artifact = await resources.put(evidence.bytes, "audio/wav");
  const audio = sealSpeechEvidenceAudio({ artifact, sampleFrames: evidence.sampleFrames });
  const need: Need = {
    id: "need:hypit-transcribe",
    capability: whisperXCapabilities.alignment,
    returns: speechEvidenceTypes.alignedTranscript,
    constraints: whisperXRequestForEvidenceAudio(audio, { language: language as WhisperXLanguage }),
    result: "record:hypit-transcribe",
  };
  const fulfillment = await host.invoke(need, resources);
  assert(fulfillment.value.kind === "inline", "the transcript came back by reference");
  const passages = passagesInSeconds(fulfillment.value.value as unknown as AlignedTranscriptEvidence);
  const words = passages.reduce((total, passage) => total + passage.words.length, 0);
  const file = {
    format: "hypit.transcript@1",
    source,
    language,
    audio_seconds: round(evidence.sampleFrames / EVIDENCE_SAMPLE_RATE),
    passages,
  };
  await writeNew(to, `${JSON.stringify(file, null, 2)}\n`);
  const view = {
    format: "hypit.video-cli-transcribe@1",
    source,
    language,
    audio_seconds: file.audio_seconds,
    extracted: evidence.extracted,
    ...providerView(provider),
    passages: passages.length,
    words,
    path: to,
  };
  if (parsed.json) io.write(`${JSON.stringify(view, null, 2)}\n`);
  else io.write(`✓ Transcript written\n\n  ${words} words in ${passages.length} passage${passages.length === 1 ? "" : "s"} over ${file.audio_seconds}s\n  ${to}\n`);
}

// ---------------------------------------------------------------------------------------------------
// speak

async function speak(argv: readonly string[], io: CliIo, environment: CreationEnvironment): Promise<void> {
  const parsed = parseArguments(argv, ["--text", "--voice", "--to", "--runtime"]);
  assert(parsed.positionals.length === 0, `speak takes no positional arguments; received ${parsed.positionals.join(" ")}`);
  const text = await textOrFile(required(parsed, "--text", "the words to speak, or a file holding them"), "--text", environment.cwd);
  const voice = await textOrFile(required(parsed, "--voice", "a description of the voice, or a file holding it"), "--voice", environment.cwd);
  const to = await destination(parsed, environment.cwd);
  const endpoint = mimoTtsEndpoints.voiceDesign;
  assert(endpoint !== undefined, "@hypit/mimo-tts declares no voice-design endpoint");
  const { profile, host } = await environment.openHost(parsed.options.get("--runtime"));
  const provider = await selectedProvider(host, endpoint.capability, profile);
  if (!parsed.json) io.write(`Speaking with ${endpoint.ports.model} through ${providerLine(provider)}\n`);
  const resources = new MemoryResourceStore();
  const need: Need = {
    id: "need:hypit-speak",
    capability: endpoint.capability,
    returns: endpoint.returns,
    constraints: sealMimoTtsRequest("mimo-v2.5-tts-voicedesign", { text: [text], voiceDescription: [voice] }) as unknown as CanonicalValue,
    result: "record:hypit-speak",
  };
  const fulfillment = await host.invoke(need, resources);
  assert(fulfillment.value.kind === "inline", "the speech came back by reference");
  verifyGeneratedAudioSet(fulfillment.value.value);
  const [audio] = (fulfillment.value.value as unknown as GeneratedAudioSet).audios;
  assert(audio !== undefined, "the model returned no audio");
  const bytes = await resources.get(audio.resource);
  assert(bytes !== undefined, `generated audio ${audio.resource} was not stored`);
  await writeNew(to, bytes);
  const durationSeconds = await audioSeconds(to, bytes);
  const view = {
    format: "hypit.video-cli-speak@1",
    model: endpoint.ports.model,
    ...providerView(provider),
    mediaType: audio.mediaType,
    bytes: bytes.byteLength,
    ...(durationSeconds === undefined ? {} : { duration_seconds: durationSeconds }),
    path: to,
  };
  if (parsed.json) io.write(`${JSON.stringify(view, null, 2)}\n`);
  else {
    io.write(`✓ Speech written\n\n  ${audio.mediaType} · ${bytes.byteLength} bytes${durationSeconds === undefined ? "" : ` · ${durationSeconds}s`}\n  ${to}\n`);
    if (durationSeconds === undefined) io.write("  (duration unknown: ffprobe is unavailable; measure the file before writing a literal)\n");
  }
}

// ---------------------------------------------------------------------------------------------------
// Entry

export function writeCreationHelp(io: CliIo, topic?: CreationCommand): void {
  const sections: Record<CreationCommand, readonly string[]> = {
    observe: [
      "hypit observe",
      "Look at pictures, clips or recordings with the Gemini Endpoint of the selected Runtime Profile.",
      "",
      "  hypit observe <media…> --instruction <text|file> --prompt <text|file> --to <file>",
      "                [--model <gemini model>] [--runtime <profile>]",
      "",
      "Writes the observation as text to --to. One immediate request; no Build, Result or state.",
    ],
    transcribe: [
      "hypit transcribe",
      "Hear a recording with the whisperx-alignment Endpoint of the selected Runtime Profile.",
      "",
      "  hypit transcribe <audio|video> --to <transcript.json> [--language en|zh|es] [--runtime <profile>]",
      "",
      "Extracts 16 kHz mono speech audio with ffmpeg and writes every word with its start and end in",
      "seconds. One immediate request; no Build, Result or state.",
    ],
    speak: [
      "hypit speak",
      "Speak a line with the MiMo VoiceDesign Endpoint of the selected Runtime Profile.",
      "",
      "  hypit speak --text <text|file> --voice <description|file> --to <audio file> [--runtime <profile>]",
      "",
      "Writes the audio and reports its duration, so the author can write that duration as a literal.",
      "For a voice-over video this is the A-roll: speak first, measure, then author B-roll that covers",
      "every passage. Where a real presenter is the A-roll, do not replace them with this.",
    ],
  };
  const chosen = topic === undefined ? creationCommands : [topic];
  io.write(`${chosen.map((item) => sections[item].join("\n")).join("\n\n")}\n\n`
    + "Each command names the Endpoint and its price page before it runs; the Profile comes from --runtime\n"
    + "or the project's `hypit runtime use` selection.\n");
}

export async function runCreationCli(argv: readonly string[], io: CliIo, environment: CreationEnvironment = creationEnvironment()): Promise<void> {
  const command = argv[0];
  assert(isCreationCommand(command), `unknown creation command ${command}`);
  if (argv.includes("--help")) { writeCreationHelp(io, command); return; }
  if (command === "observe") await observe(argv, io, environment);
  else if (command === "transcribe") await transcribe(argv, io, environment);
  else await speak(argv, io, environment);
}
