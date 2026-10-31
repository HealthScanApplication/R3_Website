# Convert the R³ ring STL to a web-ready GLB (owner step)

The 3D viewer (`src/components/hardware/RingViewer.tsx`) loads two files that are
**not in the repo yet**:

- `public/models/r3-ring.glb`
- `public/models/r3-ring-poster.webp`

Until both exist, `/ring` shows the inline SVG ring illustration instead. Nothing is broken; the 3D model simply appears once the files are added.

Note on the missing file: Netlify's forced `/* -> /index.html` rewrite means a missing `/models/r3-ring.glb` may come back as an HTML 200 rather than a 404. The viewer still falls back (the parse fails and `error` fires), but the poster is a silently broken image until the file exists.

Source mesh: `Meshy_AI_smart_ring_refined_20261031_generate.stl`. Requires Blender on your machine. `bpy.ops.wm.stl_import` needs Blender 4.0+; on 3.6 use `bpy.ops.import_mesh.stl` instead.

## 1. Export the GLB

Save the script below as `scripts/convert-ring-stl.py` (or anywhere), then run it from the repo root:

```bash
blender -b --python scripts/convert-ring-stl.py -- \
  /path/to/Meshy_AI_smart_ring_refined_20261031_generate.stl \
  public/models/r3-ring.glb
```

```python
import sys
import bpy

src, dst = sys.argv[sys.argv.index("--") + 1:][:2]
RATIO = 0.25  # start here; lower it until the .glb is under ~2 MB

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=src)  # Blender 4.x; on 3.6 use bpy.ops.import_mesh.stl(filepath=src)

obj = bpy.context.selected_objects[0]
bpy.context.view_layer.objects.active = obj
mod = obj.modifiers.new("Decimate", "DECIMATE")
mod.ratio = RATIO
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.shade_smooth()

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)
```

Check the size with `ls -lh public/models/r3-ring.glb`. If it is over ~2 MB, lower `RATIO` (for example 0.15) and re-run. If the ring looks faceted, raise it.

## 2. Make the poster

The poster is a 1:1 render shown while the model loads. In Blender, open the STL, frame the ring the way you want the hero to look, and render a square image (Output properties: 1024 x 1024, PNG, transparent film). Then convert it (needs `cwebp` or ImageMagick's `magick` installed):

```bash
cwebp -q 82 r3-ring-poster.png -o public/models/r3-ring-poster.webp
```

(or `magick r3-ring-poster.png -quality 82 public/models/r3-ring-poster.webp`).

## 3. Verify

Run the site locally, open `/ring`, and confirm the 3D ring loads and rotates. Remove `public/models/r3-ring.glb` temporarily to confirm the SVG fallback appears.
