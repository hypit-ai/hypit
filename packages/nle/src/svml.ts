import {
  exactTemporalRational,
  type ExactTemporalValue,
  type TemporalMapPiece,
} from "@hypit/temporal/algebra";
import {
  defaultNleEditRate,
  nleProjectFormat,
  type NleAudioAppearance,
  type NleComponentItem,
  type NleComposition,
  type NleItem,
  type NleMatte,
  type NleProcess,
  type NleProcessControlTime,
  type NleParameterBinding,
  type NlePictureAppearance,
  type NleMediaPictureAppearance,
  type NlePictureCrop,
  type NlePictureLayout,
  type NlePresentItem,
  type NleProject,
  type NleSharedValue,
  type NlePictureReconstruction,
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

class ClosedJsonReader {
  private offset = 0;

  public constructor(
    private readonly source: string,
    private readonly label: string,
  ) {}

  public readObject(): Readonly<Record<string, unknown>> {
    this.skipWhitespace();
    const result = this.value();
    this.skipWhitespace();
    if (this.offset !== this.source.length) this.invalid("contains content after its JSON value");
    if (result === null || typeof result !== "object" || Array.isArray(result)) {
      this.invalid("must contain a JSON object", 0);
    }
    return result as Readonly<Record<string, unknown>>;
  }

  private invalid(message: string, offset = this.offset): never {
    return fail(`${this.label} ${message} at character ${offset}.`);
  }

  private skipWhitespace(): void {
    while (this.source[this.offset] === " " || this.source[this.offset] === "\t"
      || this.source[this.offset] === "\n" || this.source[this.offset] === "\r") this.offset += 1;
  }

  private value(): unknown {
    this.skipWhitespace();
    const character = this.source[this.offset];
    if (character === "{") return this.object();
    if (character === "[") return this.array();
    if (character === '"') return this.string();
    if (character === "t") return this.keyword("true", true);
    if (character === "f") return this.keyword("false", false);
    if (character === "n") return this.keyword("null", null);
    return this.number();
  }

  private keyword(token: string, value: boolean | null): boolean | null {
    if (!this.source.startsWith(token, this.offset)) this.invalid(`contains invalid token`);
    this.offset += token.length;
    return value;
  }

  private string(): string {
    const start = this.offset;
    this.offset += 1;
    for (;;) {
      const character = this.source[this.offset];
      if (character === undefined) this.invalid("contains an unclosed JSON string", start);
      if (character === '"') {
        this.offset += 1;
        try {
          return JSON.parse(this.source.slice(start, this.offset)) as string;
        } catch {
          this.invalid("contains an invalid JSON string", start);
        }
      }
      if (character.charCodeAt(0) < 0x20) this.invalid("contains a control character in a JSON string");
      this.offset += 1;
      if (character !== "\\") continue;
      const escape = this.source[this.offset];
      if (escape === undefined || !'"\\/bfnrtu'.includes(escape)) this.invalid("contains an invalid JSON escape");
      this.offset += 1;
      if (escape !== "u") continue;
      const digits = this.source.slice(this.offset, this.offset + 4);
      if (!/^[0-9A-Fa-f]{4}$/u.test(digits)) this.invalid("contains an invalid JSON Unicode escape");
      this.offset += 4;
    }
  }

  private number(): number {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(this.source.slice(this.offset));
    if (match === null) this.invalid("expects a JSON value");
    this.offset += match[0].length;
    const result = Number(match[0]);
    if (!Number.isFinite(result)) this.invalid("contains a non-finite JSON number", this.offset - match[0].length);
    return result;
  }

  private array(): readonly unknown[] {
    this.offset += 1;
    const result: unknown[] = [];
    this.skipWhitespace();
    if (this.source[this.offset] === "]") {
      this.offset += 1;
      return result;
    }
    for (;;) {
      result.push(this.value());
      this.skipWhitespace();
      if (this.source[this.offset] === "]") {
        this.offset += 1;
        return result;
      }
      if (this.source[this.offset] !== ",") this.invalid("expects a comma between JSON array values");
      this.offset += 1;
    }
  }

  private object(): Readonly<Record<string, unknown>> {
    this.offset += 1;
    const result: Record<string, unknown> = {};
    const names = new Set<string>();
    this.skipWhitespace();
    if (this.source[this.offset] === "}") {
      this.offset += 1;
      return result;
    }
    for (;;) {
      this.skipWhitespace();
      if (this.source[this.offset] !== '"') this.invalid("expects a quoted JSON object name");
      const nameOffset = this.offset;
      const name = this.string();
      if (names.has(name)) this.invalid(`repeats JSON object name ${JSON.stringify(name)}`, nameOffset);
      names.add(name);
      this.skipWhitespace();
      if (this.source[this.offset] !== ":") this.invalid("expects a colon after a JSON object name");
      this.offset += 1;
      const member = this.value();
      Object.defineProperty(result, name, {
        configurable: true,
        enumerable: true,
        value: member,
        writable: true,
      });
      this.skipWhitespace();
      if (this.source[this.offset] === "}") {
        this.offset += 1;
        return result;
      }
      if (this.source[this.offset] !== ",") this.invalid("expects a comma between JSON object members");
      this.offset += 1;
    }
  }
}

function jsonObject(value: XmlElement): Readonly<Record<string, unknown>> {
  if (value.children.length > 0) fail(`<${value.name}> accepts JSON text only.`);
  return new ClosedJsonReader(value.text, `<${value.name}>`).readObject();
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

function readTimeMapping(value: XmlElement, optional: readonly string[] = []): NleTimeMapping {
  attributes(value, [], optional);
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

function readReconstruction(value: XmlElement): NlePictureReconstruction {
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
    controlTime: readProcessTime(onlyChild(value, "control-time")),
  };
}

function readProcessTime(value: XmlElement): NleProcessControlTime {
  const edge = optionalAttr(value, "edge");
  if (edge !== undefined) {
    attributes(value, ["edge", "duration", "control-duration"]);
    assertChildren(value, []);
    if (edge !== "start" && edge !== "end") fail("<control-time> edge must be start or end.");
    return {
      edge,
      duration: time(attr(value, "duration"), "Control placement duration"),
      controlDuration: time(attr(value, "control-duration"), "Control duration"),
    };
  }
  const mapping = readTimeMapping(value, ["control-duration"]);
  const duration = optionalAttr(value, "control-duration");
  return duration === undefined ? mapping : { ...mapping, controlDuration: time(duration, "Control duration") };
}

function readPicture(value: XmlElement, media: boolean): NleMediaPictureAppearance {
  attributes(value, []);
  assertChildren(value, media ? ["crop", "layout", "reconstruction", "process"] : ["crop", "layout", "process"]);
  const crop = optionalChild(value, "crop");
  const sampling = media ? optionalChild(value, "reconstruction") : undefined;
  return {
    layout: readLayout(onlyChild(value, "layout")),
    ...(crop === undefined ? {} : { crop: readCrop(crop) }),
    ...(sampling === undefined ? {} : { reconstruction: readReconstruction(sampling) }),
    ...(value.children.some((child) => child.name === "process") ? {
      processes: value.children.filter((child) => child.name === "process").map(readProcess),
    } : {}),
  };
}

function readCrop(value: XmlElement): NlePictureCrop {
  const sides = ["left", "top", "right", "bottom"] as const;
  attributes(value, [], sides);
  assertChildren(value, []);
  return Object.fromEntries(sides.flatMap(side => optionalAttr(value, side) === undefined ? [] : [[side, numberAttr(value, side)]]));
}

function readAudio(value: XmlElement): NleAudioAppearance {
  attributes(value, []);
  assertChildren(value, ["process"]);
  const processes = value.children.map(readProcess);
  return processes.length === 0 ? {} : { processes };
}

function readPresent(value: XmlElement): NlePresentItem {
  attributes(value, ["id", "source", "start", "duration", "enabled"], ["name"]);
  assertChildren(value, [
    "source-time", "media", "component", "composition", "parameters", "value", "media-input", "picture", "audio",
  ]);
  const source = attr(value, "source");
  const picture = optionalChild(value, "picture");
  const base = {
    id: attr(value, "id"),
    ...(optionalAttr(value, "name") === undefined ? {} : { name: attr(value, "name") }),
    kind: "present" as const,
    start: time(attr(value, "start"), `Present ${attr(value, "id")} start`),
    duration: time(attr(value, "duration"), `Present ${attr(value, "id")} duration`),
    enabled: booleanAttr(value, "enabled"),
    sourceTime: readTimeMapping(onlyChild(value, "source-time")),
    ...(picture === undefined ? {} : { picture: readPicture(picture, source === "media") }),
  };
  const audio = optionalChild(value, "audio");
  if (source === "media") {
    assertChildren(value, ["source-time", "media", "picture", "audio"]);
    const media = onlyChild(value, "media");
    attributes(media, ["path"]);
    assertChildren(media, []);
    return {
      ...base, source, asset: { path: attr(media, "path") },
      ...(audio === undefined ? {} : { audio: readAudio(audio) }),
    };
  }
  if (source === "component") {
    assertChildren(value, ["source-time", "component", "parameters", "value", "media-input", "picture"]);
    const component = onlyChild(value, "component");
    attributes(component, ["package", "symbol"]);
    assertChildren(component, []);
    const bindings = value.children.filter((child) => child.name === "value").map((binding) => {
      attributes(binding, ["slot"], ["ref"]);
      const ref = optionalAttr(binding, "ref");
      return ref === undefined
        ? { slot: attr(binding, "slot"), kind: "inline" as const, value: jsonObject(binding) }
        : (() => {
            assertChildren(binding, []);
            return { slot: attr(binding, "slot"), kind: "shared" as const, ref };
          })();
    });
    const media = value.children.filter((child) => child.name === "media-input").map((input) => {
      attributes(input, ["name", "path"]);
      assertChildren(input, []);
      return [attr(input, "name"), { path: attr(input, "path") }] as const;
    });
    const mediaNames = new Set<string>();
    for (const [name] of media) {
      if (mediaNames.has(name)) fail(`<present> repeats Media input ${name}.`);
      mediaNames.add(name);
    }
    return {
      ...base,
      source,
      component: packageSymbol(component),
      parameters: jsonObject(onlyChild(value, "parameters")),
      ...(bindings.length === 0 ? {} : { valueBindings: bindings }),
      ...(media.length === 0 ? {} : { media: Object.fromEntries(media) }),
    };
  }
  if (source === "composition") {
    assertChildren(value, ["source-time", "composition", "picture", "audio"]);
    const composition = onlyChild(value, "composition");
    attributes(composition, ["ref"]);
    assertChildren(composition, []);
    return {
      ...base, source, composition: attr(composition, "ref"),
      ...(audio === undefined ? {} : { audio: readAudio(audio) }),
    };
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
  attributes(value, ["id", "name", "kind", "role", "picture-enabled", "audio-enabled"]);
  assertChildren(value, ["present", "adjust"]);
  const role = attr(value, "role");
  if (role !== "picture" && role !== "audio" && role !== "subtitle"
      && role !== "text" && role !== "filter" && role !== "effect") {
    fail(`<track> role ${role} is invalid.`);
  }
  return {
    id: attr(value, "id"),
    name: attr(value, "name"),
    kind: attr(value, "kind") as NleTrack["kind"],
    role,
    pictureEnabled: booleanAttr(value, "picture-enabled"),
    audioEnabled: booleanAttr(value, "audio-enabled"),
    items: value.children.map((child) => child.name === "present" ? readPresent(child) : readAdjust(child)),
  };
}

function readTransition(value: XmlElement): NleTransition {
  attributes(value, ["id", "outgoing", "incoming", "package", "symbol"]);
  assertChildren(value, ["parameters"]);
  return { id: attr(value, "id"), outgoing: attr(value, "outgoing"), incoming: attr(value, "incoming"),
    operator: packageSymbol(value), parameters: jsonObject(onlyChild(value, "parameters")) };
}

function readMatte(value: XmlElement): NleMatte {
  attributes(value, ["id", "content", "matte"]);
  assertChildren(value, []);
  return { id: attr(value, "id"), content: attr(value, "content"), matte: attr(value, "matte") };
}

function readComposition(value: XmlElement): NleComposition {
  attributes(value, ["id", "name", "width", "height"]);
  assertChildren(value, ["track", "transition", "matte", "group"]);
  return {
    id: attr(value, "id"),
    name: attr(value, "name"),
    canvas: { width: numberAttr(value, "width"), height: numberAttr(value, "height") },
    tracks: value.children.filter((child) => child.name === "track").map(readTrack),
    transitions: value.children.filter((child) => child.name === "transition").map(readTransition),
    mattes: value.children.filter((child) => child.name === "matte").map(readMatte),
    groups: value.children.filter((child) => child.name === "group").map(group => {
      attributes(group, ["id"]);
      assertChildren(group, ["member"]);
      return { id: attr(group, "id"), items: group.children.map(member => {
        attributes(member, ["item"]);
        assertChildren(member, []);
        return attr(member, "item");
      }) };
    }),
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
  attributes(root, ["id", "name", "root"], ["edit-rate"]);
  assertChildren(root, ["shared-value", "composition"]);
  const editRate = optionalAttr(root, "edit-rate");
  return {
    format: nleProjectFormat,
    id: attr(root, "id"),
    name: attr(root, "name"),
    rootComposition: attr(root, "root"),
    editRate: editRate === undefined ? defaultNleEditRate : rate(editRate, "SVML edit-rate"),
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

function timeMapping(value: NleTimeMapping, depth: number, name: string, controlDuration?: ExactTemporalValue): string {
  const indent = "  ".repeat(depth);
  let result = `${indent}<${name}${a("control-duration", controlDuration === undefined ? undefined : exact(controlDuration))}>\n`;
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

function reconstruction(value: NlePictureReconstruction, depth: number): string {
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
    + printProcessTime(value.controlTime, depth + 1)
    + `${indent}</process>\n`;
}

function printProcessTime(value: NleProcessControlTime, depth: number): string {
  if ("pieces" in value) return timeMapping(value, depth, "control-time", value.controlDuration);
  return `${"  ".repeat(depth)}<control-time${a("edge", value.edge)}${a("duration", exact(value.duration))}`
    + `${a("control-duration", exact(value.controlDuration))} />\n`;
}

function picture(value: NleMediaPictureAppearance, depth: number): string {
  const indent = "  ".repeat(depth);
  let result = `${indent}<picture>\n`;
  const crop = value.crop;
  if (crop !== undefined) {
    result += `${indent}  <crop${a("left", crop.left)}${a("top", crop.top)}${a("right", crop.right)}${a("bottom", crop.bottom)} />\n`;
  }
  result += layout(value.layout, depth + 1);
  if (value.reconstruction !== undefined) result += reconstruction(value.reconstruction, depth + 1);
  for (const valueProcess of value.processes ?? []) result += printProcess(valueProcess, depth + 1);
  return `${result}${indent}</picture>\n`;
}

function audio(value: NleAudioAppearance, depth: number): string {
  const indent = "  ".repeat(depth);
  let result = `${indent}<audio>\n`;
  for (const valueProcess of value.processes ?? []) result += printProcess(valueProcess, depth + 1);
  return `${result}${indent}</audio>\n`;
}

function present(value: NlePresentItem, depth: number): string {
  const indent = "  ".repeat(depth);
  let result = `${indent}<present${a("id", value.id)}${a("name", value.name)}${a("source", value.source)}`
    + `${a("start", exact(value.start))}${a("duration", exact(value.duration))}${a("enabled", value.enabled)}>\n`;
  if (value.source === "media") result += `${indent}  <media${a("path", value.asset.path)} />\n`;
  else if (value.source === "component") {
    result += `${indent}  <component${a("package", value.component.package)}${a("symbol", value.component.symbol)} />\n`;
    result += json(value.parameters, depth + 1);
    for (const binding of value.valueBindings ?? []) {
      result += binding.kind === "shared"
        ? `${indent}  <value${a("slot", binding.slot)}${a("ref", binding.ref)} />\n`
        : `${indent}  <value${a("slot", binding.slot)}>${escapeText(JSON.stringify(binding.value))}</value>\n`;
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
    + `${a("role", value.role)}${a("picture-enabled", value.pictureEnabled)}${a("audio-enabled", value.audioEnabled)}>\n`;
  for (const item of value.items) result += item.kind === "present" ? present(item, depth + 1) : adjust(item, depth + 1);
  return `${result}${indent}</track>\n`;
}

function transition(value: NleTransition, depth: number): string {
  const indent = "  ".repeat(depth);
  return `${indent}<transition${a("id", value.id)}${a("outgoing", value.outgoing)}${a("incoming", value.incoming)}`
    + `${a("package", value.operator.package)}${a("symbol", value.operator.symbol)}>\n`
    + json(value.parameters, depth + 1) + `${indent}</transition>\n`;
}

function composition(value: NleComposition, depth: number): string {
  const indent = "  ".repeat(depth);
  let result = `${indent}<composition${a("id", value.id)}${a("name", value.name)}`
    + `${a("width", value.canvas.width)}${a("height", value.canvas.height)}>\n`;
  for (const valueTrack of value.tracks) result += track(valueTrack, depth + 1);
  for (const entry of value.transitions) result += transition(entry, depth + 1);
  for (const matte of value.mattes) result += `${indent}  <matte${a("id", matte.id)}${a("content", matte.content)}${a("matte", matte.matte)} />\n`;
  for (const group of value.groups) {
    result += `${indent}  <group${a("id", group.id)}>\n`;
    for (const item of group.items) result += `${indent}    <member${a("item", item)} />\n`;
    result += `${indent}  </group>\n`;
  }
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
  const { numerator, denominator } = value.editRate;
  const grid = numerator === defaultNleEditRate.numerator && denominator === defaultNleEditRate.denominator
    ? "" : a("edit-rate", `${numerator}/${denominator}`);
  result += `<svml${a("id", value.id)}${a("name", value.name)}${a("root", value.rootComposition)}${grid}>\n`;
  for (const shared of value.sharedValues) result += sharedValue(shared, 1);
  for (const valueComposition of value.compositions) result += composition(valueComposition, 1);
  return `${result}</svml>\n`;
}
