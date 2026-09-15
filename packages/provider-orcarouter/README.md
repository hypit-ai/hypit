# `@hypit/provider-orcarouter`

First-class OrcaRouter Provider for the Hypit Runtime. [OrcaRouter](https://www.orcarouter.ai) is an
OpenAI-compatible AI gateway: one endpoint serves many vendors’ models with adaptive routing,
failover and gateway-level guardrails. This Provider offers the `chat` capability, fulfilled by the
models the configured account may call.

## Two ways in, one credential

The Endpoint declares one credential slot, `apiKey`, with two explicit entry points:

| Choice | Where it appears | What it stores |
| --- | --- | --- |
| `OrcaRouter - API` | the key field on the account panel, or `hypit auth login orcarouter.default` | a key the user already holds, pasted as `sk-orca-…` |
| `OrcaRouter - Auth` | the Connect button on the account panel, or the declared `oauth2-pkce` acquisition | a key minted by the OrcaRouter consent screen |

Both end at the same ordinary OrcaRouter API key, held in the Credential Store the selected Runtime
Profile declares. `packages/provider-orcarouter/src/credentials.ts` owns the one credential interface
and its two adapters; nothing downstream of `token()` knows which one produced the key.

## Endpoints

| Purpose | Base |
| --- | --- |
| Inference and model catalogue | `https://api.orcarouter.ai/v1` |
| Authorization and code exchange | `https://www.orcarouter.ai` (`/auth`, `/api/v1/auth/keys`) |

The relay is at `/v1`; authentication is not. Neither base is derived from the other. A self-hosted
deployment may set `ORCA_BASE_URL` for one shared origin, or `ORCA_AUTH_BASE_URL` and
`ORCA_API_BASE_URL` separately; an explicit override wins. Non-loopback origins must use HTTPS.

## Authorization flow

The declared acquisition uses the out-of-band flow: `callback_url=oob` with `S256` mandatory. A code
displayed to a person is redeemable only with the verifier, which never leaves the process. Auth
codes are single-use with a ten minute lifetime. The exchange returns a **durable key, not a
refreshable token pair** — there is no refresh grant, and the key is reused until the user revokes it
at `https://www.orcarouter.ai/console/authorized-apps`. A `401` from the relay marks the exact
credential generation that made the request as needing authorization; it never triggers a refresh.

## Model catalogue

`GET /v1/models` on the inference base is the only source of truth. Nothing here infers a capability
from a model’s name: the text control accepts entries whose `supported_endpoint_types` include a
chat-capable type and exclude the non-chat ones, and the image-input control additionally requires
the entry to declare `image` in `architecture.input_modalities` (an entry that declares nothing fails
closed). The catalogue read is bounded in time, bytes, item count and accepted field shapes.

When live discovery succeeds it is authoritative and no seed entry is mixed in. When it fails, the
small verified seed in `src/catalog.ts` keeps a fresh installation usable and is reported as
degraded; it keeps its context and reasoning-effort metadata, including the verified
`low`/`medium`/`high`/`xhigh` ladder for `openai/gpt-5.5`.

## Configuration

```json
{
  "orcarouter.default": {
    "use": "@hypit/provider-orcarouter",
    "config": { "apiKey": { "store": "os", "key": "orcarouter.apiKey" } }
  }
}
```

`baseUrl`, `authBaseUrl`, `defaultConcurrency` and the two request timeouts are optional. The
Provider declares its published pricing page; it does not copy or interpret OrcaRouter rates.
