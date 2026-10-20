import type {
  Awaitable,
  SourceAssetResolver,
  SourceResolver,
  ResolvedSource,
} from "@hypit/source";
import type { BlobRef } from "@hypit/protocol";

export type BlobByteRange = { readonly start: number; readonly endExclusive: number };

/** Repeatably openable transfer bytes supplied by the selected Workspace. */
export type BlobAttachment = {
  readonly blob: BlobRef;
  /** Stable external address, when the Workspace supplies a file by reference. */
  readonly location?: string;
  open(): Awaitable<AsyncIterable<Uint8Array>>;
  /** Optional random access for preview playback; ranges use an exclusive end. */
  openRange?(range: BlobByteRange): Awaitable<AsyncIterable<Uint8Array>>;
};

/** One isolated, read-once definition session for exactly one compilation. */
export interface WorkspaceSession {
  readonly entry: ResolvedSource;
  readonly resolveSource: SourceResolver;
  readonly resolveAsset: SourceAssetResolver;
  attachments(): Awaitable<readonly BlobAttachment[]>;
}

/** Replaceable definition environment: filesystem, browser, Git, memory or remote workspace. */
export interface Workspace {
  open(entryLocator: string): Awaitable<WorkspaceSession>;
}

export class WorkspaceError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
    this.subject = subject;
  }
}
