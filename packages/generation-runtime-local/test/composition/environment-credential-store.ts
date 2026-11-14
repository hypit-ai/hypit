import type { CredentialRef, CredentialStore, CredentialValue } from "@hypit/execution-environment";
import { verifyCredentialRef } from "@hypit/execution-environment";

/** Focused test Store; Runtime tests must not depend on one selected adapter package. */
export class EnvironmentCredentialStore implements CredentialStore {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async resolve(ref: CredentialRef): Promise<CredentialValue | undefined> {
    verifyCredentialRef(ref);
    if (ref.store !== "env") return undefined;
    const secret = this.environment[ref.key];
    return secret === undefined || secret.length === 0 ? undefined : { secret };
  }
}
