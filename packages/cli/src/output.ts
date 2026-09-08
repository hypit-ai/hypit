import { relative, resolve } from "node:path";

import type { CanonicalValue } from "@hypit/protocol";

import type { OperationalMachineView } from "./machine-view.js";

export type CliTerminal = {
  readonly isTTY: boolean;
  readonly color: boolean;
  readonly unicode: boolean;
  readonly columns: number;
};

export type CliIo = {
  readonly write: (text: string) => void;
  /** Human progress that may use stderr while `write` remains a stable machine-output channel. */
  readonly writeProgress?: (text: string) => void;
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
  readonly format: "hypit.cli-doctor@3";
  readonly ok: boolean;
  readonly project: string;
  readonly profile?: string;
  readonly diagnosticCount: number;
  readonly diagnostics: readonly CliDiagnostic[];
  readonly omittedDiagnostics?: number;
};

export type AuthorCheckOutput = {
  readonly format: "hypit.cli-check@2";
  readonly sourceKind: "author";
  readonly ok: true;
  readonly source: string;
  readonly frontend: string;
  readonly units: number;
  readonly assets: number;
  readonly modules: number;
  readonly outputCount: number;
  readonly outputs: readonly {
    readonly name: string;
    readonly type: string;
  }[];
  readonly omittedOutputs?: number;
  readonly details?: {
    readonly modules: readonly string[];
    readonly values: readonly { readonly name: string; readonly type: string }[];
  };
};

export type RunCheckOutput = {
  readonly format: "hypit.cli-check@2";
  readonly sourceKind: "run";
  readonly ok: true;
  readonly run: string;
  readonly author: string;
  readonly frontend: string;
  readonly targetCount: number;
  readonly targets: readonly string[];
  readonly candidates: number;
  readonly satisfactions: number;
  readonly steps?: number;
  readonly unresolvedHistoricalOutputs?: readonly {
    readonly candidate: string;
    readonly build: string;
    readonly output: string;
  }[];
  readonly omittedHistoricalOutputs?: number;
};

export type PlanPreflight = {
  readonly ok: boolean;
  readonly capabilityCount: number;
  readonly capabilities: readonly string[];
  readonly omittedCapabilities?: number;
  readonly diagnosticCount: number;
  readonly diagnostics: readonly CliDiagnostic[];
  readonly omittedDiagnostics?: number;
};

export type PlanProvider = {
  readonly request: string;
  readonly capability: string;
  readonly status: "resolved" | "unresolved" | "unsupported" | "ambiguous";
  readonly endpoint?: string;
  readonly use?: string;
  readonly pricing?: { readonly kind: "page"; readonly url: string } | { readonly kind: "local" };
  readonly endpoints?: readonly string[];
  readonly rejections?: readonly { readonly endpoint: string; readonly message: string }[];
  readonly binding?: string;
};

export type PlanOutput = {
  readonly format: "hypit.cli-plan@3";
  readonly ok: boolean;
  readonly run: string;
  readonly targetCount: number;
  readonly targets: readonly string[];
  readonly steps: number;
  readonly requestCount: number;
  readonly requestIssueCount: number;
  /** Present when a Runtime Profile was selected. */
  readonly providerRequestCount?: number;
  readonly localRequestCount?: number;
  readonly unresolvedRequestCount?: number;
  readonly unsupportedRequestCount?: number;
  readonly choiceCount: number;
  readonly choices: readonly { readonly output: string; readonly candidate: string }[];
  readonly omittedChoices?: number;
  readonly unreached?: readonly { readonly output: string; readonly operation: string }[];
  readonly omittedUnreached?: number;
  /** Present only when a Runtime Profile was selected; the Endpoint and price page behind each capability. */
  readonly providers?: readonly PlanProvider[];
  readonly omittedProviders?: number;
  /** Every external request the Build will make, in step order, with its parameters when known. */
  readonly needs?: readonly PlanNeed[];
  readonly omittedNeeds?: number;
  readonly preflight?: PlanPreflight;
};

export type PricingEntry = PlanProvider & {
  readonly pricingDocuments?: readonly PricingDocument[];
  readonly pricingError?: string;
};

export type PricingDocument = {
  readonly source: string;
  readonly data: CanonicalValue;
};

export type PricingOutput = {
  readonly format: "hypit.cli-pricing@1";
  readonly run: string;
  readonly requestCount: number;
  readonly pricing: readonly PricingEntry[];
  readonly omittedPricing?: number;
  readonly needs: readonly PlanNeed[];
  readonly omittedNeeds?: number;
};

export type PlanNeed = {
  readonly request: string;
  readonly step: string;
  readonly port: string;
  readonly capability: string;
  readonly endpoint?: string;
  readonly summary?: {
    readonly fields: Readonly<Record<string, string | number | boolean>>;
    readonly references: Readonly<Record<string, number>>;
  };
  readonly pending: readonly {
    readonly input: string;
    readonly record: string;
    readonly sourceStep?: string;
    readonly kind?: "image" | "video" | "audio" | "other";
  }[];
  readonly issue?: string;
};

export type CliMachineView = OperationalMachineView;

export type CliPresentation =
  | {
      readonly kind: "doctor";
      readonly machine: DoctorOutput;
    }
  | {
      readonly kind: "check-author";
      readonly machine: AuthorCheckOutput;
    }
  | {
      readonly kind: "check-run";
      readonly machine: RunCheckOutput;
    }
  | {
      readonly kind: "plan";
      readonly machine: PlanOutput;
    }
  | {
      readonly kind: "pricing";
      readonly machine: PricingOutput;
    }
  | {
      readonly kind: "operational";
      readonly machine: CliMachineView;
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
  const lines = [colors.accent(colors.strong("Hypit Doctor")), ""];
  lines.push(...facts([
    ["Project", shortPath(view.machine.project)],
    ...(view.machine.profile === undefined ? [] : [["Profile", shortPath(view.machine.profile)] as const]),
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
  if ((view.machine.omittedDiagnostics ?? 0) > 0) {
    lines.push(`  ${colors.dim(`${view.machine.omittedDiagnostics} more diagnostics · use --limit <count>`)}`);
  }
  lines.push("");
  const summary = `${view.machine.diagnosticCount} diagnostic${view.machine.diagnosticCount === 1 ? "" : "s"}`;
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
  const readable = view.machine.outputs;
  lines.push(...facts([
    ["Source", shortPath(view.machine.source)],
    ["Outputs", String(view.machine.outputCount)],
    ...(verbose ? [
      ["Frontend", view.machine.frontend] as const,
      ["Modules", String(view.machine.modules)] as const,
      ["Units", String(view.machine.units)] as const,
      ["Assets", String(view.machine.assets)] as const,
      ...(view.machine.details === undefined
        ? [] : [["Values", String(view.machine.details.values.length)] as const]),
    ] : []),
  ], colors));
  if (verbose && readable.length > 0) {
    lines.push("", colors.strong("Outputs"));
    const ordered = [...readable].sort((left, right) => left.name.localeCompare(right.name));
    const width = Math.max(...ordered.map((item) => item.name.length));
    for (const item of ordered) {
      lines.push(`  ${colors.accent(item.name.padEnd(width))}  ${item.type}`);
    }
    if ((view.machine.omittedOutputs ?? 0) > 0) {
      lines.push(`  ${colors.dim(`${view.machine.omittedOutputs} more · use --limit <count>`)}`);
    }
  }
  if (verbose && view.machine.details !== undefined && view.machine.details.values.length > 0) {
    lines.push("", colors.strong("Values"));
    for (const item of view.machine.details.values) {
      lines.push(`  ${colors.accent(item.name)}  ${item.type}`);
    }
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
  const reuse = (view.machine.unresolvedHistoricalOutputs?.length ?? 0)
    + (view.machine.omittedHistoricalOutputs ?? 0);
  const targetSummary = view.machine.targets.length === 0
    ? String(view.machine.targetCount)
    : view.machine.targets.join(", ")
      + (view.machine.targets.length < view.machine.targetCount
        ? ` (+${view.machine.targetCount - view.machine.targets.length})`
        : "");
  lines.push(...facts([
    ["Run", shortPath(view.machine.run)],
    ["Targets", targetSummary],
    ...(reuse === 0 ? [] : [["Reuse", `${reuse} historical Output${reuse === 1 ? "" : "s"}`] as const]),
    ...(verbose ? [
      ["Author", shortPath(view.machine.author)] as const,
      ["Frontend", view.machine.frontend] as const,
      ["Candidates", String(view.machine.candidates)] as const,
      ["Satisfactions", String(view.machine.satisfactions)] as const,
      ...(view.machine.steps === undefined ? [] : [["Steps", String(view.machine.steps)] as const]),
    ] : []),
  ], colors));
  const unresolved = view.machine.unresolvedHistoricalOutputs ?? [];
  if (verbose && unresolved.length > 0) {
    lines.push("", colors.strong("Historical reuse"));
    for (const item of unresolved) lines.push(`  ${item.candidate} ← ${item.build}/${item.output}`);
    if ((view.machine.omittedHistoricalOutputs ?? 0) > 0) {
      lines.push(`  ${colors.dim(`${view.machine.omittedHistoricalOutputs} more · use --limit <count>`)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** `@hypit/seedance@1#seedance-2-mini` → `@hypit/seedance#seedance-2-mini`; the module version is verbose detail. */
function capabilityLabel(name: string): string {
  return name.replace(/@[^@#]+#/u, "#");
}

/** The author-facing part of a step id: the component and operation, without the Source path. */
function stepLabel(step: string): string {
  let decoded = step;
  try { decoded = decodeURIComponent(step); } catch { /* keep the raw id */ }
  const marker = "::component::";
  const at = decoded.lastIndexOf(marker);
  return at === -1 ? decoded : decoded.slice(at + marker.length);
}

const MEASURE = /^(\d+) (words|chars)$/u;

/** Text lengths are ranged across a group rather than splitting otherwise identical requests. */
function groupKey(need: PlanNeed): string {
  const pending = need.pending.map((item) => item.kind ?? "value").sort().join(",");
  if (need.summary === undefined) return `?${pending}|${need.issue ?? ""}`;
  const fields = Object.entries(need.summary.fields)
    .map(([name, value]) => {
      const measured = typeof value === "string" ? MEASURE.exec(value) : null;
      return measured === null ? `${name}=${String(value)}` : `${name}=<${measured[2]}>`;
    });
  const references = Object.entries(need.summary.references).map(([kind, count]) => `${kind}=${count}`);
  return [...fields, "|", ...references, "|", pending, "|", need.issue ?? ""].join(" ");
}

function needSummaryText(needs: readonly PlanNeed[]): string {
  const first = needs[0]!;
  const parts: string[] = [];
  for (const [name, value] of Object.entries(first.summary?.fields ?? {})) {
    const measured = typeof value === "string" ? MEASURE.exec(value) : null;
    if (measured !== null) {
      const unit = measured[2]!;
      const counts = needs.map((need) => Number(MEASURE.exec(String(need.summary?.fields[name] ?? `0 ${unit}`))?.[1] ?? 0));
      const low = Math.min(...counts);
      const high = Math.max(...counts);
      parts.push(`${name} ${low === high ? low : `${low}–${high}`} ${unit}`);
    } else if (typeof value === "boolean") {
      parts.push(value ? name : `no ${name}`);
    } else {
      parts.push(`${name} ${value}`);
    }
  }
  const references = Object.entries(first.summary?.references ?? {}).sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${count} ${kind}`);
  if (references.length > 0) parts.push(`${references.join(" + ")} reference${references.length === 1 && references[0]!.startsWith("1 ") ? "" : "s"}`);
  const pendingCount = first.pending.length;
  if (pendingCount > 0) parts.push(`${pendingCount === 1 ? "input" : `${pendingCount} inputs`} produced during Build`);
  if (first.issue !== undefined) parts.push(`could not inspect: ${first.issue}`);
  return parts.length === 0 ? "no parameters" : parts.join(" · ");
}

/** One line per distinct request shape, counted; the step names when only one request has that shape. */
function groupedNeedLines(needs: readonly PlanNeed[], colors: Palette, verbose: boolean): string[] {
  const groups = new Map<string, PlanNeed[]>();
  for (const need of needs) {
    const key = groupKey(need);
    groups.set(key, [...(groups.get(key) ?? []), need]);
  }
  return [...groups.values()].map((group) => {
    const who = group.length === 1 || verbose ? colors.dim(group.map((need) => stepLabel(need.step)).join(", ")) : "";
    const count = `×${group.length}`.padStart(4);
    return `    ${colors.dim(count)}  ${needSummaryText(group)}${who.length === 0 ? "" : `  ${who}`}`;
  });
}

function providerGroupKey(provider: PlanProvider): string {
  return JSON.stringify({
    capability: provider.capability,
    status: provider.status,
    endpoint: provider.endpoint,
    use: provider.use,
    pricing: provider.pricing,
    endpoints: provider.endpoints,
    rejections: provider.rejections,
    binding: provider.binding,
  });
}

function providerRejectionText(provider: PlanProvider, verbose: boolean): string {
  const rejections = provider.rejections ?? [];
  if (rejections.length === 0) return "no configured Endpoint accepts this request";
  const shown = verbose ? rejections : rejections.slice(0, 1);
  return shown.map((rejection) => `${rejection.endpoint}: ${rejection.message}`).join("; ")
    + (shown.length === rejections.length ? "" : ` · ${rejections.length - shown.length} more Endpoint rejection${rejections.length - shown.length === 1 ? "" : "s"}`);
}

function renderPlan(
  view: Extract<CliPresentation, { kind: "plan" }>,
  io: CliIo,
  colors: Palette,
  verbose: boolean,
): string {
  const lines = [heading(view.machine.ok ? "success" : "error",
    view.machine.ok ? "Build plan is valid" : "Build plan needs attention", io, colors), ""];
  const targetSummary = view.machine.targets.length === 0
    ? String(view.machine.targetCount)
    : view.machine.targets.join(", ")
      + (view.machine.targets.length < view.machine.targetCount
        ? ` (+${view.machine.targetCount - view.machine.targets.length})`
        : "");
  lines.push(...facts([
    ["Run", shortPath(view.machine.run)],
    ["Targets", targetSummary],
    ["Requests", String(view.machine.requestCount)],
    ...(view.machine.requestIssueCount === 0 ? [] : [["Request issues", String(view.machine.requestIssueCount)] as const]),
    ...((view.machine.providerRequestCount ?? 0) === 0 ? [] : [["Provider requests", String(view.machine.providerRequestCount)] as const]),
    ...((view.machine.localRequestCount ?? 0) === 0 ? [] : [["Local requests", String(view.machine.localRequestCount)] as const]),
    ...((view.machine.unsupportedRequestCount ?? 0) === 0 ? [] : [["Unsupported", String(view.machine.unsupportedRequestCount)] as const]),
    ...((view.machine.unresolvedRequestCount ?? 0) === 0 ? [] : [["Unresolved", String(view.machine.unresolvedRequestCount)] as const]),
    ...(view.machine.preflight === undefined ? [] : [[
      "Preflight", view.machine.preflight.ok ? "ready" : "needs attention",
    ] as const]),
    ...(verbose ? [["Steps", String(view.machine.steps)] as const] : []),
  ], colors));
  if (view.machine.providers !== undefined) {
    if (view.machine.providers.length > 0) lines.push("", colors.strong("Providers and price pages"));
    const groups = new Map<string, PlanProvider[]>();
    for (const provider of view.machine.providers) {
      const key = providerGroupKey(provider);
      groups.set(key, [...(groups.get(key) ?? []), provider]);
    }
    for (const group of groups.values()) {
      const item = group[0]!;
      const requestIssue = (view.machine.needs ?? [])
        .find((need) => need.request === item.request)?.issue;
      const where = requestIssue !== undefined
        ? colors.error("request is not completely described before Build")
        : item.status === "resolved"
        ? `${item.endpoint ?? ""} ${colors.dim(`(${item.use ?? "?"})${item.binding === undefined ? "" : ", bound in the Profile"}`)}`
        : item.status === "ambiguous"
          ? colors.warning(`${(item.endpoints ?? []).join(", ")} all offer it; add "bindings": { "${item.capability}": "<instance>" } to the Profile`)
          : item.status === "unsupported"
            ? colors.error(providerRejectionText(item, verbose))
          : item.binding === undefined
            ? colors.error("no selected Endpoint accepts this request")
            : colors.error(`bound to ${item.binding}, which does not offer it`);
      const price = item.pricing === undefined
        ? (item.status === "resolved" ? colors.warning("price source unknown") : undefined)
        : item.pricing.kind === "local"
          ? colors.dim("local, no Provider charge")
          : item.pricing.url;
      lines.push(`  ${colors.accent(verbose ? item.capability : capabilityLabel(item.capability))}`);
      lines.push(`    ${where}${price === undefined ? "" : `  ·  ${price}`}`);
      const requests = new Set(group.map((provider) => provider.request));
      lines.push(...groupedNeedLines((view.machine.needs ?? []).filter((need) => requests.has(need.request)), colors, verbose));
    }
    if ((view.machine.omittedProviders ?? 0) > 0) {
      lines.push(`  ${colors.dim(`${view.machine.omittedProviders} more requests · use --limit <count>`)}`);
    }
  } else if (view.machine.requestCount > 0) {
    const byCapability = new Map<string, PlanNeed[]>();
    for (const need of view.machine.needs ?? []) {
      byCapability.set(need.capability, [...(byCapability.get(need.capability) ?? []), need]);
    }
    if (byCapability.size > 0) lines.push("", colors.strong("Requests"));
    for (const [capability, needs] of byCapability) {
      lines.push(`  ${colors.accent(verbose ? capability : capabilityLabel(capability))}`);
      lines.push(...groupedNeedLines(needs, colors, verbose));
    }
    lines.push("", colors.dim("Pass --runtime <profile> to see the Endpoint and price page behind each request."));
  }
  const unreached = view.machine.unreached ?? [];
  if (verbose && unreached.length > 0) {
    lines.push("", colors.strong("Declared but not reached"));
    const width = Math.max(...unreached.map((item) => item.output.length));
    for (const item of unreached) {
      lines.push(`  ${colors.accent(item.output.padEnd(width))}  ${colors.dim(item.operation)}`);
    }
    if ((view.machine.omittedUnreached ?? 0) > 0) {
      lines.push(`  ${colors.dim(`${view.machine.omittedUnreached} more · use --limit <count>`)}`);
    }
  }
  if (view.machine.preflight !== undefined
    && (view.machine.preflight.diagnostics.length > 0
      || (verbose && view.machine.preflight.capabilities.length > 0))) {
    lines.push("", colors.strong("Runtime preflight"));
    if (verbose) for (const capability of view.machine.preflight.capabilities) lines.push(`  ${colors.accent(capability)}`);
    if (verbose && (view.machine.preflight.omittedCapabilities ?? 0) > 0) {
      lines.push(`  ${colors.dim(`${view.machine.preflight.omittedCapabilities} more capabilities · use --limit <count>`)}`);
    }
    if (verbose && view.machine.preflight.diagnostics.length === 0) {
      lines.push(`  ${colors.success(glyph(io, "✓", "+"))} required deployment slice is ready`);
    } else {
      for (const item of view.machine.preflight.diagnostics) {
        const mark = item.severity === "error" ? colors.error(glyph(io, "×", "x")) : colors.warning("!");
        lines.push(`  ${mark} ${item.code}: ${item.message}`);
      }
    }
    if (verbose) {
      const capabilityCount = view.machine.preflight.capabilityCount;
      lines.push(`  ${colors.dim(`${capabilityCount} demanded Endpoint ${capabilityCount === 1 ? "capability" : "capabilities"} checked.`)}`);
    }
  }
  if (view.machine.choices.length > 0) {
    lines.push("", colors.strong("Run choices"));
    for (const selection of view.machine.choices) {
      const status = colors.success(glyph(io, "✓", "+"));
      lines.push(`  ${status} ${colors.accent(selection.output)} ← ${selection.candidate}`);
    }
    if ((view.machine.omittedChoices ?? 0) > 0) {
      lines.push(`  ${colors.dim(`${view.machine.omittedChoices} more choices · use --limit <count>`)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function pricingDocumentLines(document: PricingDocument, colors: Palette, verbose: boolean): string[] {
  if (!verbose) {
    return [`      ${colors.dim("Pricing data")}  ${document.source} ${colors.dim("· use --json or --verbose for the Provider document")}`];
  }
  const rendered = JSON.stringify(document.data, undefined, 2);
  return [
    `      ${colors.dim("Source")}  ${document.source}`,
    ...rendered.split("\n").map((line) => `      ${line}`),
  ];
}

function renderPricing(
  view: Extract<CliPresentation, { kind: "pricing" }>,
  io: CliIo,
  colors: Palette,
  verbose: boolean,
): string {
  const machine = view.machine;
  const lines = [heading("info", "Provider pricing information", io, colors), ""];
  lines.push(...facts([
    ["Run", shortPath(machine.run)],
    ["Requests", String(machine.requestCount)],
  ], colors));
  if (machine.pricing.length > 0) lines.push("", colors.strong("Requests and pricing sources"));
  const groups = new Map<string, PricingEntry[]>();
  for (const item of machine.pricing) {
    const key = JSON.stringify({
      capability: item.capability,
      status: item.status,
      endpoint: item.endpoint,
      use: item.use,
      pricing: item.pricing,
      endpoints: item.endpoints,
      rejections: item.rejections,
      binding: item.binding,
      pricingDocuments: item.pricingDocuments,
      pricingError: item.pricingError,
    });
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const group of groups.values()) {
    const item = group[0]!;
    const selected = item.status === "resolved"
      ? `${item.endpoint ?? ""} ${colors.dim(`(${item.use ?? "?"})`)}`
      : item.status === "ambiguous"
        ? colors.error(`several Endpoints: ${(item.endpoints ?? []).join(", ")}`)
        : item.status === "unsupported"
          ? colors.error(providerRejectionText(item, verbose))
        : colors.error("no selected Endpoint accepts this request");
    lines.push(`  ${colors.accent(verbose ? item.capability : capabilityLabel(item.capability))}`);
    lines.push(`    ${selected}${group.length === 1 ? "" : ` each ×${group.length}`}`);
    if (item.pricing?.kind === "local") {
      lines.push(`      ${colors.dim("local, no Provider charge")}`);
    }
    for (const document of item.pricingDocuments ?? []) {
      lines.push(...pricingDocumentLines(document, colors, verbose));
    }
    if (item.pricingError !== undefined) {
      lines.push(`      ${colors.warning(`Could not read Provider pricing: ${item.pricingError}`)}`);
    }
    if ((item.pricingDocuments?.length ?? 0) === 0 && item.pricing?.kind === "page") {
      lines.push(`      ${colors.dim("Pricing page")}  ${item.pricing.url}`);
    } else if ((item.pricingDocuments?.length ?? 0) === 0 && item.pricing === undefined
      && item.status === "resolved" && item.pricingError === undefined) {
      lines.push(`      ${colors.dim("No pricing source declared by this Provider")}`);
    }
    const requests = new Set(group.map((entry) => entry.request));
    const needs = machine.needs.filter((need) => requests.has(need.request));
    lines.push(...groupedNeedLines(needs, colors, verbose));
  }
  if ((machine.omittedPricing ?? 0) > 0) {
    lines.push(`  ${colors.dim(`${machine.omittedPricing} more requests · use --limit <count>`)}`);
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
        ? renderRunCheck(presentation, io, colors, options.verbose)
        : presentation.kind === "plan"
          ? renderPlan(presentation, io, colors, options.verbose)
          : presentation.kind === "pricing"
            ? renderPricing(presentation, io, colors, options.verbose)
            : renderOperational(presentation, io, colors);
  io.write(output);
}

function commandHelp(topic: string, colors: Palette): readonly string[] | undefined {
  const common = [
    "",
    colors.strong("Output"),
    "  --json                     stable machine view",
    "  --verbose                  add bounded operational detail",
    "  --color auto|always|never  control ANSI color",
    "  --debug                    include internal trace frames on failure",
    "",
  ];
  const topics: Readonly<Record<string, readonly string[]>> = {
    check: [
      colors.accent(colors.strong("hypit check")),
      colors.dim("Validate one self-described Author Source or Run Source without executing it."),
      "",
      "  hypit check <source> [--workspace <workspace>] [--asset-root <directory>]",
    ],
    doctor: [
      colors.accent(colors.strong("hypit doctor")),
      colors.dim("Diagnose project Results and, when selected or supplied, one Runtime Profile."),
      "",
      "  hypit doctor [<runtime-profile>] [--workspace <project>]",
      "  Without a Runtime Profile, checks only the project's selected Result Store.",
    ],
    plan: [
      colors.accent(colors.strong("hypit plan")),
      colors.dim("Freeze the demanded subgraph and expose explicit Run choices and every external Need."),
      "",
      "  hypit plan <run-source> [--runtime <profile>] [--workspace <workspace>] [--asset-root <directory>]",
      "",
      "With --runtime, plan also preflights only the demanded deployment slice and names the Provider",
      "and price page behind each external request.",
      "Planning never starts external work.",
    ],
    pricing: [
      colors.accent(colors.strong("hypit pricing")),
      colors.dim("Read current pricing material from the selected Providers for the requests in one Run."),
      "",
      "  hypit pricing <run-source> [--runtime <profile>] [--workspace <workspace>] [--asset-root <directory>]",
      "",
      "Pricing is an explicit read-only network operation. It starts no Build and submits no generation.",
      "The command shows each Need beside its Provider source; use --json or --verbose for the raw document.",
      "Hypit calculates no total.",
    ],
    build: [
      colors.accent(colors.strong("hypit build")),
      colors.dim("Submit one durable Build and ensure its selected Runtime Worker is available."),
      "",
      "  hypit build <run-source> [--title <text>] [--runtime <profile>] [--workspace <workspace>] [--asset-root <directory>] [--follow]",
      "",
      "  --title <text>            give this Result a human-facing title",
      "  --follow                   observe the Build; the Worker still owns execution",
      "  --max-wait-ms <ms>         bound startup or follow waiting",
    ],
    runtime: [
      colors.accent(colors.strong("hypit runtime")),
      colors.dim("Select a project Runtime Profile, then operate the local Build Worker."),
      "",
      "  hypit runtime init [<profile>] [--workspace <project>] create and select a starter Profile",
      "  hypit runtime use <profile> [--workspace <project>]  select the project Profile",
      "  hypit runtime unset [--workspace <project>]          remove only that selection",
      "  hypit runtime up [<profile>]      prepare local packages and programs, then start the Worker",
      "  hypit runtime status [<profile>]  inspect the local Worker, active Builds and programs",
      "  hypit runtime logs [<profile>] [--lines <count>]",
      "  hypit runtime down [<profile>]    stop the Worker; external programs keep running",
      "",
      "The project is resolved first. Selection is read only from that project's .hypit/runtime.",
      "No Profile filename discovery or parent-project inheritance is performed.",
      "Remote Endpoints such as HypiHub are not started by this command; use doctor to test them.",
    ],
    packages: [
      colors.accent(colors.strong("hypit packages")),
      colors.dim("Inspect or install one pinned upstream npm package in the shared machine home."),
      "",
      "  hypit packages status <package@exact-version>",
      "  hypit packages install <package@exact-version>",
      "",
      "The package is reused by every project and later session on this machine.",
      "npm owns the ordinary package.json; Hypit creates no package lock or receipt.",
    ],
    programs: [
      colors.accent(colors.strong("hypit programs")),
      colors.dim("Prepare and operate external programs declared by Endpoints in one Runtime Profile."),
      "",
      "  hypit programs up [<profile>] [--max-wait-ms <ms>]",
      "  hypit programs status [<profile>]",
      "  hypit programs down [<profile>]",
    ],
    activity: [
      colors.accent(colors.strong("hypit activity")),
      colors.dim("Inspect active Builds and Provider pool capacity."),
      "",
      "  hypit activity [--runtime <profile>] [--watch]",
      "  hypit activity [--runtime <profile>] --watch --jsonl",
    ],
    paths: [
      colors.accent(colors.strong("hypit paths")),
      colors.dim("Show project, Runtime and host state locations without creating them."),
      "",
      "  hypit paths [--runtime <profile>]",
    ],
    builds: [
      colors.accent(colors.strong("hypit builds")),
      colors.dim("List project-owned Build Results without opening a Runtime."),
      "",
      "  hypit builds [--workspace <project>] [--limit <count>] [--before <build-id>]",
    ],
    status: [
      colors.accent(colors.strong("hypit status")),
      colors.dim("Show one Build now, or keep watching it without owning execution."),
      "",
      "  hypit status <build-id> [--runtime <profile>] [--watch]",
      "  --watch                   observe until a Result outcome or operator attention",
      "  --max-wait-ms <ms>        stop watching after a bounded wait",
    ],
    inspect: [
      colors.accent(colors.strong("hypit inspect")),
      colors.dim("Inspect one project-owned Build Result and its public Outputs."),
      "",
      "  hypit inspect <build-id> [--output <name>] [--limit <count>] [--workspace <project>]",
    ],
    get: [
      colors.accent(colors.strong("hypit get")),
      colors.dim("Export one exact named Build Output to an explicit local destination."),
      "",
      "  hypit get <build-id> --output <name> --to <path> [--workspace <project>]",
      "",
      "Scalar and Resource Outputs become files. A Composite Output becomes a directory",
      "containing value.json and every Resource referenced by that value.",
    ],
    history: [
      colors.accent(colors.strong("hypit history")),
      colors.dim("Find one named Output across project-owned Build Results."),
      "",
      "  hypit history <output-name> [--workspace <project>] [--source <author-source>] [--limit <count>] [--before <build-id>]",
    ],
    cancel: [
      colors.accent(colors.strong("hypit cancel")),
      colors.dim("Stop one Build and request cancellation of submitted work when supported."),
      "",
      "  hypit cancel <build-id> [--runtime <profile>] [--reason <text>]",
    ],
    result: [
      colors.accent(colors.strong("hypit result")),
      colors.dim("Edit one Result, finish an interrupted Result write, or discard an incomplete submission."),
      "",
      "  hypit result finish <build-id> [--runtime <profile>]",
      "  hypit result discard <build-id> [--runtime <profile>]",
      "  hypit result edit <build-id> [--workspace <project>] [--title <text>] [--note <text>]",
      "                           [--highlight <output> ...]",
      "  --clear-title            remove the Result's human title",
      "  --clear-note             remove its note",
      "  --clear-highlights       remove all highlighted Outputs",
    ],
    auth: [
      colors.accent(colors.strong("hypit auth")),
      colors.dim("Manage credentials required by one declared Endpoint instance."),
      "",
      "  hypit auth status <endpoint-instance> [--runtime <profile>] [--slot <name>]",
      "  hypit auth login <endpoint-instance> [--runtime <profile>] [--slot <name>] [--from <secret-file>]",
      "  hypit auth logout <endpoint-instance> [--runtime <profile>] [--slot <name>]",
    ],
  };
  const selected = topics[topic];
  return selected === undefined ? undefined : [...selected, ...common];
}

export function writeCliHelp(io: CliIo, topic?: string): void {
  const colors = palette(io.terminal?.isTTY === true && io.terminal.color);
  const row = (command: string, description: string, width = 30): string =>
    `  ${command}${" ".repeat(Math.max(2, width - command.length))}${description}`;
  if (topic !== undefined) {
    const selected = commandHelp(topic, colors);
    if (selected !== undefined) {
      io.write(`${selected.join("\n")}\n`);
      return;
    }
  }
  io.write([
    colors.accent(colors.strong("Hypit")),
    "",
    colors.strong("Authoring"),
    row("check <source>", "verify one self-described Author or Run source"),
    row("plan <run-source>", "show selected work without executing"),
    row("pricing <run-source>", "read selected Providers' current pricing material"),
    row("build <run-source>", "submit a Build; --follow observes it"),
    "",
    colors.strong("Results"),
    row("builds", "list Results newest first"),
    row("history <output>", "find one named Output across Builds"),
    row("status <build-id> [--watch]", "show current work and Result facts"),
    row("inspect <build-id>", "inspect one Result"),
    row("get <build-id> --output <name> --to <path>", "export one Build Output"),
    row("result edit <build-id>", "title, annotate or highlight a Result"),
    "",
    colors.strong("Runtime"),
    row("doctor [profile]", "diagnose selected external setup"),
    row("runtime init|use|unset", "create or select this project's Runtime Profile"),
    row("runtime up|status|logs|down", "prepare and manage the local Build Runtime"),
    row("programs up|status|down", "manage declared external programs only"),
    row("packages install|status", "manage pinned upstream packages in the machine home"),
    row("activity [--watch]", "inspect active Builds and shared capacity"),
    row("cancel <build-id>", "withdraw one active Build"),
    row("paths", "show physical state locations"),
    row("auth status|login|logout", "manage Endpoint credentials"),
    "",
    colors.strong("Output"),
    row("--json", "stable machine view"),
    row("--verbose", "add bounded operational detail"),
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
      format: "hypit.cli-error@1",
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
