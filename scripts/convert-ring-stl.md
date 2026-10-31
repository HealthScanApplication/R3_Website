# Preparing the ring model

Blender is not needed. The page loads `public/models/r3-ring.stl`, a reduced copy of
the owner's Meshy ring (`Meshy_AI_smart_ring_refined_20261031_generate.stl`) made with
a dependency-free Node script (binary and ASCII STL input, no packages).

The script welds identical vertices into an indexed mesh, then simplifies it with
Garland-Heckbert quadric error metrics: it repeatedly collapses the edge whose removal
moves the surface least, placing the merged vertex where it best fits the surrounding
planes. Every collapse is checked first (link condition, no flipped or degenerate faces,
no new slivers), so the result stays a closed, smooth surface with the same topology as
the source; open edges, if a model has any, are held in place by penalty planes.

```bash
node scripts/decimate-stl.mjs \
  "/path/to/Meshy_AI_smart_ring_refined_20261031_generate.stl" \
  public/models/r3-ring.stl --max-triangles 50000
```

`--max-triangles` defaults to 50,000. The script prints the input triangle and welded
vertex counts, the output triangle and welded vertex counts, the Euler characteristic
(V - E + F) before and after (they should match), the output size in bytes and the
runtime. The output is about 50 bytes per triangle, so 50,000 triangles is about 2.5 MB;
lower the number for a smaller, coarser file. The same input and target always give a
byte-identical file. On the ring it takes about one second.

Warning: the source STL (about 16 MB, 324,060 triangles) is not committed. The committed
output `public/models/r3-ring.stl` is what the page loads; keep it at or under 3 MB.
The script does not recenter or rescale the model; the 3D scene normalises it.
