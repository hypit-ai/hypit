export type GenerationCanvasGraphReference = {
  /** Portable path relative to the Canvas View file. */
  readonly path: string;
};

export type GenerationCanvasSubject =
  | {
      readonly kind: "graph-node";
      readonly node: string;
    }
  | {
      /** One exact output address, whether its Build is active, finished or failed. */
      readonly kind: "build-output";
      readonly build: string;
      readonly output: string;
    };

export type GenerationCanvasItem = {
  readonly id: string;
  readonly subject: GenerationCanvasSubject;
  readonly x: number;
  readonly y: number;
};

/** Persistent presentation of one Generation Graph. It never changes recipe or execution semantics. */
export type GenerationCanvasView = {
  readonly format: "hypit.generation-canvas@1";
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly graph: GenerationCanvasGraphReference;
  readonly items: readonly GenerationCanvasItem[];
};
