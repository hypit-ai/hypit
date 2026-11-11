import type {
  GenerationAuthoringMediaListEntry,
  GenerationAuthoringMediaRole,
  GenerationAuthoringPort,
  GenerationAuthoringVariant,
  GenerationNodeAuthoringShape,
} from "@hypit/generation-graph";

type CanvasAuthoringEditor = Pick<GenerationNodeAuthoringShape, "controls" | "ports" | "variant">;
type CanvasAuthoringNode = { readonly inputs: Readonly<Record<string, any>> };

export type CanvasAuthoringConnection = {
  readonly port: GenerationAuthoringPort;
  readonly role: GenerationAuthoringMediaRole;
  readonly entry?: GenerationAuthoringMediaListEntry;
  readonly variant?: { readonly input: string; readonly value: string };
  readonly replacement?: true;
};

export function activeAuthoringVariant(
  editor: CanvasAuthoringEditor,
  node: CanvasAuthoringNode,
): GenerationAuthoringVariant | undefined;
export function activeAuthoringPorts(
  editor: CanvasAuthoringEditor | undefined,
  node: CanvasAuthoringNode,
): readonly GenerationAuthoringPort[];
export function authoringVariantInputs(
  editor: CanvasAuthoringEditor | undefined,
  node: CanvasAuthoringNode,
  value: string,
): Readonly<Record<string, any>>;
export function authoringPortBindingCount(port: GenerationAuthoringPort, node: CanvasAuthoringNode): number;
export function authoringPortCanAccept(port: GenerationAuthoringPort, node: CanvasAuthoringNode): boolean;
export function compatibleAuthoringConnections(
  node: CanvasAuthoringNode,
  ports: readonly GenerationAuthoringPort[],
  sourceRoles: readonly GenerationAuthoringMediaRole[],
): readonly CanvasAuthoringConnection[];
export function replaceableAuthoringConnections(
  node: CanvasAuthoringNode,
  ports: readonly GenerationAuthoringPort[],
  sourceRoles: readonly GenerationAuthoringMediaRole[],
): readonly CanvasAuthoringConnection[];
export function authoringBindingInputKeys(
  editor: CanvasAuthoringEditor | undefined,
  node: CanvasAuthoringNode,
  input: string,
): readonly string[];
export function automaticAuthoringConnection(
  editor: CanvasAuthoringEditor | undefined,
  node: CanvasAuthoringNode,
  sourceRoles: readonly GenerationAuthoringMediaRole[],
): CanvasAuthoringConnection | undefined;
