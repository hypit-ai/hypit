# Hypit Studio

The single official Web Studio for SVML. It opens an explicit Run Source,
traces its Film or Render target back to the semantic and visual projections
Studio can edit, runs deterministic Producers only, and composites the
resulting Tracks with HyperFrames.

```bash
pnpm studio -- --run path/to/studio.svrun
```

Studio is an application boundary. Core and domain packages do not import it or
register UI metadata. Studio discovers the packages selected by the Source via
the same recursive mechanism as the official CLI, then applies its centralized
video-domain trace policy locally.

Opening Studio never invokes a Provider and never creates a Build. Every
projection needed for display must already be supplied by the Run or be
deterministically derivable from those supplied Candidates.
