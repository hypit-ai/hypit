export type CanvasSnapBox = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type CanvasSnapRelation = {
  readonly axis: "x" | "y";
  readonly subjectAnchor: "start" | "center" | "end";
  readonly targetId: string;
  readonly targetAnchor: "start" | "center" | "end";
  readonly offset: number;
};

export type CanvasSnapState = {
  readonly x?: CanvasSnapRelation;
  readonly y?: CanvasSnapRelation;
};

export type CanvasSnapGuide = {
  readonly axis: "x" | "y";
  readonly coordinate: number;
  readonly start: number;
  readonly end: number;
};

export function resolveCanvasSnap(
  subject: CanvasSnapBox,
  targets: readonly CanvasSnapBox[],
  zoom: number,
  state?: CanvasSnapState,
): {
  readonly x: number;
  readonly y: number;
  readonly guides: readonly CanvasSnapGuide[];
  readonly state: CanvasSnapState;
};

export function findOpenCanvasPosition(
  subject: Omit<CanvasSnapBox, "id">,
  targets: readonly CanvasSnapBox[],
  viewport?: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  },
  gap?: number,
): { readonly x: number; readonly y: number };
