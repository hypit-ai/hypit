import { once } from "node:events";
import { credentialRef } from "@hypit/execution-environment";
import { FileCredentialStore } from "../src/file.js";

const [directory, key, secret] = process.argv.slice(2);

async function place(): Promise<void> {
  const store = new FileCredentialStore(directory!);
  const release = once(process, "message");
  process.send!({ ready: true });
  await release;
  await store.put(credentialRef("file", key!), { secret: secret! });
  process.disconnect();
}

place().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
