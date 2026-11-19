function locationOf(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset);
  const lines = before.split(/\r\n|\r|\n/u);
  return { line: lines.length, column: [...(lines.at(-1) ?? "")].length + 1 };
}

export class ScriptSyntaxError extends Error {
  readonly code: string;
  readonly sourceName: string;
  readonly offset: number | undefined;
  readonly line: number | undefined;
  readonly column: number | undefined;

  constructor(code: string, message: string, sourceName: string, offset?: number, source?: string) {
    const position = source === undefined || offset === undefined ? undefined : locationOf(source, offset);
    const at = offset === undefined ? ""
      : position === undefined ? ` (${sourceName}:${offset})`
      : ` (${sourceName}:${position.line}:${position.column})`;
    super(`${code}: ${message}${at}`);
    this.name = "ScriptSyntaxError";
    this.code = code;
    this.sourceName = sourceName;
    this.offset = offset;
    this.line = position?.line;
    this.column = position?.column;
  }
}
