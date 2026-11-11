"""Export the Blender Studio CC0 primitive realistic bodies as Hypit glTF bases.

Run with Blender's ``bpy`` Python module:

    python export-blender-human-bases.py <human_base_meshes_bundle.blend> <output-dir>

The source bundle is published by Blender Studio as ``Human Base Meshes`` under
CC0. This exporter keeps the authored low-poly control cages, disables their
Subdivision Surface preview modifiers, preserves the existing articulated
object hierarchy, and annotates its useful pivots with Hypit's rig roles. The
Seedance proxy face is deliberately identity-free: a coarse faceted head keeps
only a low-detail nose as a facing cue.
"""

from pathlib import Path
import sys

import bpy


SOURCE_COLLECTIONS = {
    "standard-male": "Body Male - Primitve (Realistic)",
    "standard-female": "Body Female - Primitve (Realistic)",
}

OMITTED_PROXY_PARTS = (
    "-eye_", "-eyelid_", "-ear_", "-nose_bridge_",
    "-finger_", "-thumb_", "-toe_", "-teo_",
)


def is_omitted_proxy_part(name: str) -> bool:
    return any(token in name for token in OMITTED_PROXY_PARTS)


def decimate_for_proxy(obj: bpy.types.Object, target_faces: int) -> None:
    """Reduce a source facial cage while preserving its broad silhouette."""
    polygon_count = len(obj.data.polygons)
    if polygon_count <= target_faces:
        return
    # The source collection is also an authoring reference. Work on a local
    # mesh copy so proxy export never mutates linked data elsewhere in the file.
    obj.data = obj.data.copy()
    modifier = obj.modifiers.new("Hypit proxy decimation", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = target_faces / polygon_count
    modifier.use_collapse_triangulate = True
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def rig_role(name: str) -> str | None:
    shared = {
        "pelvis": "hips",
        "belly": "spine",
        "chest": "chest",
        "neck": "neck",
        "head": "head",
    }
    for token, role in shared.items():
        if f"-{token}" in name:
            return role
    side = "l" if name.endswith(".L") else "r" if name.endswith(".R") else None
    if side is None:
        return None
    sided = {
        "shoulder": "shoulder",
        "arm_lower": "elbow",
        "hand": "wrist",
        "leg_upper": "hip",
        "leg_lower": "knee",
        "foot": "ankle",
    }
    for token, role in sided.items():
        if f"-{token}" in name:
            return f"{role}.{side}"
    return None


def export_collection(collection_name: str, output: Path) -> None:
    collection = bpy.data.collections[collection_name]
    source_objects = list(collection.all_objects)
    objects = [obj for obj in source_objects if not is_omitted_proxy_part(obj.name)]
    pelvis = next(obj for obj in source_objects if "-pelvis_" in obj.name)

    # The asset-library file arranges each collection at a different X offset.
    # Moving only the hierarchy root recentres the complete authored figure.
    pelvis.location.x = 0
    pelvis.location.y = 0

    neutral = bpy.data.materials.get("Hypit Mannequin")
    if neutral is None:
        neutral = bpy.data.materials.new("Hypit Mannequin")
        neutral.diffuse_color = (0.58, 0.61, 0.66, 1.0)
        neutral.roughness = 0.82

    for obj in source_objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        if is_omitted_proxy_part(obj.name):
            continue
        role = rig_role(obj.name)
        if role is not None:
            obj["hypitRigRole"] = role
        if obj.type != "MESH":
            continue
        for modifier in list(obj.modifiers):
            if modifier.type == "SUBSURF":
                obj.modifiers.remove(modifier)
        if "-head_" in obj.name:
            decimate_for_proxy(obj, 36)
        elif "-nose_" in obj.name:
            decimate_for_proxy(obj, 9)
        for polygon in obj.data.polygons:
            polygon.use_smooth = False
        obj.data.materials.clear()
        obj.data.materials.append(neutral)

    root = bpy.data.objects.new(f"{output.stem}.Rig.Root", None)
    collection.objects.link(root)
    root["hypitRigRole"] = "root"
    pelvis.parent = root

    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *objects]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = pelvis

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_materials="EXPORT",
        export_yup=True,
    )

    bpy.data.objects.remove(root, do_unlink=True)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: export-blender-human-bases.py <bundle.blend> <output-dir>")
    source = Path(sys.argv[1]).resolve()
    output_dir = Path(sys.argv[2]).resolve()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    for asset_id, collection_name in SOURCE_COLLECTIONS.items():
        export_collection(collection_name, output_dir / f"{asset_id}.glb")


if __name__ == "__main__":
    main()
