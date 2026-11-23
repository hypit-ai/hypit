# Media owner and execution design

> Status: current owner design for the first implementation vertical slice.

## Purpose and authority

Media makes an explicitly accepted file usable without asking later consumers to guess what its bytes mean.
It separates four responsibilities:

1. **Media values** describe inspection, author selection and the resulting picture, audio and temporal
   interpretation;
2. **Media Asset** owns the durable project document that binds an accepted file to that interpretation and
   to independently owned Representations;
3. **Project Media Service** gives the project's Media Asset collection one shared open lifetime inside its
   ProjectHost;
4. **Media Executor** performs platform-dependent inspection and byte operations without owning project
   facts.

Media does not own NLE placement, audiovisual delivery, analysis semantics, Provider selection, generation
history or project automation. A transcript, object track, mask, depth field or camera motion document keeps
its own owner even when a Media Asset explicitly associates it with the accepted media.

## Facts and lifetimes

| Fact | Lifetime | Authority |
| --- | --- | --- |
| stream and container observation | one inspection Action | selected Media Executor |
| picture and audio selection | adoption or replacement Action | explicit caller |
| media interpretation | durable | Media Asset document |
| project adoption time | durable | Media Asset document |
| primary media and Representation files | durable ordinary files | Project Boundary and their declared owners |
| resolved byte/resource address | one Host or invocation lifetime | resolving Host |
| Media Catalog and open generation | ProjectHost lifetime | Project Media Service |
| thumbnails, waveforms and preview frames | rebuildable | consuming Host or Executor cache |

An accepted media file and its declared interpretation are author facts. The file system remains directly
authorable: a user, Agent or project program may edit or replace ordinary files and is responsible for that
choice. Hypit does not continuously prove that bytes and declarations agree.

## Media values

### Inspection observes; selection decides

A Media Executor may inspect a resource and return finite stream observations such as:

- stream index, media family, codec and container disposition;
- exact integer time base and presentation endpoints when the evidence establishes them;
- picture coded extent, sample aspect ratio, rotation, colour observation, bit depth and alpha observation;
- audio sample rate, channel observation and exact decoded or declared sample span when available.

Inspection does not choose the author's media. The caller supplies an explicit selection policy for picture
and audio members, including whether a missing member is accepted. When selected picture and audio spans
differ, the caller explicitly selects which member establishes the common media-local domain.

The interpretation operation closes the observation and selection into durable facts. An unsupported or
incomplete source reports the missing fact; the operation does not invent an estimated duration, silently
select another stream or fall back to a more expensive inspection mode.

### Interpretation is the durable narrow waist

`MediaInterpretation` contains no file path or execution resource handle. It may contain:

- an optional finite media-local temporal domain;
- either a constant Picture or a selected time-bearing Picture member;
- a selected Audio member;
- each time-bearing member's source presentation domain and exact relation into the media-local domain;
- the complete display interpretation required to understand selected picture samples.

A constant Picture intentionally has no clock or artificial one-frame duration. A time-bearing picture and
audio member preserve their independent presentation origins and gaps. A later NLE occurrence contributes a
separate occurrence-to-media relation; trim, retime, reverse, loop and hold never rewrite the source
interpretation.

`ResolvedMedia` is an invocation-local projection of one `MediaInterpretation` plus a Host-resolved address for
the primary bytes. Reopening a Media Asset reads its durable interpretation; each consumer resolves current resource
addresses for its invocation.

Exact temporal domains and relations are compact neutral foundation values shared with NLE and audiovisual
execution. Media owns their use for source members, not a second temporal algebra.

`selectMediaSourceWindow` reads the accepted interpretation and chooses an exact positive window in the Media
clock for a time-bearing member. A caller can select the full extent, or specify a source start and duration.
The resulting `{ start, end, duration }` uses Media-local coordinates. The member's own sampling domain and
possible presentation gaps remain represented by its map. A still Picture receives its duration from its placement.

## Media Asset document

### Address and file basis

A Media Asset is addressed by:

```text
Project Boundary + project-relative manifest path + Media Asset owner
```

The manifest path is the object identity. The document has no second top-level asset id. Owner-local ids name
subjects inside it, such as a Representation.

Project Media operations and Canvas use the project-relative manifest identity. SVML stores a pointer relative
to the SVML file and resolves it to that Project Media identity. Files declared inside a Media Asset use portable
paths relative to the manifest directory and resolve below it.

An illustrative document shape is:

```json
{
  "format": "hypit.media-asset",
  "media": {
    "adoptedAt": "2026-11-20T03:00:00.000Z",
    "file": {
      "path": "interview.mp4",
      "mediaType": "video/mp4"
    },
    "interpretation": {}
  },
  "representations": []
}
```

The exact schema lives beside the owner Reader. The format kind does not carry an assumed natural-number ABI.
The Media Asset Reader defines the current owner shape.
The required `media.adoptedAt` field records the Asset's acceptance into the project as a UTC timestamp
with millisecond precision.
An optional `media.displayName` provides the authored name of the Asset. A rename updates this field in place.
The manifest path continues to address the same Asset.

The document does not contain absolute paths, runtime resource handles, content hashes, Provider facts,
Invocation state, NLE occurrences or derived catalog data.

### Independently owned Representations

A Representation associates a package-owned document and explicit resources with the accepted media. Its full
identity is:

```text
Project Boundary + Media Asset manifest path + representation-local id
```

An illustrative declaration contains:

```ts
type MediaRepresentationDeclaration = {
  id: string;
  type: { package: string; name: string };
  document: MediaAssetFile;
  resources: Readonly<Record<string, MediaAssetFile>>;
  binding: {
    temporal?: { mapToMedia: TemporalMap };
    picture?: { member: "picture"; space: "media-display-normalized" };
    audio?: { member: "audio" };
  };
};
```

The npm package and owner-specific symbol identify the installed Reader. npm and the project lockfile own the
implementation version; Media does not copy that version into the symbol. A missing package leaves the
declaration intact and does not prevent opening the primary media. Attempting to use that Representation
produces a diagnostic naming the package, symbol and referring Media Asset.

Media owns only the bindings that cross the media boundary:

- a complete Representation-local to media-local temporal relation;
- normalized display coordinates after picture aspect and rotation interpretation;
- association with the selected audio member.

The Representation owner defines words, speakers, objects, masks, depth, poses, dense resource names, document
validation, editing and materialization. Media never adds a central union for those meanings and never runs an
Analyzer merely because a Representation is absent.

The author commands are direct:

- `representation.attach` requires a new local id;
- `representation.replace` replaces the complete declaration at an existing id;
- `representation.detach` removes the declaration.

They do not retain versions or history. Git and explicit project files preserve history when the author wants
it. Removing a declaration does not implicitly delete files.

## Media adoption and file actions

A user, Agent or explicit project program starts every adoption. The local-file path is:

```text
selected source file
  -> explicitly selected inspection mode
  -> Media inspection
  -> explicit picture/audio selection
  -> Media interpretation
  -> explicit copy or link policy
  -> atomic Media Asset publication
  -> Media Asset reference
```

Copy is the portable default. A link is accepted only when the declared file remains inside the asset's
portable manifest-relative file boundary. The action never overwrites an existing target unless the caller
selected a separate replacement operation.

The action may expose cancellation and finite `inspect`, `interpret`, `copy`, `publish` and `complete` progress
to its caller. Those values have invocation or frontend-session lifetime and never enter the Media Asset.
Files are staged before the manifest is published. The adoption Action stamps `media.adoptedAt` and publishes it
with the Asset in the same atomic manifest write.

The Node Project Media Service exposes the project-scoped local-file adoption Action. It chooses or validates a
portable manifest path below `media/`, serializes concurrent adoptions, invokes a caller-supplied Media Executor,
publishes the Media Asset and refreshes the one shared Catalog. CLI, Agent, native application and loopback HTTP
adapters reuse this Action; they differ only in how they acquire or stage the source file. The Media Asset package
does not depend on the local Executor: the composing Host supplies inspection and selection functions explicitly.

A Publication, Scene recording or NLE export enters Media through the same explicit adoption seam. The caller
chooses the target path and whether the completed output should become an accepted Media Asset. Completion by
the producing Executor does not adopt it automatically.

Hypit may provide a `replacePrimaryMedia` convenience Action that inspects a selected replacement and publishes
its file declaration and interpretation together. It is not the only legitimate way to edit the project. A
user or Agent may directly replace files or edit manifests. Hypit reads the resulting current files and does not
maintain a stale, needs-reacceptance or integrity state.

## Direct file editing and observation

The Media system deliberately has no content integrity programme:

- no content hash or fingerprint;
- no continuous byte-to-interpretation comparison;
- no automatic reinspection;
- no persistent resource revision or asset freshness state;
- no attempt to decide whether two byte sequences are the same creative asset.

A missing, unreadable or unsupported current file produces a direct diagnostic when observed or used. A
contradiction encountered by a concrete consumer is reported at that consumer boundary. The system does not
precompute a global consistency judgement.

File watching, when present, is an open-session hint used to invalidate derived observations and refresh
surfaces. It does not establish author truth. Losing a watcher event does not damage the project; reopening or
explicitly refreshing reads the current files.

Hypit-owned writes remain well formed: they stage files, publish atomically where the operating system permits,
avoid unintended overwrite and leave no partial manifest on cancellation. That guarantee describes one Action,
not permanent policing of author files.

## Project Media Service

The Project Media Service is the Media Asset owner's shared open collection inside one ProjectHost. Its
logical uniqueness is:

```text
ApplicationHost instance + Project Boundary
```

The corresponding ProjectHost constructs and closes that instance. NLE, Canvas, Scene, a Media Bench and an Agent
projection opened for that project share it across different product adapters and browser sessions. Its complete
Catalog is reconstructed from the project's Media Asset documents.

The Service may provide:

- one finite Catalog projection of the current `media/` collection;
- observation and subscription to completed Catalog generations;
- observation, revision-guarded edits and subscription for the project Media library tree;
- opening and resolving an explicit Media Asset;
- serialization of commands submitted through that Service;
- file watching and rebuildable in-memory caches;
- close semantics when the Host no longer needs the collection.

Commands may use an open-session generation to give a caller useful conflict feedback. Such a generation is
not a content hash, document version or durable author identity. The Service serializes its own callers; direct
external file edits remain valid author actions and are not brought under a distributed transaction.

The Catalog is a rebuildable projection. It may show references, adoption time, declared media family,
dimensions, duration, audio presence, availability and direct parse/read errors. It contains no consumer usage, reverse references,
NLE items, Canvas nodes, analysis state, execution history, version history or asset hashes. Deleting all
Media Service state and reopening the project must reconstruct the projection from ordinary project files.

### Project Media library

`media/library.json` owns the organization of accepted Project Media. Its root contains a tree of folders.
Folders have stable local IDs, names, required UTC creation times `createdAt`, children and Media Asset references.
Sibling folder names are unique. The Service sets the creation time in the folder creation command.
Each asset has at most one explicit placement; Catalog assets without a placement appear at the library root.
Empty folders persist. A reference whose manifest is absent remains visible in its folder as missing.

The Project Media Service reads the library from disk and serializes edits with adoption. Folder creation,
rename, reparenting, removal and asset placement each commit one library revision. Removing a folder moves its
direct contents to its parent and preserves nested folders. A name collision in the parent blocks the entire edit.
An adoption
may select a folder; after publishing the Asset, the Service places its reference there. The asset address,
signal interpretation and Catalog generation are independent of library edits. Library subscriptions
publish their own revision.

Asset edits use the current Catalog generation and run through the same Project Media Service write queue.
Asset removal requires a reference check from the composing caller. It removes the manifest and its library
placement, then refreshes the Catalog. Primary media files and Representation files remain in the Project.

The first Media implementation does not require a watcher, HTTP adapter, SQLite index, lease pool or resident
daemon. Direct Readers and Actions establish the first production path. The Service grows when a real Product
Host opens multiple concurrent Media consumers; those additions remain modules of the Media Asset release unit
unless an independent deployment boundary becomes real.

## Local Media Executor

The local implementation owns bounded process execution and the ffprobe/ffmpeg-specific interpretation of tool
output. It accepts an explicit resource or file and returns Media-owned observations or byte outputs. It does
not know the Project Boundary, Media Asset document, Catalog, NLE or Representation collection.

Inspection has two separate operations:

- **container-index inspection** reads exact integer timing declared by the container and is the normal bounded
  author-adoption path;
- **decoded-unit inspection** explicitly pays the cost of enumerating decoded units when the caller needs that
  evidence.

Author import uses the selected inspection mode. For generated Media adoption, the Media executor reads
the container index and uses decoded units when the primary stream lacks exact bounds. Still images
use a constant-picture interpretation. This is the generated-resource inspection policy.

Derived Media views consume one resolved resource, its accepted interpretation and a request on the Media clock.
Thumbnail and storyboard resolve Picture positions through the member mapping, then select exact decoded ordinals
against the stream's container timestamps. Local decoding can seek to an earlier keyframe and verifies every
output timestamp before returning the result. When verification cannot establish the selected frames, decoding uses
the original ordinals from the beginning. A storyboard returns a PNG atlas and a mapping from requested Media
samples to tiles. It samples the center of each equal time bucket. A picture request can specify a cover width
along with its height to render a centered crop at the requested dimensions. Waveform and short WAV audition consume the selected Audio member and preserve silence outside
its active interval. The local executor limits output size, work time and range. Studio supplies Catalog identity,
generation and temporary resource lifetime.

### Source preview cache

The Project Media Service accepts `media.source-preview` requests against a Media Asset identity and Catalog
generation. The local distribution binds one executor per open project. The executor receives the resolved
resource and accepted Picture or Audio interpretation. In-process callers can obtain a view lease directly.
Studio forwards the same operation over the project-bound Session transport. The lease exposes read-only resource
handles while the caller reads the results. Cache paths stay with Media Local.

Media Local stores disposable blocks under `.hypit/cache/media/`. Both presets use a grid anchored at zero on
the accepted Media clock:

- `filmstrip` takes sample positions and an optional density of 2, 4, 8, 16, 32 or 64 samples per second.
  The default is 2. Video blocks cover eight consecutive intervals at that density, clipped at the Media end.
  Each interval has a representative sample time and a tile address when the accepted Picture covers the sample.
  A still has one constant image. Picture blocks report the interpreted display aspect ratio.
- `waveform` takes block indices and a power-of-two PCM resolution. At each resolution, a block contains
  up to 512 numeric peaks on a 48 kHz clock. Callers choose the resolution from their display scale. Wider
  views of the same interval can read finer peaks. Contiguous misses at one resolution share one extraction.

A key includes file identity and change metadata, the selected stream and interpretation, the source duration,
the preset, the resolution, the block address and the encoding version. Source
replacement or an interpretation change selects fresh entries. Library organization, Item edits and viewport
position affect which blocks are read and leave their stored samples reusable.

Media Local coalesces in-flight requests for a key, verifies the source version and atomically stages complete
entries. A shared byte budget bounds retention. A miss can be rebuilt on demand. ProjectHost closure ends the
executor and resource handles. Completed cache entries can be read by the next ProjectHost.

## Cross-owner seams

- NLE stores a Media Asset Reference as an occurrence input and owns placement, trim, retime, processing and mix.
- Canvas or a Capability Invocation resolves an explicitly selected Media Asset or Representation as a typed
  input; the relationship does not trigger import or analysis.
- an Execution Environment Publication enters Media only through explicit adoption;
- semantic and analysis owners consume selected resolved media and offer completed Representation documents for
  explicit attachment or replacement;
- Scene and NLE outputs may be adopted as Media Assets, while their live Published Surfaces remain owned by
  their producing domains.

No cross-owner consumer mutates a Media Asset by editing its private in-memory projection. It submits a Media
command or performs an explicit project file edit.

## Source and release shape

The initial independent release boundaries are:

- `@hypit/media` — neutral inspection, selection, interpretation and resolved-media values;
- `@hypit/media-asset` — document, Reader, references, Representation commands and later Service modules;
- `@hypit/media-local` — platform-weighted local inspection and byte execution.

The Media Asset release may expose source subpaths such as `node`, `service` and `service/node`; those roles do
not create independent npm packages while they share one owner, compatibility promise and release lifecycle.
The local Executor depends on Media values, not on Media Asset. The root `@hypit/hypit` distribution selects and
composes both. A Project Host explicitly selects installed Representation packages; it never scans
`node_modules` and activates arbitrary code.

The intended dependency direction is:

```text
exact temporal foundation
          |
          v
    @hypit/media
       /       \
      v         v
@hypit/media-asset   @hypit/media-local
      \         /
       v       v
   @hypit/hypit Host composition
```

Media delivery, fonts, NLE adapters, analyzers, file-authoring tool suites and Generation adapters do not enter
these packages without their own owner and consumer evidence.

## First implementation and evidence

The first slice closes one real path:

```text
local image, audio or video
  -> inspect
  -> select
  -> adopt
  -> close process
  -> reopen Media Asset
  -> resolve only the primary media
```

The initial local product path also accepts a browser file as a bounded transport concern: the loopback adapter
streams one request body to a temporary file, calls the same project adoption Action and removes the temporary file.
Importing into Project Media and placing a Media reference into an NLE Composition remain two separate explicit
actions.

The first complete production path should demonstrate:

- selection preserves exact picture/audio presentation offsets and gaps;
- a Media Asset reopens without reinspection or stream reselection;
- resolving primary media leaves optional Representation files unopened;
- a missing Representation package preserves access to primary media and produces a precise use-time error;
- Representation temporal binding closes into the declared media-local domain;
- cancellation or failure publishes no partial asset;
- adoption does not overwrite an existing target;
- container-index inspection does not fall back to decoded-unit inspection;
- direct author file replacement requires no hash, freshness record or automatic reacceptance;
- the same accepted Media Asset can be consumed by the first NLE delivery path.

Project Catalog watching, Representation editors, analyzers and rich media file tools follow only when a current
production path has a concrete consumer for them.
