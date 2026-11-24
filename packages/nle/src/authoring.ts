import {
  addExactTemporalValues, compareExactTemporalValues, exactTemporalRational, exactTemporalValue, exactTemporalZero,
  subtractExactTemporalValues, type ExactTemporalValue, type TemporalRange, type TemporalRate,
} from "@hypit/temporal/algebra";
import { sealNleProject } from "./project.js";
import { nleLinearTimeMapping } from "./source-time.js";
import {
  defaultNleEditRate, nleProjectFormat, type NleComposition, type NleEditGroup, type NleItem, type NleMatte, type NleMediaItem, type NleComponentItem,
  type NlePresentItem, type NleProject, type NleSharedValue, type NleTrack, type NleTransition,
} from "./types.js";

type Declaration =
  | { readonly kind: "composition"; readonly value: NleComposition }
  | { readonly kind: "track"; readonly value: NleTrack }
  | { readonly kind: "item"; readonly value: NleItem }
  | { readonly kind: "transition"; readonly value: NleTransition }
  | { readonly kind: "matte"; readonly value: NleMatte }
  | { readonly kind: "group"; readonly value: NleEditGroup }
  | { readonly kind: "shared"; readonly value: NleSharedValue };
type Children = Declaration | readonly Children[] | null | undefined | false;

function collect(children: Children): Declaration[] {
  if (children === null || children === undefined || children === false) return [];
  if (Array.isArray(children)) return children.flatMap(collect);
  if (typeof children === "object" && "kind" in children) return [children];
  throw new Error("Expected a Composition Source declaration or a list of declarations.");
}

type ElementProps = { readonly children?: Children };
export function jsx<Props extends object>(component: (props: Props) => Declaration, props: Props | null, ...children: Children[]): Declaration {
  return component({ ...props, ...(children.length === 0 ? {} : { children }) } as Props);
}
export namespace jsx {
  export namespace JSX {
    export type Element = Declaration;
    export interface ElementChildrenAttribute { children: unknown }
  }
}

export function Composition({ children, id, name = id, width, height }:
  ElementProps & { readonly id: string; readonly name?: string; readonly width: number; readonly height: number }): Declaration {
  const tracks: NleTrack[] = [], transitions: NleTransition[] = [], mattes: NleMatte[] = [], groups: NleEditGroup[] = [];
  for (const entry of collect(children)) {
    switch (entry.kind) {
      case "track": tracks.push(entry.value); break;
      case "transition": transitions.push(entry.value); break;
      case "matte": mattes.push(entry.value); break;
      case "group": groups.push(entry.value); break;
      default: throw new Error(`Composition ${id} cannot contain ${entry.kind}.`);
    }
  }
  return { kind: "composition", value: { id, name, canvas: { width, height }, tracks, transitions, mattes, groups } };
}

export function Track({ children, id, kind, role, name = id, pictureEnabled = kind === "picture", audioEnabled = true }:
  ElementProps & Pick<NleTrack, "id" | "kind" | "role">
  & Partial<Pick<NleTrack, "name" | "pictureEnabled" | "audioEnabled">>): Declaration {
  const items = collect(children).map(entry => {
    if (entry.kind !== "item") throw new Error(`Track ${id} cannot contain ${entry.kind}.`);
    return entry.value;
  });
  return { kind: "track", value: { id, name, kind, role, pictureEnabled, audioEnabled, items } };
}

export function Item({ value }: { readonly value: NleItem }): Declaration { return { kind: "item", value }; }
export function Transition({ value }: { readonly value: NleTransition }): Declaration { return { kind: "transition", value }; }
export function Matte({ value }: { readonly value: NleMatte }): Declaration { return { kind: "matte", value }; }
export function Group({ value }: { readonly value: NleEditGroup }): Declaration { return { kind: "group", value }; }
export function SharedValue({ value }: { readonly value: NleSharedValue }): Declaration { return { kind: "shared", value }; }

type PresentProperties<T extends NlePresentItem> = Omit<T, "kind" | "source" | "start" | "duration" | "enabled" | "sourceTime"> & {
  readonly at: ExactTemporalValue;
  readonly duration: ExactTemporalValue;
  readonly sourceTime?: T["sourceTime"];
  readonly enabled?: boolean;
};
export function mediaItem({ at, duration, enabled = true, sourceTime = nleLinearTimeMapping(duration), ...props }:
  PresentProperties<NleMediaItem>): NleMediaItem {
  return { ...props, start: at, duration, enabled, sourceTime, kind: "present", source: "media" };
}
export function componentItem({ at, duration, enabled = true, sourceTime = nleLinearTimeMapping(duration), ...props }:
  PresentProperties<NleComponentItem>): NleComponentItem {
  return { ...props, start: at, duration, enabled, sourceTime, kind: "present", source: "component" };
}
export function Media(props: PresentProperties<NleMediaItem>): Declaration { return Item({ value: mediaItem(props) }); }
export function Component(props: PresentProperties<NleComponentItem>): Declaration { return Item({ value: componentItem(props) }); }

export type CompositionSource<Inputs> = (inputs: Inputs) => Children;
export function defineComposition<Inputs>(compose: CompositionSource<Inputs>): CompositionSource<Inputs> { return compose; }

/** Take a finite set of declarations through the normal NLE validator. No I/O or execution. */
export function materializeComposition<Inputs>(
  project: { readonly id: string; readonly name: string; readonly rootComposition: string; readonly editRate?: TemporalRate },
  compose: CompositionSource<Inputs>, inputs: Inputs,
): NleProject {
  const compositions: NleComposition[] = [], sharedValues: NleSharedValue[] = [];
  const declarations = compose(inputs);
  if (declarations && typeof declarations === "object" && "then" in declarations) {
    throw new Error("A Composition Source must return declarations synchronously.");
  }
  for (const entry of collect(declarations)) {
    if (entry.kind === "composition") compositions.push(entry.value);
    else if (entry.kind === "shared") sharedValues.push(entry.value);
    else throw new Error(`Project ${project.id} cannot contain ${entry.kind}.`);
  }
  return sealNleProject({ ...project, editRate: project.editRate ?? defaultNleEditRate, format: nleProjectFormat, compositions, sharedValues });
}

/** Exact seconds, either an integer/decimal string or an explicit rational. */
export function seconds(input: string): ExactTemporalValue {
  const fraction = /^(-?\d+)\/(\d+)$/u.exec(input);
  if (fraction !== null) return exactTemporalValue({ numerator: BigInt(fraction[1]!), denominator: BigInt(fraction[2]!) });
  const decimal = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(input);
  if (decimal === null) throw new Error(`Invalid exact seconds: ${input}.`);
  return exactTemporalValue({
    numerator: BigInt(decimal[1]! + decimal[2]! + (decimal[3] ?? "")),
    denominator: 10n ** BigInt(decimal[3]?.length ?? 0),
  });
}

/** Project a named source instant through one finite forward media placement. */
export function projectSourceInstant(source: ExactTemporalValue, placement: Pick<NlePresentItem, "start" | "duration" | "sourceTime">,
  label: string): ExactTemporalValue {
  const [piece] = placement.sourceTime.pieces;
  if (placement.sourceTime.pieces.length !== 1 || !piece || !("rate" in piece) || piece.wrap || piece.rate.numerator <= 0) {
    throw new Error(`${label}: choose a single forward affine placement for this source instant.`);
  }
  const offset = exactTemporalRational(subtractExactTemporalValues(source, piece.sourceAtStart));
  const elapsed = exactTemporalValue({
    numerator: offset.numerator * BigInt(piece.rate.denominator),
    denominator: offset.denominator * BigInt(piece.rate.numerator),
  });
  const local = addExactTemporalValues(piece.target.start, elapsed);
  if (compareExactTemporalValues(local, piece.target.start) < 0 || compareExactTemporalValues(local, piece.target.end) > 0) {
    throw new Error(`${label}: source instant is outside the selected take window.`);
  }
  return addExactTemporalValues(placement.start, local);
}

export function projectSourceRange(source: TemporalRange, placement: Pick<NlePresentItem, "start" | "duration" | "sourceTime">,
  label: string): TemporalRange {
  if (compareExactTemporalValues(source.start, source.end) > 0) throw new Error(`${label}: source range is reversed.`);
  return { start: projectSourceInstant(source.start, placement, `${label} start`), end: projectSourceInstant(source.end, placement, `${label} end`) };
}
