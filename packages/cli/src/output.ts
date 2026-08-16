import { relative, resolve } from "node:path";

import type { BuildPlan, TypeRef } from "@narratage/protocol";

export type CliTerminal = {
  readonly isTTY: boolean;
  readonly color: boolean;
  readonly unicode: boolean;
  readonly columns: number;
};

export type CliIo = {
  readonly write: (text: string) => void;
  /** Concrete command shells expose process status without coupling the engine to Node globals. */
  readonly setExitCode?: (code: number) => void;
  /** Interactive secret input supplied by the concrete CLI shell; never echoed or logged. */
  readonly readSecret?: (prompt: string) => Promise<string>;
  readonly terminal?: CliTerminal;
};

export type CliColorMode = "auto" | "always" | "never";

export type CliOutputOptions = {
  readonly json: boolean;
  readonly jsonl?: boolean;
  readonly color: CliColorMode;
  readonly verbose: boolean;
};

export type CliDiagnostic = {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
};

export type DoctorOutput = {
  readonly format: "narratage.cli-doctor@1";
  readonly ok: boolean;
  readonly dataRoot: string;
  readonly diagnostics: readonly CliDiagnostic[];
};

export type AuthorCheckOutput = {
  readonly format: "narratage.cli-check@1";
  readonly sourceKind: "author";
  readonly ok: true;
  readonly units: number;
  readonly sourceAssets: readonly unknown[];
  readonly modules: readonly string[];
  readonly exports: readonly {
    readonly name: string;
    readonly type: TypeRef;
    readonly kind: string;
  }[];
};

export type RunCheckOutput = {
  readonly format: "narratage.cli-check@1";
  readonly sourceKind: "run";
  readonly ok: true;
  readonly run: string;
  readonly source: string;
  readonly targets: readonly unknown[];
  readonly candidates: Readonly<Record<string, string>>;
  readonly satisfactions: readonly unknown[];
  readonly steps?: number;
  readonly unresolvedBuildRecords?: readonly {
    readonly id: string;
    readonly build: string;
    readonly output: string;
  }[];
};

export type PlanPreflight = {
  readonly ok: boolean;
  readonly dataRoot: string;
  readonly capabilities: readonly string[];
  readonly diagnostics: readonly CliDiagnostic[];
};

export type PlanOutput = {
  readonly format: "narratage.cli-plan@1";
  readonly ok: boolean;
  readonly plan: BuildPlan;
  readonly preflight?: PlanPreflight;
};

export type CliPresentation =
  | {
      readonly kind: "doctor";
      readonly machine: DoctorOutput;
      readonly profile: string;
    }
  | {
      readonly kind: "check-author";
      readonly machine: AuthorCheckOutput;
      readonly source: string;
      readonly frontend: string;
    }
  | {
      readonly kind: "check-run";
      readonly machine: RunCheckOutput;
      readonly frontend: string;
    }
  | {
      readonly kind: "plan";
      readonly machine: PlanOutput;
      readonly run: string;
      /** Presentation names declared by this Author Source and Run Source. Never used to plan. */
      readonly outputNames?: Readonly<Record<string, string>>;
      readonly satisfactionNames?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "operational";
      readonly machine: unknown;
      readonly title: string;
      readonly status?: "success" | "warning" | "error" | "info";
      readonly facts?: readonly (readonly [string, string])[];
      readonly lines?: readonly string[];
    };

type Palette = {
  readonly accent: (value: string) => string;
  readonly success: (value: string) => string;
  readonly warning: (value: string) => string;
  readonly error: (value: string) => string;
  readonly dim: (value: string) => string;
  readonly strong: (value: string) => string;
};

const ansi = (open: number, close: number) => (enabled: boolean) => (value: string): string =>
  enabled ? `\u001b[${open}m${value}\u001b[${close}m` : value;

function palette(enabled: boolean): Palette {
  return {
    accent: ansi(36, 39)(enabled),
    success: ansi(32, 39)(enabled),
    warning: ansi(33, 39)(enabled),
    error: ansi(31, 39)(enabled),
    dim: ansi(2, 22)(enabled),
    strong: ansi(1, 22)(enabled),
  };
}

function colorEnabled(io: CliIo, mode: CliColorMode): boolean {
  if (mode === "never") return false;
  if (mode === "always") return true;
  return io.terminal?.isTTY === true && io.terminal.color;
}

function glyph(io: CliIo, unicode: string, ascii: string): string {
  return io.terminal?.unicode === false ? ascii : unicode;
}

function shortPath(path: string): string {
  const absolute = resolve(path);
  const local = relative(process.cwd(), absolute);
  return local.length > 0 && !local.startsWith("..") ? local : absolute;
}

function shortOpaque(value: string): string {
  if (value.length <= 38) return value;
  return `${value.slice(0, 24)}…${value.slice(-8)}`;
}

function typeName(type: TypeRef): string {
  return `${type.module.name}@${type.module.version}/${type.name}`;
}

/** Frontends may export graph plumbing so later compilers can address it.
 * Keep that machine surface intact, but do not make authors read generated
 * binding names during an ordinary source check. */
function isGeneratedExportName(name: string): boolean {
  return name.includes(".__") || /\.binding-\d+$/u.test(name) || name.endsWith(".bindings");
}

function facts(rows: readonly (readonly [string, string])[], colors: Palette): string[] {
  const width = Math.max(...rows.map(([name]) => name.length), 0);
  return rows.map(([name, value]) => `  ${colors.dim(name.padEnd(width))}  ${value}`);
}

function heading(status: "success" | "warning" | "error" | "info", text: string, io: CliIo, colors: Palette): string {
  const mark = status === "success"
    ? colors.success(glyph(io, "✓", "+"))
    : status === "warning"
      ? colors.warning("!")
      : status === "error"
        ? colors.error(glyph(io, "×", "x"))
        : colors.accent(glyph(io, "•", "i"));
  return `${mark} ${colors.strong(text)}`;
}

function renderDoctor(view: Extract<CliPresentation, { kind: "doctor" }>, io: CliIo, colors: Palette): string {
  const errors = view.machine.diagnostics.filter((item) => item.severity === "error");
  const warnings = view.machine.diagnostics.filter((item) => item.severity === "warning");
  const lines = [colors.accent(colors.strong("Narratage Doctor")), ""];
  lines.push(...facts([
    ["Profile", shortPath(view.profile)],
    ["Data root", shortPath(view.machine.dataRoot)],
  ], colors));
  lines.push("");
  if (view.machine.diagnostics.length === 0) {
    lines.push(heading("success", "No problems found", io, colors));
  } else {
    for (const item of view.machine.diagnostics) {
      const status = item.severity === "error" ? "error" : item.severity === "warning" ? "warning" : "info";
      lines.push(heading(status, item.code, io, colors));
      lines.push(`  ${item.message}`);
      if (item.subject !== undefined) lines.push(`  ${colors.dim("Subject")}  ${item.subject}`);
    }
  }
  lines.push("");
  const summary = `${errors.length} error${errors.length === 1 ? "" : "s"}`
    + ` · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`;
  lines.push(view.machine.ok ? colors.success(summary) : colors.error(summary));
  return `${lines.join("\n")}\n`;
}

function renderAuthorCheck(
  view: Extract<CliPresentation, { kind: "check-author" }>,
  io: CliIo,
  colors: Palette,
  verbose: boolean,
): string {
  const lines = [heading("success", "Source is valid", io, colors), ""];
  const authorFacing = view.machine.exports.filter((item) => !isGeneratedExportName(item.name));
  const outputs = authorFacing.filter((item) => item.kind === "logical-output");
  const values = authorFacing.filter((item) => item.kind !== "logical-output");
  const readable = verbose ? view.machine.exports : outputs;
  lines.push(...facts([
    ["Source", shortPath(view.source)],
    ["Frontend", view.frontend],
    ["Modules", String(view.machine.modules.length)],
    ["Units", String(view.machine.units)],
    ["Outputs", String(outputs.length)],
    ...(verbose ? [["Values", String(values.length)] as const] : []),
    ["Assets", String(view.machine.sourceAssets.length)],
  ], colors));
  if (readable.length > 0) {
    lines.push("", colors.strong(verbose ? "All exports" : "Runnable outputs"));
    const ordered = [...readable].sort((left, right) => {
      const leftRank = left.kind === "logical-output" ? 0 : 1;
      const rightRank = right.kind === "logical-output" ? 0 : 1;
      return leftRank - rightRank || left.name.localeCompare(right.name);
    });
    const shown = verbose ? ordered : ordered.slice(0, 12);
    const width = Math.max(...shown.map((item) => item.name.length));
    for (const item of shown) {
      lines.push(`  ${colors.accent(item.name.padEnd(width))}  ${typeName(item.type)}`
        + `${verbose ? `  ${colors.dim(item.kind)}` : ""}`);
    }
    if (shown.length < ordered.length) {
      lines.push(`  ${colors.dim(`${ordered.length - shown.length} more · use --verbose for the complete list`)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderRunCheck(
  view: Extract<CliPresentation, { kind: "check-run" }>,
  io: CliIo,
  colors: Palette,
): string {
  const lines = [heading("success", "Run source is valid", io, colors), ""];
  lines.push(...facts([
    ["Run", shortPath(view.machine.run)],
    ["Author", shortPath(view.machine.source)],
    ["Frontend", view.frontend],
    ["Targets", String(view.machine.targets.length)],
    ["Candidates", String(Object.keys(view.machine.candidates).length)],
    ["Satisfactions", String(view.machine.satisfactions.length)],
    ...(view.machine.steps === undefined ? [] : [["Steps", String(view.machine.steps)] as const]),
  ], colors));
  const unresolved = view.machine.unresolvedBuildRecords ?? [];
  if (unresolved.length > 0) {
    lines.push("", heading("warning", `${unresolved.length} historical Candidate${unresolved.length === 1 ? "" : "s"} unresolved`, io, colors));
    for (const item of unresolved) lines.push(`  ${item.id} ← ${item.build}/${item.output}`);
    lines.push(`  ${colors.dim("The Run source is valid. plan/build will resolve these archived values.")}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderPlan(
  view: Extract<CliPresentation, { kind: "plan" }>,
  io: CliIo,
  colors: Palette,
  verbose: boolean,
): string {
  const plan = view.machine.plan;
  const grouped = new Map<string, number>();
  const requested = new Map<string, number>();
  for (const step of plan.steps) {
    const name = `${step.producer.module.name}@${step.producer.module.version}`;
    grouped.set(name, (grouped.get(name) ?? 0) + 1);
    const needs = Object.keys(step.needs).length;
    if (needs > 0) {
      const producer = `${name}#${step.producer.name}`;
      requested.set(producer, (requested.get(producer) ?? 0) + needs);
    }
  }
  const lines = [heading("success", "Build plan is valid", io, colors), ""];
  const requestCount = [...requested.values()].reduce((total, count) => total + count, 0);
  lines.push(...facts([
    ["Run", shortPath(view.run)],
    ["Targets", String(plan.goals.length)],
    ["Steps", String(plan.steps.length)],
    ["External requests", String(requestCount)],
  ], colors));
  if (verbose && grouped.size > 0) {
    lines.push("", colors.strong("Operations"));
    const entries = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
    const countWidth = Math.max(...entries.map(([, count]) => String(count).length));
    for (const [name, count] of entries) {
      lines.push(`  ${colors.accent(String(count).padStart(countWidth))}  ${name}`);
    }
  }
  if (requested.size > 0) {
    lines.push("", colors.strong("External requests"));
    const entries = [...requested.entries()].sort(([left], [right]) => left.localeCompare(right));
    const countWidth = Math.max(...entries.map(([, count]) => String(count).length));
    for (const [producer, count] of entries) {
      lines.push(`  ${colors.warning(String(count).padStart(countWidth))}  ${producer}`);
    }
    lines.push(`  ${colors.dim("These Needs may reach the Endpoints selected by the Runtime Profile during build.")}`);
  }
  if (view.machine.preflight !== undefined
    && (view.machine.preflight.capabilities.length > 0 || view.machine.preflight.diagnostics.length > 0)) {
    lines.push("", colors.strong("Runtime preflight"));
    for (const capability of view.machine.preflight.capabilities) lines.push(`  ${colors.accent(capability)}`);
    if (view.machine.preflight.diagnostics.length === 0) {
      lines.push(`  ${colors.success(glyph(io, "✓", "+"))} required deployment slice is ready`);
    } else {
      for (const item of view.machine.preflight.diagnostics) {
        const mark = item.severity === "error" ? colors.error(glyph(io, "×", "x")) : colors.warning("!");
        lines.push(`  ${mark} ${item.code}: ${item.message}`);
      }
    }
    const capabilityCount = view.machine.preflight.capabilities.length;
    lines.push(`  ${colors.dim(`Runtime base checked; ${capabilityCount} demanded Endpoint ${capabilityCount === 1 ? "capability" : "capabilities"} checked.`)}`);
  }
  const visibleSelections = verbose
    ? plan.selections
    : plan.selections.filter((selection) => view.satisfactionNames?.[selection.output] !== undefined);
  if (visibleSelections.length > 0) {
    lines.push("", colors.strong(verbose ? "Selections" : "Run choices"));
    for (const selection of visibleSelections) {
      const status = colors.success(glyph(io, "✓", "+"));
      const output = view.outputNames?.[selection.output] ?? shortOpaque(selection.output);
      const candidate = view.satisfactionNames?.[selection.output];
      lines.push(`  ${status} ${colors.accent(output)}`
        + `${candidate === undefined ? "" : ` ← ${candidate}`}`);
      if (verbose && (output !== selection.output || candidate !== undefined)) {
        lines.push(`    ${colors.dim(`${shortOpaque(selection.output)} ← ${shortOpaque(selection.candidate)}`)}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderOperational(
  view: Extract<CliPresentation, { kind: "operational" }>,
  io: CliIo,
  colors: Palette,
): string {
  const lines = [heading(view.status ?? "info", view.title, io, colors)];
  if ((view.facts?.length ?? 0) > 0) lines.push("", ...facts(view.facts!, colors));
  if ((view.lines?.length ?? 0) > 0) lines.push("", ...view.lines!);
  return `${lines.join("\n")}\n`;
}

export function writeCliOutput(
  io: CliIo,
  options: CliOutputOptions,
  presentation: CliPresentation,
): void {
  if (options.json) {
    io.write(`${JSON.stringify(presentation.machine, null, options.jsonl === true ? 0 : 2)}\n`);
    return;
  }
  const colors = palette(colorEnabled(io, options.color));
  const output = presentation.kind === "doctor"
    ? renderDoctor(presentation, io, colors)
    : presentation.kind === "check-author"
      ? renderAuthorCheck(presentation, io, colors, options.verbose)
      : presentation.kind === "check-run"
        ? renderRunCheck(presentation, io, colors)
        : presentation.kind === "plan"
          ? renderPlan(presentation, io, colors, options.verbose)
          : renderOperational(presentation, io, colors);
  io.write(output);
}

function commandHelp(topic: string, colors: Palette): readonly string[] | undefined {
  const common = [
    "",
    colors.strong("Output"),
    "  --json                     complete machine-readable result",
    "  --verbose                  reveal identities and complete lists",
    "  --color auto|always|never  control ANSI color",
    "  --debug                    include internal trace frames on failure",
    "",
  ];
  const topics: Readonly<Record<string, readonly string[]>> = {
    check: [
      colors.accent(colors.strong("narratage check")),
      colors.dim("Validate one self-described Author Source or Run Source without executing it."),
      "",
      "  narratage check <source> [--runtime <profile>] [--workspace <workspace>] [--asset-root <directory>]",
    ],
    doctor: [
      colors.accent(colors.strong("narratage doctor")),
      colors.dim("Diagnose one complete declarative Runtime Profile without submitting work."),
      "",
      "  narratage doctor [<runtime-profile>]",
    ],
    plan: [
      colors.accent(colors.strong("narratage plan")),
      colors.dim("Freeze the demanded subgraph and expose explicit Run choices and every external Need."),
      "",
      "  narratage plan <run-source> [--runtime <profile>] [--workspace <workspace>] [--asset-root <directory>]",
      "",
      "With --runtime, plan also preflights only the demanded deployment slice.",
      "Planning never starts external work.",
    ],
    build: [
      colors.accent(colors.strong("narratage build")),
      colors.dim("Submit one durable Build and ensure its selected Runtime Worker is available."),
      "",
      "  narratage build <run-source> [--runtime <profile>] [--asset-root <directory>] [--follow] [--no-programs]",
      "",
      "  --follow                   observe the Build; the Worker still owns execution",
      "  --no-programs              do not start declared external programs",
      "  --max-wait-ms <ms>         bound startup or follow waiting",
    ],
    runtime: [
      colors.accent(colors.strong("narratage runtime")),
      colors.dim("Select a project Runtime Profile, then operate its durable Worker."),
      "",
      "  narratage runtime use <profile>       select the Profile for this project",
      "  narratage runtime unset               remove only the local selection",
      "  narratage runtime up [<profile>]      validate the Profile, start programs and Worker",
      "  narratage runtime status [<profile>]  inspect Worker, queue capacity and declared programs",
      "  narratage runtime logs [<profile>]    read Worker logs",
      "  narratage runtime down [<profile>]    stop the Worker; external programs keep running",
    ],
    programs: [
      colors.accent(colors.strong("narratage programs")),
      colors.dim("Operate only the external programs declared by Endpoints in one Runtime Profile."),
      "",
      "  narratage programs up [<profile>] [--max-wait-ms <ms>]",
      "  narratage programs status [<profile>]",
      "  narratage programs down [<profile>]",
    ],
    queue: [
      colors.accent(colors.strong("narratage queue")),
      colors.dim("Inspect durable Build dispatch and Provider pool capacity."),
      "",
      "  narratage queue [--runtime <profile>] [--watch]",
      "  narratage queue [--runtime <profile>] --watch --jsonl",
    ],
    paths: [
      colors.accent(colors.strong("narratage paths")),
      colors.dim("Show project, Runtime and host state locations without creating them."),
      "",
      "  narratage paths [--runtime <profile>]",
    ],
    builds: [
      colors.accent(colors.strong("narratage builds")),
      colors.dim("List Builds archived by one Runtime Profile."),
      "",
      "  narratage builds [--runtime <profile>]",
    ],
    status: [
      colors.accent(colors.strong("narratage status")),
      colors.dim("Show one Build now, or keep watching it without owning execution."),
      "",
      "  narratage status <build-id> [--runtime <profile>] [--watch]",
      "  --watch                   observe until terminal; the Worker still owns execution",
      "  --max-wait-ms <ms>        stop watching after a bounded wait",
    ],
    inspect: [
      colors.accent(colors.strong("narratage inspect")),
      colors.dim("Inspect one Build's targets and accepted archive."),
      "",
      "  narratage inspect <build-id> [--runtime <profile>]",
    ],
    get: [
      colors.accent(colors.strong("narratage get")),
      colors.dim("Read or copy one archived result; copying never reruns work."),
      "",
      "  narratage get <build-id> [--runtime <profile>] [--name <source-name>|--record <id>|--output <id>|--artifact <digest>] [--to <path>]",
    ],
    history: [
      colors.accent(colors.strong("narratage history")),
      colors.dim("Find accepted historical Logical Outputs without selecting them for a new Run."),
      "",
      "  narratage history <output-name> [--runtime <profile>] [--source <author-source>]",
      "  narratage history --source <author-source> [--runtime <profile>]",
    ],
    cancel: [
      colors.accent(colors.strong("narratage cancel")),
      colors.dim("Withdraw one Build and honestly reconcile work already submitted to Providers."),
      "",
      "  narratage cancel <build-id> [--runtime <profile>] [--reason <text>]",
    ],
    auth: [
      colors.accent(colors.strong("narratage auth")),
      colors.dim("Manage credentials required by one declared Endpoint instance."),
      "",
      "  narratage auth status <endpoint-instance> [--runtime <profile>] [--slot <name>]",
      "  narratage auth login <endpoint-instance> [--runtime <profile>] [--slot <name>] [--from <secret-file>]",
      "  narratage auth logout <endpoint-instance> [--runtime <profile>] [--slot <name>]",
    ],
    gc: [
      colors.accent(colors.strong("narratage gc")),
      colors.dim("Report unreachable archived Artifacts; delete them only with --apply."),
      "",
      "  narratage gc [<profile>] [--apply]",
    ],
  };
  const selected = topics[topic];
  return selected === undefined ? undefined : [...selected, ...common];
}

export function writeCliHelp(io: CliIo, topic?: string): void {
  const colors = palette(io.terminal?.isTTY === true && io.terminal.color);
  const row = (command: string, description: string, width = 30): string =>
    `  ${command.padEnd(width)}${description}`;
  if (topic !== undefined) {
    const selected = commandHelp(topic, colors);
    if (selected !== undefined) {
      io.write(selected.join("\n"));
      return;
    }
  }
  io.write([
    colors.accent(colors.strong("Narratage")),
    colors.dim('"First, there was narration. Then, there were montages."'),
    "",
    colors.strong("Typical flow"),
    row("runtime use <profile>", "select this project's execution environment", 40),
    row("plan <run-source>", "see exactly what this Run will demand", 40),
    row("build <run-source>", "submit durable work; add --follow to watch", 40),
    row("get <build-id>", "read or copy an archived result", 40),
    row("doctor [profile]", "diagnose deployment setup when needed", 40),
    "",
    colors.strong("Authoring"),
    row("check <source>", "verify one self-described Author or Run source"),
    row("plan <run-source>", "freeze and inspect a Build plan"),
    row("build <run-source>", "submit a durable Build; --follow only observes"),
    "",
    colors.strong("Archive"),
    row("builds", "list known Builds"),
    row("history [output]", "find accepted historical Logical Outputs"),
    row("status <build-id> [--watch]", "show or continuously observe one Build"),
    row("inspect <build-id>", "inspect accepted Records and demanded outputs"),
    row("get <build-id>", "read or materialize one archived result"),
    row("cancel <build-id>", "withdraw one Build and reconcile submitted work"),
    "",
    colors.strong("Runtime"),
    row("doctor [profile]", "validate deployment without executing"),
    row("runtime use|unset", "select this project's Runtime Profile"),
    row("runtime up|status|logs|down", "manage the durable Worker"),
    row("programs up|status|down", "manage declared external programs only"),
    row("queue [--watch]", "inspect durable dispatch and shared capacity"),
    row("paths", "show every effective state location"),
    row("auth status|login|logout", "manage Endpoint-declared credential references"),
    row("gc [profile]", "report unreachable Artifacts; --apply deletes"),
    "",
    colors.strong("Output"),
    row("--json", "complete machine-readable result"),
    row("--verbose", "reveal identities and complete lists"),
    row("--color auto|always|never", "control ANSI color"),
    row("--debug", "include internal trace frames on failure"),
    "",
  ].join("\n"));
}

export function renderCliError(error: unknown, options: {
  readonly json: boolean;
  readonly color: boolean;
  readonly unicode: boolean;
  readonly debug: boolean;
}): string {
  const source = error instanceof Error ? error : new Error(String(error));
  const trace = source.stack?.split("\n").slice(1).join("\n").trim();
  const candidateCode = (source as Error & { readonly code?: unknown }).code;
  const code = typeof candidateCode === "string" && candidateCode.trim().length > 0
    ? candidateCode
    : "CLI_ERROR";
  if (options.json) {
    return `${JSON.stringify({
      format: "narratage.cli-error@1",
      ok: false,
      error: {
        code,
        message: source.message,
        ...(options.debug && trace !== undefined && trace.length > 0 ? { trace } : {}),
      },
    }, null, 2)}\n`;
  }
  const colors = palette(options.color);
  const mark = options.unicode ? "×" : "x";
  const lines = [
    `${colors.error(mark)} ${colors.strong("Command failed")}`,
    "",
    `  ${colors.error(code)}`,
    ...source.message.split("\n").map((line) => `  ${line}`),
  ];
  if (options.debug && trace !== undefined && trace.length > 0) {
    lines.push("", colors.dim(trace));
  } else {
    lines.push("", colors.dim("Run with --debug to include the internal stack trace."));
  }
  return `${lines.join("\n")}\n`;
}
