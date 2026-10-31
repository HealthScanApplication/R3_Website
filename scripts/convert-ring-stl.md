# Preparing the ring model

Blender is not needed. The page loads `public/models/r3-ring.stl`, a reduced copy of
the owner's Meshy ring (`Meshy_AI_smart_ring_refined_20261031_generate.stl`) made with
a dependency-free Node script (vertex clustering, binary and ASCII STL input).

```bash
node scripts/decimate-stl.mjs \
  "/path/to/Meshy_AI_smart_ring_refined_20261031_generate.stl" \
  public/models/r3-ring.stl --max-triangles 40000
```

It prints the input triangle count, the output triangle count, the chosen cell count and
the output size in bytes. The script picks the finest grid that stays at or under
`--max-triangles`. To regenerate with a different budget, change that number (lower means
a smaller, coarser file; about 50 bytes per triangle, so 40,000 triangles is roughly 2 MB).

Warning: the source STL (about 16 MB, 324,060 triangles) is not committed. The committed
output `public/models/r3-ring.stl` is what the page loads; keep it at or under 2.5 MB.
The script does not recenter or rescale the model; the 3D scene normalises it.
