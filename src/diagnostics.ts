export type DiagnosticSeverity = "error" | "warning" | "info";

export type SourceLocation = {
  file: string;
  offset: number;
  line: number;
  column: number;
};

export type Diagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  location?: SourceLocation;
  notes?: string[];
};

export class SvmlError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic | Diagnostic[]) {
    const list = Array.isArray(diagnostics) ? diagnostics : [diagnostics];
    super(list.map((item) => `${item.code}: ${item.message}`).join("\n"));
    this.name = "SvmlError";
    this.diagnostics = list;
  }
}

export function fail(code: string, message: string, location?: SourceLocation): never {
  throw new SvmlError({
    code,
    severity: "error",
    message,
    ...(location ? { location } : {}),
  });
}

export function sourceLocation(file: string, source: string, offset: number): SourceLocation {
  const bounded = Math.max(0, Math.min(source.length, offset));
  const before = source.slice(0, bounded);
  const lines = before.split("\n");
  return {
    file,
    offset: bounded,
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}
