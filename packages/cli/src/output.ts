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
  readonly terminal?: CliTerminal;
};

export type CliColorMode = "auto" | "always" | "never";

export type CliOutputOptions = {
  readonly json: boolean;
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
  readonly root: string;
  readonly diagnostics: readonly CliDiagnostic[];
};

export type AuthorCheckOutput = {
  readonly format: "narratage.cli-check@1";
  readonly sourceKind: "author";
  readonly ok: true;
  readonly sourceClosure: string;
  readonly moduleClosure: string;
  readonly graph: string;
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
  readonly authorSourceClosure: string;
  readonly runSourceClosure: string;
  readonly authorModuleClosure: string;
  readonly executionModuleClosure: string;
  readonly authorGraph: string;
  readonly runGraph: string;
  readonly graph: string;
  readonly targetSet: string;
  readonly targets: readonly unknown[];
  readonly candidates: Readonly<Record<string, string>>;
  readonly satisfactions: readonly unknown[];
  readonly steps: number;
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
      readonly machine: BuildPlan;
      readonly run: string;
      readonly targetSet: string;
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

function shortIdentity(value: string): string {
  if (!value.startsWith("sha256:") || value.length <= 22) return value;
  return `${value.slice(0, 15)}…${value.slice(-6)}`;
}

function shortOpaque(value: string): string {
  if (value.length <= 38) return value;
  return `${value.slice(0, 24)}…${value.slice(-8)}`;
}

function typeName(type: TypeRef): string {
  return `${type.module.name}@${type.module.version}/${type.name}`;
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
    ["Root", shortPath(view.machine.root)],
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
  lines.push(...facts([
    ["Source", shortPath(view.source)],
    ["Frontend", view.frontend],
    ["Modules", String(view.machine.modules.length)],
    ["Units", String(view.machine.units)],
    ["Exports", String(view.machine.exports.length)],
    ["Assets", String(view.machine.sourceAssets.length)],
  ], colors));
  if (view.machine.exports.length > 0) {
    lines.push("", colors.strong("Exports"));
    const ordered = [...view.machine.exports].sort((left, right) => {
      const leftRank = left.kind === "logical-output" ? 0 : 1;
      const rightRank = right.kind === "logical-output" ? 0 : 1;
      return leftRank - rightRank || left.name.localeCompare(right.name);
    });
    const shown = verbose ? ordered : ordered.slice(0, 12);
    const width = Math.max(...shown.map((item) => item.name.length));
    for (const item of shown) {
      lines.push(`  ${colors.accent(item.name.padEnd(width))}  ${typeName(item.type)}  ${colors.dim(item.kind)}`);
    }
    if (shown.length < ordered.length) {
      lines.push(`  ${colors.dim(`${ordered.length - shown.length} more · use --verbose for the complete list`)}`);
    }
  }
  if (verbose) {
    lines.push("", colors.strong("Identity"));
    lines.push(...facts([
      ["Source closure", shortIdentity(view.machine.sourceClosure)],
      ["Module closure", shortIdentity(view.machine.moduleClosure)],
      ["Graph", shortIdentity(view.machine.graph)],
    ], colors));
  }
  return `${lines.join("\n")}\n`;
}

function renderRunCheck(
  view: Extract<CliPresentation, { kind: "check-run" }>,
  io: CliIo,
  colors: Palette,
  verbose: boolean,
): string {
  const lines = [heading("success", "Run source is valid", io, colors), ""];
  lines.push(...facts([
    ["Run", shortPath(view.machine.run)],
    ["Author", shortPath(view.machine.source)],
    ["Frontend", view.frontend],
    ["Target set", view.machine.targetSet],
    ["Targets", String(view.machine.targets.length)],
    ["Candidates", String(Object.keys(view.machine.candidates).length)],
    ["Satisfactions", String(view.machine.satisfactions.length)],
    ["Steps", String(view.machine.steps)],
  ], colors));
  if (verbose) {
    lines.push("", colors.strong("Identity"));
    lines.push(...facts([
      ["Author graph", shortIdentity(view.machine.authorGraph)],
      ["Run graph", shortIdentity(view.machine.runGraph)],
      ["Build graph", shortIdentity(view.machine.graph)],
      ["Author closure", shortIdentity(view.machine.authorSourceClosure)],
      ["Run closure", shortIdentity(view.machine.runSourceClosure)],
    ], colors));
  }
  return `${lines.join("\n")}\n`;
}

function renderPlan(
  view: Extract<CliPresentation, { kind: "plan" }>,
  io: CliIo,
  colors: Palette,
  verbose: boolean,
): string {
  const exact = view.machine.steps.filter((item) => item.fidelity === "exact").length;
  const substitute = view.machine.steps.length - exact;
  const grouped = new Map<string, number>();
  for (const step of view.machine.steps) {
    const name = `${step.producer.module.name}@${step.producer.module.version}`;
    grouped.set(name, (grouped.get(name) ?? 0) + 1);
  }
  const lines = [heading("success", "Build plan is valid", io, colors), ""];
  lines.push(...facts([
    ["Run", shortPath(view.run)],
    ["Target set", view.targetSet],
    ["Goals", String(view.machine.goals.length)],
    ["Steps", String(view.machine.steps.length)],
    ["Exact", String(exact)],
    ["Substitute", String(substitute)],
  ], colors));
  if (grouped.size > 0) {
    lines.push("", colors.strong("Operations"));
    const entries = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
    const countWidth = Math.max(...entries.map(([, count]) => String(count).length));
    for (const [name, count] of entries) {
      lines.push(`  ${colors.accent(String(count).padStart(countWidth))}  ${name}`);
    }
  }
  const visibleSelections = verbose
    ? view.machine.selections
    : view.machine.selections.filter((selection) => selection.fidelity === "substitute");
  if (visibleSelections.length > 0) {
    lines.push("", colors.strong("Selections"));
    for (const selection of visibleSelections) {
      const status = selection.fidelity === "exact"
        ? colors.success(glyph(io, "✓", "+"))
        : colors.warning("!");
      lines.push(`  ${status} ${shortOpaque(selection.output)}  ${colors.dim(selection.fidelity)}`);
    }
  }
  if (verbose) {
    lines.push("", colors.strong("Identity"));
    lines.push(...facts([
      ["Plan", shortIdentity(view.machine.id)],
      ["Graph", shortIdentity(view.machine.graph)],
      ["Request", shortIdentity(view.machine.request)],
    ], colors));
  }
  lines.push("", colors.dim("No external work was started."));
  return `${lines.join("\n")}\n`;
}

export function writeCliOutput(
  io: CliIo,
  options: CliOutputOptions,
  presentation: CliPresentation,
): void {
  if (options.json) {
    io.write(`${JSON.stringify(presentation.machine, null, 2)}\n`);
    return;
  }
  const colors = palette(colorEnabled(io, options.color));
  const output = presentation.kind === "doctor"
    ? renderDoctor(presentation, io, colors)
    : presentation.kind === "check-author"
      ? renderAuthorCheck(presentation, io, colors, options.verbose)
      : presentation.kind === "check-run"
        ? renderRunCheck(presentation, io, colors, options.verbose)
        : renderPlan(presentation, io, colors, options.verbose);
  io.write(output);
}

export function writeCliHelp(io: CliIo): void {
  const colors = palette(io.terminal?.isTTY === true && io.terminal.color);
  io.write([
    colors.accent(colors.strong("Narratage")),
    colors.dim("Write the story. Compile the result."),
    "",
    colors.strong("Authoring"),
    "  check <source>              verify one self-described Author or Run source",
    "  plan <run-source>           freeze and inspect a Build plan",
    "  build <run-source>          execute a Build through a Runtime Profile",
    "",
    colors.strong("Archive"),
    "  builds                     list known Builds",
    "  status <build-id>          show Build and Operation status",
    "  inspect <build-id>         inspect accepted Records and demanded outputs",
    "  get <build-id>             read or materialize one archived result",
    "  cancel <build-id>          request cancellation (transitional command)",
    "",
    colors.strong("Runtime"),
    "  doctor <profile>           validate deployment without executing",
    "  services up|status|down    manage current local dependencies",
    "  gc <profile>               report unreachable Artifacts; --apply deletes",
    "",
    colors.strong("Packages"),
    "  lock-packages <file>       lock explicitly installed packages",
    "",
    colors.strong("Output"),
    "  --json                     complete machine-readable result",
    "  --verbose                  reveal identities and complete lists",
    "  --color auto|always|never  control ANSI color",
    "  --debug                    include internal trace frames on failure",
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
