import type { BlobRef } from "@hypit/protocol";

export const terminalMixBlenderScene = String.raw`import bpy
import math

from mathutils import Vector


def look_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True
scene.world.color = (0.0, 0.0, 0.0)

bpy.ops.object.camera_add(location=(0.0, -7.4, 2.8))
camera = bpy.context.object
camera.data.lens = 52
look_at(camera, (0.0, 0.0, 0.25))
scene.camera = camera

def material(name, color, metallic, roughness, emission=None):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission is not None:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = 0.9
    return value

pink = material("AVIR Pink", (1.0, 0.08, 0.35), 0.35, 0.2, (1.0, 0.02, 0.18))
blue = material("AVIR Blue", (0.05, 0.52, 1.0), 0.7, 0.16, (0.02, 0.25, 1.0))
dark = material("AVIR Core", (0.025, 0.04, 0.09), 0.5, 0.22)

bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1.08, location=(0.0, 0.0, 0.25))
core = bpy.context.object
core.name = "AVIR Core"
core.data.materials.append(dark)
core.scale = (1.0, 0.72, 1.0)

bpy.ops.mesh.primitive_torus_add(major_radius=1.48, minor_radius=0.09, major_segments=96,
                                 minor_segments=16, location=(0.0, 0.0, 0.25),
                                 rotation=(math.radians(68), 0.0, math.radians(18)))
ring_a = bpy.context.object
ring_a.data.materials.append(pink)

bpy.ops.mesh.primitive_torus_add(major_radius=1.28, minor_radius=0.055, major_segments=96,
                                 minor_segments=12, location=(0.0, 0.0, 0.25),
                                 rotation=(math.radians(28), math.radians(64), 0.0))
ring_b = bpy.context.object
ring_b.data.materials.append(blue)

for obj, direction in ((core, 1.0), (ring_a, -1.0), (ring_b, 1.0)):
    obj.rotation_mode = "XYZ"
    obj.keyframe_insert(data_path="rotation_euler", frame=0)
    obj.rotation_euler.z += direction * math.tau
    obj.rotation_euler.x += direction * math.pi * 0.35
    obj.keyframe_insert(data_path="rotation_euler", frame=60)

bpy.ops.object.light_add(type="AREA", location=(-3.8, -3.0, 5.0))
key = bpy.context.object
key.data.energy = 1050
key.data.shape = "DISK"
key.data.size = 4.2
key.data.color = (1.0, 0.16, 0.35)
look_at(key, (0.0, 0.0, 0.2))

bpy.ops.object.light_add(type="AREA", location=(3.5, -2.0, 2.2))
fill = bpy.context.object
fill.data.energy = 900
fill.data.size = 3.2
fill.data.color = (0.12, 0.55, 1.0)
look_at(fill, (0.0, 0.0, 0.2))
`;

export const terminalMixBlenderSceneBytes = new TextEncoder().encode(terminalMixBlenderScene);

export const terminalMixBlenderSceneArtifact: BlobRef = {
  kind: "blob",
  resource: "res_terminal_mix_blender_scene",
  size: terminalMixBlenderSceneBytes.byteLength,
  mediaType: "text/x-python",
};
