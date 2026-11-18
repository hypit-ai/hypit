# @hypit/provider-hypihub

`createHypiHubEndpoints({ id, credential })` binds the implemented Capability contracts to a HypiHub OAuth
connection. Automated deployments can supply an API key with `createHypiHubEndpoints({ id, apiKey })`.
Configure capability selection and concurrency in the surrounding Execution Environment.
`openNodeHypiHubEnvironment` from `@hypit/hypit/execution/node` supplies the default local storage and
account limits.

## Connect a HypiHub account

Call `openNodeHypiHubOAuthConnection()` and check `connection.status()`. This reads the credential slot
without refreshing the token or contacting HypiHub. The Node host uses Keychain on macOS and Credential
Manager on Windows. On Linux, including WSL, it uses an owner-private JSON file under
`${XDG_DATA_HOME:-$HOME/.local/share}/hypit/credentials/hypihub/`. Linux files are unencrypted, with access
restricted to the owner by the filesystem. For WSL, keep this directory on the Linux filesystem.
Hosts can explicitly supply a `HypiHubOAuthStore` backed by another private store. Each store serializes
changes to its credential slot, including rotation across processes that use the same slot.

To connect an empty slot, call `beginNodeHypiHubAuthorization(connection)` and open its
`authorizationUrl` in a browser. Await `authorization.result` for the loopback redirect. If the browser
cannot reach localhost, pass the `code#state` shown on the callback page to
`authorization.submit(codeWithState)`. A host without a local listener can select `{ manual: true }`.
Call `authorization.cancel()` to stop waiting for a callback.

Pass the connected object to `openNodeHypiHubEnvironment({ credential: connection })`. The Provider
refreshes the shared token pair when needed and replaces it in the same slot. Call
`connection.disconnect()` to revoke the session and clear the slot. Give another account its own
connection slot and Environment identity so saved receipts keep their account context.
Jobs with a receipt wait for the connection within their existing recovery deadline.

The Hypit distribution exposes this connection on its shared local Host.

```sh
hypit auth login
hypit execution doctor --environment hypihub
hypit execution quote @hypit/gpt-image/gpt-image-2 --input request.json --json
```

`doctor` checks the credential and the account's model catalogue without rotating the token. `quote` returns
a service estimate when the request supplies the required billing inputs, and a pricing scheme with missing
inputs otherwise. The request file contains the same Model input accepted by `execution submit`.

## Supported capabilities

- Video jobs cover the five Seedance models, PixVerse V6 and C1, MiniMax H3, Grok Imagine Video and 1.5
  Preview, Bach 1.0 Pro and Volcengine portrait matting.
- Image jobs cover GPT Image 2, GPT Image 2.5 Flare and Sunburst, Nano Banana 2, 2 Lite and Pro, and
  Seedream 5 Lite and Pro. Text and edit operations select the matching service route.
- Direct responses cover Fish Audio and MiMo speech and WhisperX transcription. WhisperX uses the service's
  saved-transcription lookup when the response provides a durable receipt.

The adapter reads the selected account's model card before preparing or uploading inputs. Reference files
use HypiHub's negotiated upload transport, or the model's inline input format where required. Job submission
uses the Invocation ID as the idempotency key. Collection obtains fresh asset URLs with the job receipt and
streams the assets into the Invocation's Publication.
