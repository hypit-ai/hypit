# Human base meshes

`standard-male.glb` and `standard-female.glb` are exported from Blender Studio's
**Human Base Meshes v1.4.1**, specifically the `Primitive Body (Realistic)` asset
collections. Blender publishes the bundle under CC0 1.0:

- https://www.blender.org/download/demo-files/
- https://download.blender.org/demo/asset-bundles/human-base-meshes/

The exact Blender collection names used by the exporter are:

- `Body Male - Primitve (Realistic)` (the source bundle keeps this spelling);
- `Body Female - Primitve (Realistic)` (the source bundle keeps this spelling).

The GLBs keep the unsubdivided control cages, use flat polygon normals and one
neutral material, and preserve the source body-part hierarchy. The realistic
adult cages measure about 7.22 heads for the male and 7.39 for the female; the
rejected stylized cages measured only about 5.8 heads and read as juvenile.
Useful pivots are
annotated with `hypitRigRole` extras by
`packages/scene/scripts/export-blender-human-bases.py`.

The exported Seedance proxy face is intentionally less descriptive than the
source asset. Eyes, eyelids, ears, and the separate nose bridge are omitted;
the exported head is reduced to roughly 72 triangles and the remaining nose to
roughly 18. Flat shading makes the head direction readable without supplying a
placeholder identity that the video model may imitate. Separately modeled
fingers, thumbs, and toes are also omitted: hands and feet remain readable
masses for pose and contact without asking the generated character to inherit
placeholder digit anatomy.

These are source models for local Scene Assets, not framework primitives. Body
shape variants should be derived from these anatomical bases instead of being
reconstructed from unrelated cylinders and spheres. Adult variants retain the
realistic base's landmarks and joint placement; child and intentionally
stylized characters use an age-appropriate base rather than scaling an adult.

`generate-example-scene-assets.mjs` currently derives the slim, athletic,
full, adolescent, elder, and pregnant examples directly from these GLBs. The
offline deformation changes named body-part envelopes and joint offsets while
preserving the source polygon planes, hierarchy, and pivots. It produces new
ordinary `model.glb` and standing `preview.glb` files; the Scene Asset format
does not need a special body-generator concept. Child and toddler examples are
deliberately not included in that derivation until an age-appropriate source
base is added.

## Useful bundle references

Inspection of the v1.4.1 `.blend` establishes the following source facts:

- `Body Male - Primitve (Realistic)` has 49 objects, 4,570 vertices, and 4,504
  polygons before subdivision. The female equivalent has 50 objects, 4,674
  vertices, and 4,604 polygons.
- The primitive bodies are pelvis-rooted object hierarchies with useful origins
  at shoulders, elbows, wrists, hips, knees, ankles, neck, and head. In the male
  asset, 20 of 21 inspected left/right pairs share mesh data.
- `Head - Generic Topology` has 318 vertices and 316 polygons. Its source shape
  keys are `Real_MALE`, `Real_FEMALE`, `Real_Kid`, `Toon_MALE`, `Toon_FEMALE`,
  `Toon_Anime_Kid`, `Toon Animal`, `Ork`, and `Suzanne`.
- `Head - Planar` uses the same 318-vertex base density with multiresolution
  facial planes. It is a form reference for low-poly faces, not a runtime
  subdivision requirement.
- The continuous realistic body has 10,582 body vertices plus separate eyes.
  `Head (Animation) - Realistic` and `Head (Sculpting) - Realistic` use distinct
  topologies for deformation and evenly distributed sculpting respectively.
- `Skeleton - Realistic` contains 135 mesh objects and about 33k base polygons.
  It is an anatomical landmark reference from which a lighter pivot skeleton
  can be derived, not an example Scene Asset to ship as-is.

Blender Studio's accompanying workflow guidance recommends an evenly
distributed quad base, real-world scale, and a relaxed A-pose before deriving
character-specific proportions. These constraints belong to the offline asset
authoring process; the Scene Project continues to reference the resulting
package-owned asset and its ordinary transform.
