import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { CliApplicationContext, CliCommandModule, CliIo } from "@hypit/cli";
import { speechEvidenceFile } from "@hypit/media-file-local";
import { capabilityKey } from "@hypit/hypit/protocol";
import type { Need, Value } from "@hypit/hypit/protocol";
import { MemoryResourceStore } from "@hypit/resource-store";
import type { ResourceStore } from "@hypit/resource-store";
import type {
  ExecutionDiagnostic,
  OperationProgress,
  RuntimeEndpointObservation,
  RuntimeEndpointQuery,
} from "@hypit/runtime";
import { sealSpeechEvidenceAudio } from "@hypit/speech-evidence";
import { encodeTimedTranscript, timedTranscriptTypes } from "@hypit/timed-transcript";
import type { TimedTranscript } from "@hypit/timed-transcript";

import { whisperXRequestForEvidenceAudio } from "./evidence.js";
import { whisperXCapabilities } from "./manifest.js";
import { parseWhisperXLanguage } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Exact Runtime surface required by one immediate transcription request. */
export type TranscribeRuntimeHost = {
  endpoints(queries: readonly RuntimeEndpointQuery[]): Promise<readonly RuntimeEndpointObservation[]>;
  invoke(need: Need, resources: ResourceStore, observation?: {
    readonly reportProgress?: (progress: OperationProgress) => Promise<void>;
    readonly reportDiagnostic?: (diagnostic: ExecutionDiagnostic) => Promise<void>;
  }): Promise<Value>;
};

/** Application services captured by the WhisperX CLI contribution, not by the generic CLI Host. */
export type TranscribeCliServices = {
  readonly packageRoot?: string;
  resolveProjectRuntime?(projectRoot: string): Promise<{ readonly profile: string } | undefined>;
  openRuntimeHost(path: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<TranscribeRuntimeHost>;
};

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
    readonly host: TranscribeRuntimeHost;
  }>;
};

export function transcribeEnvironment(
  application: Pick<CliApplicationContext, "cwd" | "resolveProjectRoot">,
  services: TranscribeCliServices,
): TranscribeEnvironment {
  return {
    cwd: application.cwd,
    openHost: async (runtime, project) => {
      const projectRoot = await application.resolveProjectRoot(
        project === undefined ? undefined : resolve(application.cwd, project),
      );
      const profile = runtime === undefined
        ? (await services.resolveProjectRuntime?.(projectRoot))?.profile
        : resolve(application.cwd, runtime);
      assert(profile !== undefined,
        `No Runtime Profile is selected for ${projectRoot}; run hypit runtime use <profile> there, or pass --runtime <profile>`);
      const host = await services.openRuntimeHost(profile, {
        packageRoot: projectRoot,
        ...(services.packageRoot === undefined
          ? {}
          : { distributionPackageRoot: services.packageRoot }),
      });
      return { profile, host };
    },
  };
}

async function selectEndpoint(
  host: Pick<TranscribeRuntimeHost, "endpoints">,
  need: Need,
  profile: string,
): Promise<RuntimeEndpointObservation> {
  const [endpoint] = await host.endpoints([{
    kind: "concrete",
    need: need.id,
    capability: need.capability,
    returns: need.returns,
    constraints: need.constraints,
  }]);
  const subject = capabilityKey(need.capability);
  assert(endpoint !== undefined && endpoint.status !== "unresolved",
    `No Endpoint in ${profile} serves ${subject}; configure an Endpoint that supports this capability and check its binding in that Profile`);
  assert(endpoint.status !== "ambiguous",
    `Several Endpoints in ${profile} serve ${subject}: ${(endpoint.endpoints ?? []).join(", ")}; select one with bindings[${JSON.stringify(subject)}] in that Profile`);
  assert(endpoint.support !== "unsupported",
    `The selected Endpoint in ${profile} does not support this request for ${subject}`
    + (endpoint.binding === undefined ? "" : ` (binding: ${endpoint.binding})`)
    + `: ${(endpoint.rejections ?? []).map((item) => `${item.endpoint}: ${item.message}`).join("; ") || "no support reason supplied"}`
    + "; adjust the request or select a compatible Endpoint in that Profile");
  return endpoint;
}

function endpointView(endpoint: RuntimeEndpointObservation) {
  return {
    endpoint: endpoint.endpoint ?? null,
    use: endpoint.use ?? null,
    pricing: endpoint.pricing ?? null,
  };
}

function endpointLine(endpoint: RuntimeEndpointObservation): string {
  const price = endpoint.pricing === undefined
    ? "price source unknown"
    : endpoint.pricing.kind === "local" ? "local, no Provider charge" : endpoint.pricing.url;
  return `${endpoint.endpoint} (${endpoint.use})  ·  ${price}`;
}

export function writeTranscribeHelp(io: CliIo): void {
  io.write("hypit transcribe\nCreate editable speech evidence through the WhisperX transcription Endpoint selected by the Runtime Profile.\n\n"
    + "  hypit transcribe <audio|video> --to <name.transcript.json> --language <code> [--runtime <profile>] [--project <directory>]\n\n"
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
  const resources = new MemoryResourceStore();
  const artifact = await resources.put(evidence.bytes, "audio/wav");
  const audio = sealSpeechEvidenceAudio({ artifact, sampleFrames: evidence.sampleFrames });
  const need: Need = {
    id: "need:hypit-transcribe",
    capability: whisperXCapabilities.transcription,
    returns: timedTranscriptTypes.transcript,
    constraints: whisperXRequestForEvidenceAudio(audio, { language }),
    result: "record:hypit-transcribe",
  };
  const endpoint = await selectEndpoint(host, need, profile);
  if (!parsed.json) io.write(`Transcribing through ${endpointLine(endpoint)}\n`);
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
  const transcript = fulfillment as unknown as TimedTranscript;
  const words = transcript.word_segments.length;
  const audioSeconds = evidence.sampleFrames / 16_000;
  await writeNew(to, encodeTimedTranscript(transcript));
  const view = { format: "hypit.whisperx-transcribe@1", source, language,
    audio_seconds: audioSeconds, extracted: evidence.extracted, ...endpointView(endpoint),
    segments: transcript.segments.length, words, path: to };
  if (parsed.json) io.write(`${JSON.stringify(view, null, 2)}\n`);
  else io.write(`✓ Transcript written\n\n  ${words} words in ${transcript.segments.length} segment${
    transcript.segments.length === 1 ? "" : "s"} over ${audioSeconds}s\n  ${to}\n`);
}

export function createWhisperXCliCommandModules(
  services: TranscribeCliServices,
): readonly CliCommandModule[] {
  return [{
    format: "hypit.cli-command@1",
    id: "@hypit/whisperx",
    commands: ["transcribe"],
    writeRootHelp(io) { io.write("\nSpeech evidence\n  transcribe\n  hypit transcribe --help for inputs and Runtime selection\n"); },
    writeHelp(_argv, io) { writeTranscribeHelp(io); },
    async run(argv, io, context) {
      await runTranscribeCli(argv, io, transcribeEnvironment(context, services));
    },
  }];
}
