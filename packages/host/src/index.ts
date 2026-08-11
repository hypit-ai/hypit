import type {
  AuthorSourceAssetResolver,
  AuthorSourceResolver,
  AuthorSourceUnit,
  Awaitable,
} from "@narratage/elaborator";
import type { BlobRef } from "@narratage/protocol";

export type { HostFacet } from "./facet.js";

/**
 * Repeatably openable Host transfer bytes. Their origin is deliberately absent
 * from the Runtime contract; Runtime verifies the opened stream against the
 * declared BlobRef before admitting a Build.
 */
export type ArtifactAttachment = {
  readonly artifact: BlobRef;
  open(): Awaitable<AsyncIterable<Uint8Array>>;
};

/** One isolated, read-once definition session for exactly one compilation. */
export interface WorkspaceSession {
  readonly entry: AuthorSourceUnit;
  readonly resolveSource: AuthorSourceResolver;
  readonly resolveAsset: AuthorSourceAssetResolver;
  attachments(): Awaitable<readonly ArtifactAttachment[]>;
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
