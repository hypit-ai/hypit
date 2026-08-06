# `@svml/run`

The official human-readable frontend for one execution intention. It compiles a `.svrun` file into
three ordinary domain-neutral facts before Core starts:

```text
Run Graph[] + Satisfaction[] + Target[]
```

It is deliberately separate from both author source and deployment configuration:

- `.svml` says what the author means;
- `.svrun` says what this run demands and which explicit Candidates satisfy which outputs;
- `svml.runtime.json` says where and under which permissions the frozen plan executes.

```xml
<svrun version="1" source="./main.svml" targets="delivery">
  <target-set id="delivery">
    <target output="final.video" accepts="substitute"/>
  </target-set>

  <build-record id="opening" build="prior-build-id" output="opening-take"/>
  <satisfy output="opening-take" candidate="opening" fidelity="substitute"/>
</svrun>
```

`<value>` attaches a typed zero-input `StoredValue` from JSON. `<build-record>` extracts one typed
Record from a verified prior Build by its prior Logical Output id; it is independent of the current
output later named by `<satisfy>`. Neither is a Core Pin primitive. `<fragment>` instantiates a
trusted package-exported Run Fragment and may expose several Candidates backed by one shared
Operation:

```xml
<import from="@acme/preview" as="preview"/>
<fragment id="one-black-frame" using="preview:black-video">
  <input name="duration" from="opening.duration"/>
</fragment>
<satisfy output="opening.visual"
         candidate="one-black-frame.video"
         fidelity="substitute"/>
```

Two `<fragment>` declarations are two instances and therefore may execute twice. One declaration
with several exports is one instance and shares its internal Operations. Imports must form the
opening prologue and can resolve only Fragments exposed by explicitly activated trusted packages.

`.svrun` cannot declare credentials, Providers, Store paths, queues, Endpoint bindings or inline
execution callbacks.
