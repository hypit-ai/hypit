import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { loadDiscoveredSourcePackages } from "@hypit/hypit/cli";
import type { CliApplicationContext, CliCommandModule, CliIo } from "@hypit/hypit/cli";
import { sameType } from "@hypit/hypit/protocol";
import { sealText, textTypes } from "@hypit/hypit/text";

import {
  countSpeechEstimateUnits,
  estimateSpeechDuration,
  resolveSpeechEstimateLanguage,
  resolveSpeechEstimateRate,
} from "./program.js";
import { speechEstimatePolicyFromAttributes } from "./policy.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Parsed = {
  readonly positionals: readonly string[];
  readonly options: ReadonlyMap<string, string>;
  readonly json: boolean;
};

function parse(argv: readonly string[]): Parsed {
  const allowed = new Set(["--text", "--segment", "--language", "--pace", "--rate", "--rounding", "--padding", "--project"]);
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

async function textOrFile(value: string, cwd: string): Promise<string> {
  const path = resolve(cwd, value);
  const isFile = await stat(path).then((item) => item.isFile(), () => false);
  const text = (isFile ? await readFile(path, "utf8") : value).trim();
  assert(text.length > 0, isFile ? `--text file ${path} is empty` : "--text is empty");
  return text;
}

async function segmentSpeech(
  source: string,
  segment: string,
  projectRoot: string,
  application: CliApplicationContext,
): Promise<string> {
  const distribution = application.distribution;
  const loaded = await loadDiscoveredSourcePackages({ ...distribution, bootstrapPackages: [] }, {
    source,
    workspaceRoot: projectRoot,
    packageRoot: projectRoot,
    ...(distribution.packageRoot === undefined ? {} : { distributionPackageRoot: distribution.packageRoot }),
  });
  const compiler = distribution.createCompiler({
    workspaceRoot: projectRoot,
    packageRoot: projectRoot,
    ...(distribution.packageRoot === undefined ? {} : { distributionPackageRoot: distribution.packageRoot }),
    packageContributions: loaded.map((item) => item.contribution),
  });
  const workspace = await compiler.openEntry(source);
  const compiled = await compiler.compileResolvedSource(workspace.entry, workspace);
  const suffix = `.segment.${segment}.speech`;
  const record = compiled.program.records.find((item) =>
    sameType(item.type, textTypes.text) && item.id.endsWith(suffix));
  assert(record !== undefined, `${source} declares no Segment ${segment} with speech; Segments are named by the Script's <segment id>`);
  const text = (record.value as { readonly value?: unknown } | null)?.value;
  assert(typeof text === "string", `Segment ${segment} speech is not Text`);
  return text;
}

export function writeEstimateHelp(io: CliIo): void {
  io.write("hypit estimate\nEstimate authored speech before choosing a literal duration. Pure local work.\n\n"
    + "  hypit estimate <source.svml> --segment <id> [--language auto|en|zh|ja|es] [--pace slow|normal|fast | --rate <units/s>]\n"
    + "                [--rounding none|round|ceil] [--padding <s>] [--project <directory>]\n"
    + "  hypit estimate --text <text|file> [same speech options]\n");
}

export async function runEstimateCli(
  argv: readonly string[],
  io: CliIo,
  application: CliApplicationContext,
): Promise<void> {
  if (argv.includes("--help")) { writeEstimateHelp(io); return; }
  const parsed = parse(argv);
  const inlineText = parsed.options.get("--text");
  const segment = parsed.options.get("--segment");
  let text: string;
  let where: { readonly source: string; readonly segment: string } | { readonly text: true };
  if (inlineText !== undefined) {
    assert(segment === undefined && parsed.positionals.length === 0, "--text cannot be combined with a source or --segment");
    text = await textOrFile(inlineText, application.cwd);
    where = { text: true };
  } else {
    assert(parsed.positionals.length === 1 && segment !== undefined,
      "estimate takes either --text <text|file>, or a source .svml with --segment <id>");
    const source = resolve(application.cwd, parsed.positionals[0]!);
    const project = parsed.options.get("--project");
    const projectRoot = await application.resolveProjectRoot(
      project === undefined ? undefined : resolve(application.cwd, project),
    );
    text = await segmentSpeech(source, segment, projectRoot, application);
    where = { source, segment };
  }
  const pace = parsed.options.get("--pace");
  const rate = parsed.options.get("--rate");
  assert(pace === undefined || rate === undefined, "estimate takes either --pace or --rate, not both");
  const policy = speechEstimatePolicyFromAttributes({
    language: parsed.options.get("--language") ?? "auto",
    ...(rate === undefined ? { pace: pace ?? "normal" } : { rate }),
    rounding: parsed.options.get("--rounding") ?? "none",
    ...(parsed.options.get("--padding") === undefined ? {} : { padding: parsed.options.get("--padding") }),
  }, "hypit estimate");
  const language = resolveSpeechEstimateLanguage(text, policy.language);
  const units = countSpeechEstimateUnits(text, language);
  const seconds = estimateSpeechDuration(sealText(text), policy);
  const resolvedRate = resolveSpeechEstimateRate(policy, language);
  const view = { format: "hypit.speech-estimate@1", ...where, characters: text.length,
    units, language, policy, rate: resolvedRate, seconds };
  if (parsed.json) { io.write(`${JSON.stringify(view, null, 2)}\n`); return; }
  io.write(`${Number(seconds.toFixed(3))}s\n\n  ${units} pronunciation units · ${language} · ${resolvedRate} units/s${
    policy.pace === undefined ? "" : ` (${policy.pace})`}\n  padding ${policy.paddingSec ?? 0}s · rounding ${policy.rounding}\n  ${
    "segment" in where ? `${where.segment} in ${where.source}` : `${text.length} characters`}\n`
    + "  Choose the request duration from this estimate, the intended performance, and the selected model's supported values.\n");
}

export const cliCommandModules = [{
  format: "hypit.cli-command@1",
  id: "@hypit/speech-estimate",
  commands: ["estimate"],
  writeRootHelp(io) { io.write("\nSpeech estimation\n  estimate\n  hypit estimate --help for inputs and delivery options\n"); },
  writeHelp(_argv, io) { writeEstimateHelp(io); },
  async run(argv, io, context) { await runEstimateCli(argv, io, context); },
}] as const satisfies readonly CliCommandModule[];
