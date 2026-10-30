import { relative, resolve, sep } from "node:path";

import { compareCodeUnits } from "@hypit/protocol";
import type { CanonicalValue } from "@hypit/protocol";

import { CliUsageError } from "./usage-error.js";

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
  readonly format: "hypit.cli-doctor@1";
  readonly ok: boolean;
  readonly project: string;
  readonly profile?: string;
  readonly profileSource?: "argument" | "project" | "none";
  readonly selectionFile?: string;
  readonly diagnosticCount: number;
  readonly diagnostics: readonly CliDiagnostic[];
  readonly omittedDiagnostics?: number;
};

export type AuthorCheckOutput = {
  readonly format: "hypit.cli-check@1";
  readonly sourceKind: "author";
  readonly ok: true;
  readonly source: string;
  readonly frontend: string;
  readonly units: number;
  readonly assets: number;
  readonly modules: number;
  readonly outputCount: number;
  readonly outputs?: readonly {
    readonly name: string;
    readonly type: string;
  }[];
  readonly omittedOutputs?: number;
  readonly details?: {
    readonly modules: readonly string[];
    readonly values: readonly { readonly name: string; readonly type: string }[];
  };
};

export type PlanPreflight = {
  readonly ok: boolean;
  readonly capabilityCount: number;
  readonly capabilities?: readonly string[];
  readonly omittedCapabilities?: number;
  readonly diagnosticCount: number;
  readonly diagnostics: readonly CliDiagnostic[];
  readonly omittedDiagnostics?: number;
};

export type PlanEndpoint = {
  readonly capability: string;
  readonly resolution?: "resolved" | "unresolved" | "ambiguous";
  readonly support?: "supported" | "unsupported" | "not-evaluated";
  readonly endpoint?: string;
  readonly use?: string;
  readonly pricing?: { readonly kind: "page"; readonly url: string } | { readonly kind: "local" };
  readonly endpoints?: readonly string[];
  readonly rejections?: readonly { readonly endpoint: string; readonly message: string }[];
  readonly binding?: string;
};

export type PlanOutput = {
  readonly format: "hypit.cli-plan@1";
  readonly ok: boolean;
  readonly source: string;
  readonly targetCount: number;
  readonly targets: readonly string[];
  readonly requestCount: number;
  readonly requestIssueCount: number;
  readonly producerFailureCount: number;
  /** Complete deterministic Producer failures; errors are never hidden by the detail limit. */
  readonly producerFailures: readonly string[];
  /** Present when a Runtime Profile was selected. */
  readonly providerRequestCount?: number;
  readonly localRequestCount?: number;
  readonly unresolvedRequestCount?: number;
  readonly unsupportedRequestCount?: number;
  /** Every external request in execution order, already joined to Provider selection when available. */
  readonly requests: readonly PlanRequest[];
  readonly preflight?: PlanPreflight;
};

/** Output scope is independent of encoding. Limits apply to expanded detail, not demanded work. */
export function createPlanOutput(plan: PlanOutput, options: { readonly verbose: boolean; readonly limit: number }): PlanOutput {
  const { preflight, ...summary } = plan;
  const limit = options.limit;
  return {
    ...summary,
    ...(preflight === undefined ? {} : { preflight: {
      ok: preflight.ok,
      capabilityCount: preflight.capabilityCount,
      diagnosticCount: preflight.diagnosticCount,
      diagnostics: preflight.diagnostics,
      ...(options.verbose ? {
        capabilities: preflight.capabilities?.slice(0, limit) ?? [],
        ...((preflight.capabilities?.length ?? 0) <= limit ? {} : {
          omittedCapabilities: preflight.capabilities!.length - limit,
        }),
      } : {}),
    } }),
  };
}

export type PricingEntry = Omit<PlanEndpoint, "capability"> & {
  readonly capability: string;
  readonly pricingDocuments?: readonly PricingDocument[];
  readonly pricingError?: string;
};

export type PricingRequest = PlanRequest & {
  readonly pricingDocuments?: readonly PricingDocument[];
  readonly pricingError?: string;
};

export type PricingDocument = {
  readonly source: string;
  readonly data: CanonicalValue;
  readonly summary?: string;
};

export type PricingOutput = {
  readonly format: "hypit.cli-pricing@1";
  readonly source: string;
  readonly requestCount: number;
  readonly noChargeRequestCount: number;
  readonly producerFailureCount: number;
  readonly producerFailures: PlanOutput["producerFailures"];
  readonly groups: readonly (PricingEntry & {
    readonly requests: readonly PlanRequestDetail[];
  })[];
};

export type PlanRequestDetail = {
  readonly readiness: "concrete" | "blocked" | "failed" | "unavailable";
  readonly summary?: readonly {
    readonly at: readonly (string | number)[];
    readonly value: string | number | boolean;
  }[];
  /** Author-facing input names that will only become available during execution. */
  readonly pending: readonly string[];
  readonly issue?: string;
};

export type PlanRequest = PlanEndpoint & PlanRequestDetail;

/**
 * Stable machine-output envelope shared by built-in and contributed commands.
 *
 * The generic CLI keeps its own outputs precise in `OperationalMachineView`, but
 * must not enumerate every application module's payload in a central union.
 */
export type CliMachineView = {
  readonly format: string;
  readonly [field: string]: unknown;
};

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
      readonly kind: "plan";
      readonly machine: PlanOutput;
    }
  | {
      readonly kind: "pricing";
      readonly machine: PricingOutput;
      /** Optional human display limit, applied after grouping; JSON always contains every group. */
      readonly limit?: number;
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
  return local.length > 0 && local !== ".." && !local.startsWith(`..${sep}`) ? local : absolute;
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
    ["Runtime Profile", view.machine.profile === undefined ? "not selected" : shortPath(view.machine.profile)],
    ...(view.machine.profileSource === "argument"
      ? [["Runtime selection", "command argument (this command only)"] as const]
      : view.machine.selectionFile === undefined ? [] : [["Runtime selection", shortPath(view.machine.selectionFile)] as const]),
    ["Scope", view.machine.profile === undefined ? "project Results only" : "selected Runtime and project Results"],
  ], colors));
  lines.push("");
  if (view.machine.profile === undefined) {
    lines.push("Select an existing Profile with hypit runtime use <profile>, or pass --runtime <profile> to check it.", "");
  }
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
  const readable = view.machine.outputs ?? [];
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
    const ordered = [...readable].sort((left, right) => compareCodeUnits(left.name, right.name));
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

function summaryPath(at: readonly (string | number)[]): string {
  if (at.length === 0) return "$";
  return at.map((segment, index) => typeof segment === "number"
    ? `[${segment}]`
    : /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(segment)
      ? `${index === 0 ? "" : "."}${segment}`
      : `[${JSON.stringify(segment)}]`).join("");
}

function groupKey(need: PlanRequestDetail): string {
  return JSON.stringify({
    readiness: need.readiness,
    summary: need.summary,
    pending: [...need.pending].sort(),
    issue: need.issue,
  });
}

function needSummaryText(needs: readonly PlanRequestDetail[]): string {
  const first = needs[0]!;
  const parts: string[] = [];
  for (const { at, value } of first.summary ?? []) {
    const name = summaryPath(at);
    if (typeof value === "boolean") {
      parts.push(value ? name : `no ${name}`);
    } else {
      parts.push(`${name} ${value}`);
    }
  }
  const pendingCount = first.pending.length;
  if (pendingCount > 0) parts.push(`${pendingCount === 1 ? "input" : `${pendingCount} inputs`} produced during Build`);
  if (first.readiness === "blocked" && pendingCount === 0) parts.push("request blocked by upstream work");
  if (first.readiness === "failed") parts.push("request Producer failed");
  if (first.readiness === "unavailable") parts.push("request Producer unavailable");
  if (first.issue !== undefined) parts.push(`could not inspect: ${first.issue}`);
  return parts.length === 0 ? "request summary unavailable" : parts.join(" · ");
}

/** One line per distinct author-facing request shape, counted. */
function groupedNeedLines(needs: readonly PlanRequestDetail[], colors: Palette, _verbose: boolean): string[] {
  const groups = new Map<string, PlanRequestDetail[]>();
  for (const need of needs) {
    const key = groupKey(need);
    groups.set(key, [...(groups.get(key) ?? []), need]);
  }
  return [...groups.values()].map((group) => {
    const count = `×${group.length}`.padStart(4);
    return `    ${colors.dim(count)}  ${needSummaryText(group)}`;
  });
}

function endpointGroupKey(endpoint: PlanEndpoint): string {
  return JSON.stringify({
    capability: endpoint.capability,
    resolution: endpoint.resolution,
    support: endpoint.support,
    endpoint: endpoint.endpoint,
    use: endpoint.use,
    pricing: endpoint.pricing,
    endpoints: endpoint.endpoints,
    rejections: endpoint.rejections,
    binding: endpoint.binding,
  });
}

function endpointRejectionText(endpoint: Pick<PlanEndpoint, "rejections">, verbose: boolean): string {
  const rejections = endpoint.rejections ?? [];
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
    ["Source", shortPath(view.machine.source)],
    ["Targets", targetSummary],
    ["Requests", String(view.machine.requestCount)],
    ...(view.machine.requestIssueCount === 0 ? [] : [["Request issues", String(view.machine.requestIssueCount)] as const]),
    ...(view.machine.producerFailureCount === 0 ? [] : [["Producer failures", String(view.machine.producerFailureCount)] as const]),
    ...((view.machine.providerRequestCount ?? 0) === 0 ? [] : [["Provider requests", String(view.machine.providerRequestCount)] as const]),
    ...((view.machine.localRequestCount ?? 0) === 0 ? [] : [["Local requests", String(view.machine.localRequestCount)] as const]),
    ...((view.machine.unsupportedRequestCount ?? 0) === 0 ? [] : [["Unsupported", String(view.machine.unsupportedRequestCount)] as const]),
    ...((view.machine.unresolvedRequestCount ?? 0) === 0 ? [] : [["Unresolved", String(view.machine.unresolvedRequestCount)] as const]),
    ...(view.machine.preflight === undefined ? [] : [[
      "Preflight", view.machine.preflight.ok ? "ready" : "needs attention",
    ] as const]),
  ], colors));
  if (view.machine.producerFailures.length > 0) {
    lines.push("", colors.strong("Producer failures"));
    for (const failure of view.machine.producerFailures) {
      lines.push(`  ${colors.error(glyph(io, "×", "x"))} ${failure}`);
    }
  }
  if (view.machine.requests.some((request) => request.resolution !== undefined)) {
    if (view.machine.requests.length > 0) lines.push("", colors.strong("Providers and price pages"));
    const groups = new Map<string, PlanRequest[]>();
    for (const endpoint of view.machine.requests) {
      const key = endpointGroupKey(endpoint);
      groups.set(key, [...(groups.get(key) ?? []), endpoint]);
    }
    for (const group of groups.values()) {
      const item = group[0]!;
      const where = item.resolution === "resolved"
        ? item.support === "unsupported"
          ? colors.error(endpointRejectionText(item, verbose))
          : `${item.endpoint ?? ""} ${colors.dim(`(${item.use ?? "?"})${item.binding === undefined ? "" : ", bound in the Profile"}`)}`
        : item.resolution === "ambiguous"
          ? colors.warning(`${(item.endpoints ?? []).join(", ")} all offer it; add "bindings": { "${item.capability}": "<instance>" } to the Profile`)
          : item.binding === undefined
            ? colors.error("no Endpoint offers this demand")
            : colors.error(`bound to ${item.binding}, which does not offer this demand`);
      const price = item.pricing === undefined
        ? (item.resolution === "resolved" ? colors.warning("price source unknown") : undefined)
        : item.pricing.kind === "local"
          ? colors.dim("local, no Provider charge")
          : item.pricing.url;
      lines.push(`  ${colors.accent(item.capability)}`);
      lines.push(`    ${where}${price === undefined ? "" : `  ·  ${price}`}`);
      lines.push(...groupedNeedLines(group, colors, verbose));
    }
  } else if (view.machine.requestCount > 0) {
    const byCapability = new Map<string, PlanRequest[]>();
    for (const need of view.machine.requests) {
      byCapability.set(need.capability, [...(byCapability.get(need.capability) ?? []), need]);
    }
    if (byCapability.size > 0) lines.push("", colors.strong("Requests"));
    for (const [capability, needs] of byCapability) {
      lines.push(`  ${colors.accent(capability)}`);
      lines.push(...groupedNeedLines(needs, colors, verbose));
    }
    lines.push("", colors.dim("Pass --runtime <profile> to see the Endpoint and price page behind each request."));
  }
  if (view.machine.preflight !== undefined
    && (view.machine.preflight.diagnostics.length > 0
      || (verbose && (view.machine.preflight.capabilities?.length ?? 0) > 0))) {
    lines.push("", colors.strong("Runtime preflight"));
    if (verbose) for (const capability of view.machine.preflight.capabilities ?? []) lines.push(`  ${colors.accent(capability)}`);
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
  return `${lines.join("\n")}\n`;
}

function pricingDocumentLines(document: PricingDocument, colors: Palette, verbose: boolean): string[] {
  const rendered = !verbose && document.summary !== undefined
    ? document.summary : JSON.stringify(document.data, undefined, 2);
  return [
    `      ${colors.dim("Source")}  ${document.source}`,
    ...rendered.split("\n").map((line) => `      ${line}`),
  ];
}

/** Factor shared request parameters without losing the combinations of the remaining parameters. */
function pricingNeedLines(needs: readonly PlanRequestDetail[], colors: Palette, verbose: boolean): string[] {
  if (verbose || needs.length < 2) return groupedNeedLines(needs, colors, verbose);
  const first = needs[0]!;
  const sharedFields = (first.summary ?? []).filter((field) => needs.every((need) =>
    need.summary?.some((candidate) => JSON.stringify(candidate.at) === JSON.stringify(field.at)
      && candidate.value === field.value) === true));
  const sharedPaths = new Set(sharedFields.map((field) => JSON.stringify(field.at)));
  const sharedPending = needs.every((need) =>
    JSON.stringify([...need.pending].sort()) === JSON.stringify([...first.pending].sort()));
  const common = needs.map(({ issue: _issue, ...need }) => ({
    ...need,
    summary: sharedFields,
    pending: sharedPending ? need.pending : [],
  }));
  const varying = needs.map((need) => ({
    ...need,
    summary: (need.summary ?? []).filter((field) => !sharedPaths.has(JSON.stringify(field.at))),
    pending: sharedPending ? [] : need.pending,
  }));
  const hasParameters = (need: PlanRequestDetail) => (need.summary?.length ?? 0) > 0
    || need.pending.length > 0 || need.issue !== undefined;
  return [
    ...(common.some(hasParameters) ? [`    ${needSummaryText(common)}`] : []),
    ...(varying.some(hasParameters) ? groupedNeedLines(varying, colors, false) : []),
  ];
}

/** Group Provider facts without interpreting their documents or inferring charges from model names. */
export function createPricingOutput(
  source: string,
  requests: readonly PricingRequest[],
  includeNoCharge = false,
  producerFailures: PricingOutput["producerFailures"] = [],
): PricingOutput {
  const groups = new Map<string, PricingEntry & { requests: PlanRequestDetail[] }>();
  let noChargeRequestCount = 0;
  for (const request of requests) {
    const { readiness, summary, pending, issue, ...entry } = request;
    if (entry.resolution === "resolved" && entry.support !== "unsupported" && entry.pricing?.kind === "local") {
      noChargeRequestCount++;
      if (!includeNoCharge) continue;
    }
    const key = JSON.stringify(entry);
    let group = groups.get(key);
    if (group === undefined) {
      group = { ...entry, requests: [] };
      groups.set(key, group);
    }
    group.requests.push({ readiness, ...(summary === undefined ? {} : { summary }), pending,
      ...(issue === undefined ? {} : { issue }) });
  }
  return {
    format: "hypit.cli-pricing@1", source, requestCount: requests.length,
    noChargeRequestCount, groups: [...groups.values()],
    producerFailureCount: producerFailures.length, producerFailures,
  };
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
    ["Source", shortPath(machine.source)],
    ["Requests", String(machine.requestCount)],
    ["No Provider charge", `${machine.noChargeRequestCount} requests`],
    ...(machine.producerFailureCount === 0 ? [] : [["Producer failures", String(machine.producerFailureCount)] as const]),
  ], colors));
  if (machine.producerFailures.length > 0) {
    lines.push("", colors.strong("Producer failures"));
    for (const failure of machine.producerFailures) {
      lines.push(`  ${colors.error(glyph(io, "×", "x"))} ${failure}`);
    }
  }
  if (machine.noChargeRequestCount > 0 && !verbose) {
    lines.push(`  ${colors.dim("No-charge request details: --verbose")}`);
  }
  if (machine.groups.length > 0) lines.push("", colors.strong("Requests and Provider rates"));
  const shown = view.limit === undefined ? machine.groups : machine.groups.slice(0, view.limit);
  for (const item of shown) {
    const selected = item.resolution === "resolved"
      ? item.support === "unsupported"
        ? colors.error(endpointRejectionText(item, verbose))
        : `${item.endpoint ?? ""} ${colors.dim(`(${item.use ?? "?"})`)}`
      : item.resolution === "ambiguous"
        ? colors.error(`several Endpoints: ${(item.endpoints ?? []).join(", ")}`)
        : colors.error("no Endpoint offers this demand");
    lines.push(`  ${colors.accent(item.capability)}`);
    lines.push(`    ${selected} · ${item.requests.length} request${item.requests.length === 1 ? "" : "s"}`);
    lines.push(...pricingNeedLines(item.requests, colors, verbose));
    if (item.resolution === "resolved" && item.support === "not-evaluated") {
      lines.push(`      ${colors.dim("Request-sensitive pricing deferred until the request is concrete")}`);
    }
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
      && item.resolution === "resolved" && item.pricingError === undefined) {
      lines.push(`      ${colors.warning("Pricing unknown: no pricing source declared by this Provider")}`);
    }
    lines.push("");
  }
  if (shown.length < machine.groups.length) {
    lines.push(`  ${colors.dim(`${machine.groups.length - shown.length} more groups · omit --limit or use --json for all groups`)}`);
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
      colors.dim("Validate one self-described Author Source without executing it."),
      "",
      "  hypit check <source> [--project <workspace>] [--asset-root <directory>]",
      "  --verbose lists exported names/types and authored values.",
    ],
    doctor: [
      colors.accent(colors.strong("hypit doctor")),
      colors.dim("Diagnose project Results and, when selected or supplied, one Runtime Profile."),
      "",
      "  hypit doctor [--runtime <profile>] [--project <project>] [--endpoint <instance>]",
      "  A positional Profile is also accepted in place of --runtime.",
      "  Repeat --endpoint <instance> to limit the operation to chosen services; omission covers the Profile.",
      "  Without a Runtime Profile, checks only project Result storage.",
    ],
    plan: [
      colors.accent(colors.strong("hypit plan")),
      colors.dim("Show targets, demanded requests and their readiness without executing them."),
      "",
      "  hypit plan <source> --target <output> [--target <output>]...",
      "    [--runtime <profile>] [--project <workspace>] [--asset-root <directory>]",
      "",
      "With --runtime, plan also preflights only the demanded deployment slice and names the Provider",
      "and price page behind each external request.",
      "Select at least one Author Output with an explicit --target option.",
      "--verbose expands capability and diagnostic detail. --limit bounds that detail,",
      "while all demanded requests and diagnostics remain visible in both text and JSON.",
      "Planning never starts external work.",
    ],
    pricing: [
      colors.accent(colors.strong("hypit pricing")),
      colors.dim("Read current pricing material for one explicit target selection."),
      "",
      "  hypit pricing <source> --target <output> [--target <output>]...",
      "    [--runtime <profile>] [--project <workspace>] [--asset-root <directory>]",
      "",
      "Pricing is an explicit read-only network operation. It starts no Build and submits no generation.",
      "Matching requests share their parameters and Provider rates, with source URLs.",
      "Provider summaries appear when available; --verbose and --json retain the full documents.",
      "Explicit no-charge requests are summarized; --verbose includes their details.",
      "All groups are shown by default. --limit <count> limits human groups; --json always includes all groups.",
      "Hypit calculates no total.",
    ],
    build: [
      colors.accent(colors.strong("hypit build")),
      colors.dim("Submit one durable Build and ensure its selected Runtime Worker is available."),
      "",
      "  hypit build <source> --target <output> [--target <output>]...",
      "    [--runtime <profile>] [--project <workspace>] [--asset-root <directory>] [--follow]",
      "",
      "  --follow                   observe the Build; the Worker still owns execution",
      "  --max-wait-ms <ms>         bound startup or follow waiting",
    ],
    activity: [
      colors.accent(colors.strong("hypit activity")),
      colors.dim("Inspect active Builds and Provider pool capacity."),
      "",
      "  hypit activity [--project <project>] [--runtime <profile>] [--watch]",
      "  hypit activity [--project <project>] [--runtime <profile>] --watch --jsonl",
    ],
    builds: [
      colors.accent(colors.strong("hypit builds")),
      colors.dim("List project-owned Build Results without opening a Runtime."),
      "",
      "  hypit builds [--project <project>] [--limit <count>] [--before <build-id>]",
    ],
    logs: [
      colors.accent(colors.strong("hypit logs")),
      colors.dim("Read Build execution evidence; finished logs need only the project Result Repository."),
      "",
      "  hypit logs <build-id> [--project <project>] [--runtime <profile>] [--lines <count>]",
      "  --lines <count>           show the last N records (default 50)",
    ],
    status: [
      colors.accent(colors.strong("hypit status")),
      colors.dim("Show one Build now, or keep watching it without owning execution."),
      "",
      "  hypit status <build-id> [--project <project>] [--runtime <profile>] [--watch]",
      "  --watch                   observe until a Result outcome or operator attention",
      "  --max-wait-ms <ms>        stop watching after a bounded wait",
    ],
    inspect: [
      colors.accent(colors.strong("hypit inspect")),
      colors.dim("Inspect one project-owned Build Result and its retained Outputs."),
      "",
      "  hypit inspect <build-id> [--output <name>] [--limit <count>] [--project <project>]",
      "  Lists retained Outputs independently of Targets.",
      "  --output selects one exact name; --limit bounds the Output list.",
    ],
    history: [
      colors.accent(colors.strong("hypit history")),
      colors.dim("Find one named Output across project-owned Build Results."),
      "",
      "  hypit history <output-name> [--project <project>] [--source <author-source>] [--limit <count>] [--before <build-id>]",
    ],
    cancel: [
      colors.accent(colors.strong("hypit cancel")),
      colors.dim("Stop one Build and request cancellation of submitted work when supported."),
      "",
      "  hypit cancel <build-id> [--project <project>] [--runtime <profile>] [--reason <text>]",
    ],
    result: [
      colors.accent(colors.strong("hypit result")),
      colors.dim("Export one retained Output from project Result history."),
      "",
      "  hypit result export <build-id> --output <name> --to <path> [--project <project>]",
      "",
      "Inline Outputs become JSON files. File Outputs keep their original bytes.",
      "Structured Outputs use the author format supplied by their Type-owning package.",
    ],
    auth: [
      colors.accent(colors.strong("hypit auth")),
      colors.dim("Manage credentials required by one declared Endpoint instance."),
      "",
      "  hypit auth status <endpoint-instance> [--runtime <profile>] [--slot <name>]",
      "  hypit auth login <endpoint-instance> [--runtime <profile>] [--slot <name>] [--from <secret-file>]",
      "  hypit auth logout <endpoint-instance> [--runtime <profile>] [--slot <name>]",
      "  All auth actions accept --project <project> to use that project's selection.",
      "  status shows credential presence and the Provider's declared browser login, if any.",
      "  login opens that browser flow or securely prompts for the secret; --from imports a secret instead.",
      "  Configure the service's Endpoint first. Storing a key does not install a Provider or select bindings.",
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
    throw new CliUsageError(`Unknown help topic ${JSON.stringify(topic)}`, "hypit help");
  }
  io.write([
    colors.accent(colors.strong("Hypit")),
    "",
    colors.strong("Authoring"),
    row("check <source>", "verify one Author source"),
    row("plan <source>", "show one explicit target selection without executing"),
    row("pricing <source>", "read selected Providers' current pricing material"),
    row("build <source>", "submit one explicit target selection; --follow observes it"),
    "",
    colors.strong("Results"),
    row("builds", "list Results newest first"),
    row("history <output>", "find one named Output across Builds"),
    row("logs <build-id> [--lines <count>]", "read saved Build execution phases and diagnostics"),
    row("status <build-id> [--watch]", "show current work and Result facts"),
    row("inspect <build-id>", "inspect one Result"),
    row("result export <build-id> --output <name> --to <path>", "export one retained Output"),
    "",
    colors.strong("Runtime"),
    row("doctor [profile]", "diagnose selected external setup"),
    row("activity [--watch]", "show active Builds and their current phases"),
    row("cancel <build-id>", "withdraw one active Build"),
    row("auth status|login|logout", "manage Endpoint credentials"),
    "",
    colors.strong("Installation"),
    row("version [--check]", "show this installed Hypit Distribution"),
    row("cli status|use|remove", "manage explicit project CLI contributions"),
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
  readonly jsonl?: boolean;
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
        ...(source instanceof CliUsageError ? { help: source.help } : {}),
        ...(options.debug && trace !== undefined && trace.length > 0 ? { trace } : {}),
      },
    }, null, options.jsonl === true ? undefined : 2)}\n`;
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
  } else if (source instanceof CliUsageError) {
    lines.push("", `Usage    ${source.help}`);
  } else {
    lines.push("", colors.dim("Run with --debug to include the internal stack trace."));
  }
  return `${lines.join("\n")}\n`;
}
