# `@hypit/generation`

Optional standard Products for generated audio, images and video. A generated set is an ordered,
non-empty collection of admitted Blob references. It has no universal maximum count: request count
belongs to the Model contract, and a narrower service quota belongs to the selected Endpoint.

Generation does not own a universal request envelope, input-port ontology, Model registry, Provider
choice, credential, queue or retry policy. Every Model package owns its complete canonical request
Type, validator, exact Capability and result Type. Core carries that request opaquely as the concrete
Need constraints.

## Model contract

`@hypit/generation/model` defines the small common shell around a model-owned request:

```ts
import { defineModelModule, standardGenerationResultTypes } from "@hypit/generation/model";

const model = defineModelModule({
  module: { name: "@owner/region-model", version: "1" },
  operations: [{
    key: "render",
    capabilityName: "region-model-v1",
    requestTypeName: "RegionRequest",
    producerName: "request-region-model-v1",
    returns: standardGenerationResultTypes.image,
    validateRequest(request) {
      // The Model validates its own arbitrary structured request here.
    },
  }],
});
```

The helper only emits the request Type, Capability, Producer and Need Fragment. Request-building
Producers and authoring Surfaces are ordinary Model-package code. A Model is not required to classify
its inputs as text, media or scalar.

Existing field-oriented packages may use `@hypit/generation/model-fields`. That subpath is an
optional authoring implementation, not the Generation protocol. Its builder never reaches an
Endpoint; only the complete Model-validated request does. `defineFieldModelModule()` layers its
draft, binding and finalize Producers on `defineModelModule()`; it does not declare a second model
facet or rebuild the request Capability separately.

A required scalar field may declare Model-owned `defaultItems`. It may then be absent from the
authoring draft, but request finalization inserts the value and every complete request carries it
explicitly. Provider mappings have no defaulting mechanism: deployments can rename or encode a
value, but cannot decide what an omitted Model field means. `defaultItems` is for unconditional
scalar defaults; context-dependent finalization remains ordinary Model-owned Producer logic.

An activated Model package contributes its Module Manifest once. Package and vocabulary views read
the Manifest's fully qualified Capabilities and result Types through the ordinary package loader;
there is no Model registry or discovery facet.

The standard media Products are also optional. A Model explicitly selects its result Type and, when
an authoring Fragment wants one artifact, the ordinary selector Producer it uses. Generation no
longer infers a result from a field table. `createFieldModelGenerationFragment()` lets a Model
Surface publish the complete result, an explicitly selected primary artifact, or both; the output
names and choice remain owned by that Surface.

## Provider adapter

Providers depend one way on the Model packages whose exact Capabilities they implement. They use the
Model's exported module identity and request contract; the Model never imports a Provider.

`@hypit/generation/provider` is an optional helper for the current field-map plus URL transport. It
is not required by custom multipart, provider-file-id, inline-byte or other adapters. Its two phases
keep pure projection separate from effects:

```ts
import { materializeWireRequest, planWireRequest } from "@hypit/generation/provider";

const plan = planWireRequest(mapping, completeRequest); // pure; Resources remain explicit
const wire = await materializeWireRequest(plan, resolveUrl); // upload/URL effect boundary
```

Route selection only chooses a service operation inside the already selected Endpoint. Request
support and service-specific limits run after deployment selection against the complete request.
They do not narrow the Model contract or cause fallback to another Provider.

Optional per-artifact fields must be carried either through `resourceFields` to transport or through
`fieldKeys` to the request body. Both `true` and `false` are values; omitted fields remain absent.
The pure planning phase rejects an unmapped supplied field before any Resource is uploaded.
