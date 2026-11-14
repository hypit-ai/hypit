import type { ProjectObjectRef } from "@hypit/project";

export type ProjectBenchRequest = {
  readonly projectRoot: string;
  readonly object: ProjectObjectRef;
};

export type ProjectBenchSurface = {
  readonly kind: "web";
  readonly url: string;
};

/** One invocation-local surface; closing it changes no author document. */
export type ProjectBenchSession = {
  readonly title: string;
  readonly surface: ProjectBenchSurface;
  close(): void | Promise<void>;
};

/** One independently contributed opener for exact Project Object formats. */
export type ProjectBench = {
  readonly id: string;
  readonly label: string;
  readonly formats: readonly string[];
  open(request: ProjectBenchRequest): ProjectBenchSession | Promise<ProjectBenchSession>;
};

export type ProjectBenchDescriptor = {
  readonly id: string;
  readonly label: string;
};

export type ProjectBenchHost = {
  readonly available: (object: ProjectObjectRef) => readonly ProjectBenchDescriptor[];
  readonly open: (bench: string, request: ProjectBenchRequest) => Promise<ProjectBenchSession>;
};
