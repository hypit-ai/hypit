import {
  exactTemporalRational,
  type ExactTemporalValue,
  type TemporalMapPiece,
} from "@hypit/temporal/algebra";
import {
  nleProjectFormat,
  type NleAudioAppearance,
  type NleComponentItem,
  type NleComposition,
  type NleItem,
  type NleMatte,
  type NleProcess,
  type NleParameterBinding,
  type NlePictureAppearance,
  type NlePictureLayout,
  type NlePresentItem,
  type NleProject,
  type NleSharedValue,
  type NleSignalReconstruction,
  type NleTimeMapping,
  type NleTrack,
  type NleTransition,
} from "./types.js";

type XmlElement = {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  readonly text: string;
};

function fail(message: string): never {
  throw new Error(`SVML ${message}`);
}

class XmlReader {
  private offset = 0;

  public constructor(private readonly source: string) {}

  public read(): XmlElement {
    this.skipWhitespace();
    if (this.source.startsWith("<?xml", this.offset)) {
      const end = this.source.indexOf("?>", this.offset + 5);
      if (end < 0) fail("XML declaration is not closed.");
      this.offset = end + 2;
    }
    this.skipMisc();
    const root = this.element();
    this.skipMisc();
    if (this.offset !== this.source.length) fail("contains content after its root element.");
    return root;
  }

  private skipWhitespace(): void {
    while (/\s/u.test(this.source[this.offset] ?? "")) this.offset += 1;
  }

  private skipMisc(): void {
    for (;;) {
      this.skipWhitespace();
      if (!this.source.startsWith("<!--", this.offset)) return;
      const end = this.source.indexOf("-->", this.offset + 4);
      if (end < 0) fail("comment is not closed.");
      this.offset = end + 3;
    }
  }

  private name(): string {
    const match = /^[A-Za-z][A-Za-z0-9._-]*/u.exec(this.source.slice(this.offset));
    if (match === null) fail(`expects a name at byte ${this.offset}.`);
    this.offset += match[0].length;
    return match[0];
  }

  private attributeValue(): string {
    const quote = this.source[this.offset];
    if (quote !== '"' && quote !== "'") fail(`expects a quoted attribute at byte ${this.offset}.`);
    this.offset += 1;
    const end = this.source.indexOf(quote, this.offset);
    if (end < 0) fail("attribute is not closed.");
    const value = decodeEntities(this.source.slice(this.offset, end));
    this.offset = end + 1;
    return value;
  }

  private element(): XmlElement {
    if (this.source[this.offset] !== "<") fail(`expects an element at byte ${this.offset}.`);
    if (this.source.startsWith("<!", this.offset) || this.source.startsWith("<?", this.offset)) {
      fail(`does not allow declarations at byte ${this.offset}.`);
    }
    this.offset += 1;
    const name = this.name();
    const attributes: Record<string, string> = {};
    for (;;) {
      this.skipWhitespace();
      if (this.source.startsWith("/>", this.offset)) {
        this.offset += 2;
        return { name, attributes, children: [], text: "" };
      }
      if (this.source[this.offset] === ">") {
        this.offset += 1;
        break;
      }
      const attribute = this.name();
      if (Object.hasOwn(attributes, attribute)) fail(`<${name}> repeats attribute ${attribute}.`);
      this.skipWhitespace();
      if (this.source[this.offset] !== "=") fail(`<${name}> attribute ${attribute} has no value.`);
      this.offset += 1;
      this.skipWhitespace();
      attributes[attribute] = this.attributeValue();
    }

    const children: XmlElement[] = [];
    let text = "";
    for (;;) {
      if (this.source.startsWith(`</${name}`, this.offset)) {
        this.offset += name.length + 2;
        this.skipWhitespace();
        if (this.source[this.offset] !== ">") fail(`</${name}> is malformed.`);
        this.offset += 1;
        return { name, attributes, children, text: decodeEntities(text) };
      }
      if (this.offset >= this.source.length) fail(`<${name}> is not closed.`);
      if (this.source.startsWith("<!--", this.offset)) {
        const end = this.source.indexOf("-->", this.offset + 4);
        if (end < 0) fail("comment is not closed.");
        this.offset = end + 3;
      } else if (this.source[this.offset] === "<") {
        children.push(this.element());
      } else {
        const end = this.source.indexOf("<", this.offset);
        if (end < 0) fail(`<${name}> is not closed.`);
        text += this.source.slice(this.offset, end);
        this.offset = end;
      }
    }
  }
}

function decodeEntities(value: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos|#x[0-9A-Fa-f]+|#[0-9]+);)/u.test(value)) {
    fail("contains an unknown entity.");
  }
  return value.replace(/&(?:amp|lt|gt|quot|apos|#x[0-9A-Fa-f]+|#[0-9]+);/gu, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return '"';
    if (entity === "&apos;") return "'";
    const hexadecimal = entity.startsWith("&#x");
    const code = Number.parseInt(entity.slice(hexadecimal ? 3 : 2, -1), hexadecimal ? 16 : 10);
    if (!Number.isSafeInteger(code) || code < 0 || code > 0x10ffff) fail(`contains invalid entity ${entity}.`);
    return String.fromCodePoint(code);
  });
}

function element(value: XmlElement, name: string): void {
  if (value.name !== name) fail(`expects <${name}>, received <${value.name}>.`);
}

function attributes(value: XmlElement, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  for (const name of Object.keys(value.attributes)) {
    if (!allowed.has(name)) fail(`<${value.name}> has unknown attribute ${name}.`);
  }
  for (const name of required) {
    if (value.attributes[name] === undefined) fail(`<${value.name}> requires attribute ${name}.`);
  }
}

function emptyText(value: XmlElement): void {
  if (value.text.trim().length > 0) fail(`<${value.name}> does not accept text.`);
}

function attr(value: XmlElement, name: string): string {
  const result = value.attributes[name];
  if (result === undefined) fail(`<${value.name}> requires attribute ${name}.`);
  return result;
}

function optionalAttr(value: XmlElement, name: string): string | undefined {
  return value.attributes[name];
}

function booleanAttr(value: XmlElement, name: string): boolean {
  const result = attr(value, name);
  if (result === "true") return true;
  if (result === "false") return false;
  return fail(`<${value.name}> attribute ${name} must be true or false.`);
}

function numberAttr(value: XmlElement, name: string): number {
  const result = Number(attr(value, name));
  if (!Number.isFinite(result)) fail(`<${value.name}> attribute ${name} must be finite.`);
  return result;
}

function integer(value: string, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) fail(`${label} must be a safe integer.`);
  return result;
}

function time(value: string, label: string): ExactTemporalValue {
  const match = /^(-?(?:0|[1-9][0-9]*))\/([1-9][0-9]*)$/u.exec(value);
  if (match === null) fail(`${label} must be an exact seconds rational.`);
  const denominator = Number(match[2]);
  if (!Number.isSafeInteger(denominator)) fail(`${label} denominator must be a safe integer.`);
  return { ticks: match[1]!, timeBase: { numerator: 1, denominator } };
}

function rate(value: string, label: string): { readonly numerator: number; readonly denominator: number } {
  const match = /^(-?(?:0|[1-9][0-9]*))\/([1-9][0-9]*)$/u.exec(value);
  if (match === null) fail(`${label} must be a rational rate.`);
  return { numerator: integer(match[1]!, `${label} numerator`), denominator: integer(match[2]!, `${label} denominator`) };
}

function jsonObject(value: XmlElement): Readonly<Record<string, unknown>> {
  if (value.children.length > 0) fail(`<${value.name}> accepts JSON text only.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.text);
  } catch (error) {
    fail(`<${value.name}> contains invalid JSON: ${error instanceof Error ? error.message : String(error)}.`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`<${value.name}> must contain a JSON object.`);
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function onlyChild(value: XmlElement, name: string): XmlElement {
  const matches = value.children.filter((child) => child.name === name);
  if (matches.length !== 1) fail(`<${value.name}> requires exactly one <${name}>.`);
  return matches[0]!;
}

function optionalChild(value: XmlElement, name: string): XmlElement | undefined {
  const matches = value.children.filter((child) => child.name === name);
  if (matches.length > 1) fail(`<${value.name}> repeats <${name}>.`);
  return matches[0];
}

function assertChildren(value: XmlElement, allowed: readonly string[]): void {
  const names = new Set(allowed);
  for (const child of value.children) {
    if (!names.has(child.name)) fail(`<${value.name}> has unknown child <${child.name}>.`);
  }
  emptyText(value);
}

function packageSymbol(value: XmlElement): { readonly package: string; readonly symbol: string } {
  return { package: attr(value, "package"), symbol: attr(value, "symbol") };
}

function readParameterBinding(value: XmlElement): NleParameterBinding {
  const shared = optionalAttr(value, "parameters-ref");
  const parameters = optionalChild(value, "parameters");
  if ((shared === undefined) === (parameters === undefined)) {
    fail(`<${value.name}> requires exactly one parameters value or parameters-ref.`);
  }
  return shared === undefined
    ? { kind: "inline", value: jsonObject(parameters!) }
    : { kind: "shared", ref: shared };
}

function readTimeMapping(value: XmlElement): NleTimeMapping {
  attributes(value, []);
  assertChildren(value, ["linear", "cubic"]);
  return { pieces: value.children.map((piece, index): TemporalMapPiece => {
    if (piece.name === "linear") {
      attributes(piece, ["target-start", "target-end", "source-start", "rate"], ["wrap-start", "wrap-end"]);
      assertChildren(piece, []);
      const wrapStart = optionalAttr(piece, "wrap-start");
      const wrapEnd = optionalAttr(piece, "wrap-end");
      if ((wrapStart === undefined) !== (wrapEnd === undefined)) fail(`<linear> requires both wrap attributes.`);
      return {
        target: {
          start: time(attr(piece, "target-start"), `time piece ${index} target-start`),
          end: time(attr(piece, "target-end"), `time piece ${index} target-end`),
        },
        sourceAtStart: time(attr(piece, "source-start"), `time piece ${index} source-start`),
        rate: rate(attr(piece, "rate"), `time piece ${index} rate`),
        ...(wrapStart === undefined ? {} : { wrap: {
          start: time(wrapStart, `time piece ${index} wrap-start`),
          end: time(wrapEnd!, `time piece ${index} wrap-end`),
        } }),
      };
    }
    attributes(piece, [
      "target-start", "target-end", "source-start", "source-control-1", "source-control-2", "source-end",
    ]);
    assertChildren(piece, []);
    return {
      target: {
        start: time(attr(piece, "target-start"), `time piece ${index} target-start`),
        end: time(attr(piece, "target-end"), `time piece ${index} target-end`),
      },
      sourceAtStart: time(attr(piece, "source-start"), `time piece ${index} source-start`),
      sourceControl1: time(attr(piece, "source-control-1"), `time piece ${index} source-control-1`),
      sourceControl2: time(attr(piece, "source-control-2"), `time piece ${index} source-control-2`),
      sourceAtEnd: time(attr(piece, "source-end"), `time piece ${index} source-end`),
    };
  }) };
}

function readLayout(value: XmlElement): NlePictureAppearance["layout"] {
  if (optionalAttr(value, "ref") !== undefined) {
    attributes(value, ["ref"]);
    assertChildren(value, []);
    return { ref: attr(value, "ref") };
  }
  attributes(value, ["x", "y", "width", "height", "fit"], ["content-x", "content-y"]);
  assertChildren(value, []);
  return {
    x: numberAttr(value, "x"),
    y: numberAttr(value, "y"),
    width: numberAttr(value, "width"),
    height: numberAttr(value, "height"),
    fit: attr(value, "fit") as NlePictureLayout["fit"],
    ...(optionalAttr(value, "content-x") === undefined ? {} : { contentX: numberAttr(value, "content-x") }),
    ...(optionalAttr(value, "content-y") === undefined ? {} : { contentY: numberAttr(value, "content-y") }),
  };
}

function readReconstruction(value: XmlElement): NleSignalReconstruction {
  attributes(value, ["package", "symbol"]);
  assertChildren(value, ["parameters"]);
  return { using: packageSymbol(value), parameters: jsonObject(onlyChild(value, "parameters")) };
}

function readProcess(value: XmlElement): NleProcess {
  attributes(value, ["id", "package", "symbol", "enabled"], ["parameters-ref"]);
  assertChildren(value, ["parameters", "control-time"]);
  return {
    id: attr(value, "id"),
    operator: packageSymbol(value),
    enabled: booleanAttr(value, "enabled"),
    parameters: readParameterBinding(value),
    controlTime: readTimeMapping(onlyChild(value, "control-time")),
  };
}

function readPicture(value: XmlElement): NlePictureAppearance {
  attributes(value, []);
  assertChildren(value, ["layout", "reconstruction", "process"]);
  return {
    layout: readLayout(onlyChild(value, "layout")),
    ...(optionalChild(value, "reconstruction") === undefined ? {} : {
      reconstruction: readReconstruction(optionalChild(value, "reconstruction")!),
    }),
    ...(value.children.some((child) => child.name === "process") ? {
      operators: value.children.filter((child) => child.name === "process").map(readProcess),
    } : {}),
  };
}

function readAudio(value: XmlElement): NleAudioAppearance {
  attributes(value, []);
  assertChildren(value, ["reconstruction", "process"]);
  return {
    ...(optionalChild(value, "reconstruction") === undefined ? {} : {
      reconstruction: readReconstruction(optionalChild(value, "reconstruction")!),
    }),
    ...(value.children.some((child) => child.name === "process") ? {
      operators: value.children.filter((child) => child.name === "process").map(readProcess),
    } : {}),
  };
}

function readPresent(value: XmlElement): NlePresentItem {
  attributes(value, ["id", "source", "start", "duration", "enabled"], ["name", "role"]);
  assertChildren(value, [
    "source-time", "media", "component", "composition", "parameters", "shared", "media-input", "picture", "audio",
  ]);
  const base = {
    id: attr(value, "id"),
    ...(optionalAttr(value, "name") === undefined ? {} : { name: attr(value, "name") }),
    kind: "present" as const,
    start: time(attr(value, "start"), `Present ${attr(value, "id")} start`),
    duration: time(attr(value, "duration"), `Present ${attr(value, "id")} duration`),
    enabled: booleanAttr(value, "enabled"),
    sourceTime: readTimeMapping(onlyChild(value, "source-time")),
    ...(optionalChild(value, "picture") === undefined ? {} : { picture: readPicture(optionalChild(value, "picture")!) }),
    ...(optionalChild(value, "audio") === undefined ? {} : { audio: readAudio(optionalChild(value, "audio")!) }),
  };
  const source = attr(value, "source");
  const role = optionalAttr(value, "role");
  if (role !== undefined && (source !== "component" || role !== "subtitle")) fail("<present> role requires a subtitle Component.");
  if (source === "media") {
    assertChildren(value, ["source-time", "media", "picture", "audio"]);
    const media = onlyChild(value, "media");
    attributes(media, ["path"]);
    assertChildren(media, []);
    return { ...base, source, asset: { path: attr(media, "path") } };
  }
  if (source === "component") {
    assertChildren(value, ["source-time", "component", "parameters", "shared", "media-input", "picture", "audio"]);
    const component = onlyChild(value, "component");
    attributes(component, ["package", "symbol"]);
    assertChildren(component, []);
    const bindings = value.children.filter((child) => child.name === "shared").map((binding) => {
      attributes(binding, ["slot", "ref"]);
      assertChildren(binding, []);
      return { slot: attr(binding, "slot"), ref: attr(binding, "ref") };
    });
    const media = value.children.filter((child) => child.name === "media-input").map((input) => {
      attributes(input, ["name", "path"]);
      assertChildren(input, []);
      return [attr(input, "name"), { path: attr(input, "path") }] as const;
    });
    return {
      ...base,
      source,
      component: packageSymbol(component),
      ...(role === "subtitle" ? { role } : {}),
      parameters: jsonObject(onlyChild(value, "parameters")),
      ...(bindings.length === 0 ? {} : { sharedValueBindings: bindings }),
      ...(media.length === 0 ? {} : { media: Object.fromEntries(media) }),
    };
  }
  if (source === "composition") {
    assertChildren(value, ["source-time", "composition", "picture", "audio"]);
    const composition = onlyChild(value, "composition");
    attributes(composition, ["ref"]);
    assertChildren(composition, []);
    return { ...base, source, composition: attr(composition, "ref") };
  }
  return fail(`<present> source ${source} is invalid.`);
}

function readAdjust(value: XmlElement): NleItem {
  attributes(value, ["id", "package", "symbol", "start", "duration", "enabled"], ["name", "parameters-ref"]);
  assertChildren(value, ["parameters", "control-time"]);
  return {
    id: attr(value, "id"),
    ...(optionalAttr(value, "name") === undefined ? {} : { name: attr(value, "name") }),
    kind: "adjust",
    operator: packageSymbol(value),
    start: time(attr(value, "start"), `Adjust ${attr(value, "id")} start`),
    duration: time(attr(value, "duration"), `Adjust ${attr(value, "id")} duration`),
    enabled: booleanAttr(value, "enabled"),
    parameters: readParameterBinding(value),
    controlTime: readTimeMapping(onlyChild(value, "control-time")),
  };
}

function readTrack(value: XmlElement): NleTrack {
  attributes(value, ["id", "name", "kind", "enabled"], ["role"]);
  assertChildren(value, ["present", "adjust"]);
  const role = optionalAttr(value, "role");
  if (role !== undefined && role !== "subtitle" && role !== "text" && role !== "effect") {
    fail(`<track> role ${role} is invalid.`);
  }
  return {
    id: attr(value, "id"),
    name: attr(value, "name"),
    kind: attr(value, "kind") as NleTrack["kind"],
    ...(role === undefined ? {} : { role }),
    enabled: booleanAttr(value, "enabled"),
    items: value.children.map((child) => child.name === "present" ? readPresent(child) : readAdjust(child)),
  };
}

function readRelation(value: XmlElement): NleTransition | NleMatte {
  const transition = value.name === "transition";
  attributes(value,
    transition
      ? ["id", "outgoing", "incoming", "package", "symbol"]
      : ["id", "content", "matte", "package", "symbol"]);
  assertChildren(value, ["parameters"]);
  const common = { id: attr(value, "id"), operator: packageSymbol(value), parameters: jsonObject(onlyChild(value, "parameters")) };
  return transition
    ? { ...common, outgoing: attr(value, "outgoing"), incoming: attr(value, "incoming") }
    : { ...common, content: attr(value, "content"), matte: attr(value, "matte") };
}

function readComposition(value: XmlElement): NleComposition {
  attributes(value, ["id", "name", "width", "height"]);
  assertChildren(value, ["track", "transition", "matte"]);
  return {
    id: attr(value, "id"),
    name: attr(value, "name"),
    canvas: { width: numberAttr(value, "width"), height: numberAttr(value, "height") },
    tracks: value.children.filter((child) => child.name === "track").map(readTrack),
    transitions: value.children.filter((child) => child.name === "transition")
      .map((child) => readRelation(child) as NleTransition),
    mattes: value.children.filter((child) => child.name === "matte")
      .map((child) => readRelation(child) as NleMatte),
  };
}

function readSharedValue(value: XmlElement): NleSharedValue {
  attributes(value, ["id", "name", "owner"]);
  assertChildren(value, ["component", "operator", "picture-layout", "value"]);
  const common = { id: attr(value, "id"), name: attr(value, "name") };
  const owner = attr(value, "owner");
  if (owner === "component") {
    assertChildren(value, ["component", "value"]);
    const declaration = onlyChild(value, "component");
    attributes(declaration, ["package", "symbol", "slot"]);
    assertChildren(declaration, []);
    return {
      ...common,
      declaration: { kind: owner, component: packageSymbol(declaration), slot: attr(declaration, "slot") },
      value: jsonObject(onlyChild(value, "value")),
    };
  }
  if (owner === "operator") {
    assertChildren(value, ["operator", "value"]);
    const declaration = onlyChild(value, "operator");
    attributes(declaration, ["package", "symbol"]);
    assertChildren(declaration, []);
    return {
      ...common,
      declaration: { kind: owner, operator: packageSymbol(declaration) },
      value: jsonObject(onlyChild(value, "value")),
    };
  }
  if (owner === "nle") {
    assertChildren(value, ["picture-layout"]);
    const layout = onlyChild(value, "picture-layout");
    return {
      ...common,
      declaration: { kind: owner, slot: "picture.layout" },
      value: readLayout(layout) as NlePictureLayout,
    };
  }
  return fail(`<shared-value> owner ${owner} is invalid.`);
}

export function parseSvml(source: string): NleProject {
  const root = new XmlReader(source).read();
  element(root, "svml");
  attributes(root, ["id", "name", "root"]);
  assertChildren(root, ["shared-value", "composition"]);
  return {
    format: nleProjectFormat,
    id: attr(root, "id"),
    name: attr(root, "name"),
    rootComposition: attr(root, "root"),
    sharedValues: root.children.filter((child) => child.name === "shared-value").map(readSharedValue),
    compositions: root.children.filter((child) => child.name === "composition").map(readComposition),
  };
}

function escapeText(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value)
    .replace(/"/gu, "&quot;")
    .replace(/\t/gu, "&#9;")
    .replace(/\n/gu, "&#10;")
    .replace(/\r/gu, "&#13;");
}

function a(name: string, value: string | number | boolean | undefined): string {
  return value === undefined ? "" : ` ${name}="${escapeAttribute(String(value))}"`;
}

function exact(value: ExactTemporalValue): string {
  const result = exactTemporalRational(value);
  return `${result.numerator}/${result.denominator}`;
}

function json(value: Readonly<Record<string, unknown>>, depth: number, name = "parameters"): string {
  const indent = "  ".repeat(depth);
  return `${indent}<${name}>${escapeText(JSON.stringify(value))}</${name}>\n`;
}

function timeMapping(value: NleTimeMapping, depth: number, name: string): string {
  const indent = "  ".repeat(depth);
  let result = `${indent}<${name}>\n`;
  for (const piece of value.pieces) {
    if ("rate" in piece) {
      result += `${indent}  <linear${a("target-start", exact(piece.target.start))}${a("target-end", exact(piece.target.end))}`
        + `${a("source-start", exact(piece.sourceAtStart))}${a("rate", `${piece.rate.numerator}/${piece.rate.denominator}`)}`
        + `${a("wrap-start", piece.wrap === undefined ? undefined : exact(piece.wrap.start))}`
        + `${a("wrap-end", piece.wrap === undefined ? undefined : exact(piece.wrap.end))} />\n`;
    } else {
      result += `${indent}  <cubic${a("target-start", exact(piece.target.start))}${a("target-end", exact(piece.target.end))}`
        + `${a("source-start", exact(piece.sourceAtStart))}${a("source-control-1", exact(piece.sourceControl1))}`
        + `${a("source-control-2", exact(piece.sourceControl2))}${a("source-end", exact(piece.sourceAtEnd))} />\n`;
    }
  }
  return `${result}${indent}</${name}>\n`;
}

function parameterBinding(value: NleParameterBinding, depth: number): { readonly attribute: string; readonly body: string } {
  return value.kind === "shared"
    ? { attribute: a("parameters-ref", value.ref), body: "" }
    : { attribute: "", body: json(value.value, depth) };
}

function layout(value: NlePictureAppearance["layout"], depth: number): string {
  const indent = "  ".repeat(depth);
  if ("ref" in value) return `${indent}<layout${a("ref", value.ref)} />\n`;
  return `${indent}<layout${a("x", value.x)}${a("y", value.y)}${a("width", value.width)}`
    + `${a("height", value.height)}${a("fit", value.fit)}${a("content-x", value.contentX)}`
    + `${a("content-y", value.contentY)} />\n`;
}

function reconstruction(value: NleSignalReconstruction, depth: number): string {
  const indent = "  ".repeat(depth);
  return `${indent}<reconstruction${a("package", value.using.package)}${a("symbol", value.using.symbol)}>\n`
    + json(value.parameters, depth + 1)
    + `${indent}</reconstruction>\n`;
}

function printProcess(value: NleProcess, depth: number): string {
  const indent = "  ".repeat(depth);
  const parameters = parameterBinding(value.parameters, depth + 1);
  return `${indent}<process${a("id", value.id)}${a("package", value.operator.package)}${a("symbol", value.operator.symbol)}`
    + `${a("enabled", value.enabled)}${parameters.attribute}>\n${parameters.body}`
    + timeMapping(value.controlTime, depth + 1, "control-time")
    + `${indent}</process>\n`;
}

function picture(value: NlePictureAppearance, depth: number): string {
  const indent = "  ".repeat(depth);
  let result = `${indent}<picture>\n${layout(value.layout, depth + 1)}`;
  if (value.reconstruction !== undefined) result += reconstruction(value.reconstruction, depth + 1);
  for (const valueProcess of value.processes ?? []) result += printProcess(valueProcess, depth + 1);
  return `${result}${indent}</picture>\n`;
}

function audio(value: NleAudioAppearance, depth: number): string {
  const indent = "  ".repeat(depth);
  let result = `${indent}<audio>\n`;
  if (value.reconstruction !== undefined) result += reconstruction(value.reconstruction, depth + 1);
  for (const valueProcess of value.processes ?? []) result += printProcess(valueProcess, depth + 1);
  return `${result}${indent}</audio>\n`;
}

function present(value: NlePresentItem, depth: number): string {
  const indent = "  ".repeat(depth);
  let result = `${indent}<present${a("id", value.id)}${a("name", value.name)}${a("source", value.source)}`
    + `${a("role", value.source === "component" ? value.role : undefined)}`
    + `${a("start", exact(value.start))}${a("duration", exact(value.duration))}${a("enabled", value.enabled)}>\n`;
  if (value.source === "media") result += `${indent}  <media${a("path", value.asset.path)} />\n`;
  else if (value.source === "component") {
    result += `${indent}  <component${a("package", value.component.package)}${a("symbol", value.component.symbol)} />\n`;
    result += json(value.parameters, depth + 1);
    for (const binding of value.sharedValueBindings ?? []) {
      result += `${indent}  <shared${a("slot", binding.slot)}${a("ref", binding.ref)} />\n`;
    }
    for (const [name, media] of Object.entries(value.media ?? {})) {
      result += `${indent}  <media-input${a("name", name)}${a("path", media.path)} />\n`;
    }
  } else result += `${indent}  <composition${a("ref", value.composition)} />\n`;
  result += timeMapping(value.sourceTime, depth + 1, "source-time");
  if (value.picture !== undefined) result += picture(value.picture, depth + 1);
  if (value.audio !== undefined) result += audio(value.audio, depth + 1);
  return `${result}${indent}</present>\n`;
}

function adjust(value: Extract<NleItem, { readonly kind: "adjust" }>, depth: number): string {
  const indent = "  ".repeat(depth);
  const parameters = parameterBinding(value.parameters, depth + 1);
  return `${indent}<adjust${a("id", value.id)}${a("name", value.name)}${a("package", value.operator.package)}`
    + `${a("symbol", value.operator.symbol)}${a("start", exact(value.start))}${a("duration", exact(value.duration))}`
    + `${a("enabled", value.enabled)}${parameters.attribute}>\n${parameters.body}`
    + timeMapping(value.controlTime, depth + 1, "control-time")
    + `${indent}</adjust>\n`;
}

function track(value: NleTrack, depth: number): string {
  const indent = "  ".repeat(depth);
  let result = `${indent}<track${a("id", value.id)}${a("name", value.name)}${a("kind", value.kind)}`
    + `${a("role", value.role)}${a("enabled", value.enabled)}>\n`;
  for (const item of value.items) result += item.kind === "present" ? present(item, depth + 1) : adjust(item, depth + 1);
  return `${result}${indent}</track>\n`;
}

function relation(value: NleTransition | NleMatte, depth: number): string {
  const indent = "  ".repeat(depth);
  const transition = "outgoing" in value;
  const name = transition ? "transition" : "matte";
  let result = `${indent}<${name}${a("id", value.id)}`;
  result += transition
    ? `${a("outgoing", value.outgoing)}${a("incoming", value.incoming)}`
    : `${a("content", value.content)}${a("matte", value.matte)}`;
  result += `${a("package", value.operator.package)}${a("symbol", value.operator.symbol)}>\n`;
  result += json(value.parameters, depth + 1);
  return `${result}${indent}</${name}>\n`;
}

function composition(value: NleComposition, depth: number): string {
  const indent = "  ".repeat(depth);
  let result = `${indent}<composition${a("id", value.id)}${a("name", value.name)}`
    + `${a("width", value.canvas.width)}${a("height", value.canvas.height)}>\n`;
  for (const valueTrack of value.tracks) result += track(valueTrack, depth + 1);
  for (const transition of value.transitions) result += relation(transition, depth + 1);
  for (const matte of value.mattes) result += relation(matte, depth + 1);
  return `${result}${indent}</composition>\n`;
}

function sharedValue(value: NleSharedValue, depth: number): string {
  const indent = "  ".repeat(depth);
  let result = `${indent}<shared-value${a("id", value.id)}${a("name", value.name)}`
    + `${a("owner", value.declaration.kind)}>\n`;
  if (value.declaration.kind === "component") {
    result += `${indent}  <component${a("package", value.declaration.component.package)}`
      + `${a("symbol", value.declaration.component.symbol)}${a("slot", value.declaration.slot)} />\n`;
    result += json(value.value, depth + 1, "value");
  } else if (value.declaration.kind === "operator") {
    result += `${indent}  <operator${a("package", value.declaration.operator.package)}`
      + `${a("symbol", value.declaration.operator.symbol)} />\n`;
    result += json(value.value, depth + 1, "value");
  } else result += layout(value.value as NlePictureLayout, depth + 1).replace("<layout", "<picture-layout");
  return `${result}${indent}</shared-value>\n`;
}

export function printSvml(value: NleProject): string {
  let result = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  result += `<svml${a("id", value.id)}${a("name", value.name)}${a("root", value.rootComposition)}>\n`;
  for (const shared of value.sharedValues) result += sharedValue(shared, 1);
  for (const valueComposition of value.compositions) result += composition(valueComposition, 1);
  return `${result}</svml>\n`;
}
