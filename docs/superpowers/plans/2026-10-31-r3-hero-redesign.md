# R³ /ring Hero Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top of `/ring` with one full-bleed video hero in the homepage's style ("Track a routine for …"), showing both devices in a live 3D scene (the owner's ring model, and the clip hanging as a flipping necklace with a heartbeat) and containing the preorder.

**Architecture:** The hero reuses the homepage hero's media layer (poster + `FlutedGlassBackground` + tint). The preorder is the existing reviewed `PreorderBlock` with a `hero` styling variant, so payment logic is untouched. A dependency-free Node script shrinks the owner's STL; a three.js scene (isolated under `scene/`, dynamically imported) renders both devices over the video, with the drawn `RingArt`/`ClipArt` as the always-present fallback layer.

**Tech Stack:** React + Vite + TypeScript (inline styles), three.js 0.169 (`STLLoader`, `RoundedBoxGeometry`, `RoomEnvironment`, `BufferGeometryUtils`), vitest + @testing-library/react (jsdom), Node ESM for the decimation script.

**Spec:** `docs/superpowers/specs/2026-10-31-r3-hero-redesign-design.md` (builds on `2026-10-31-r3-hardware-preorder-design.md` and plan `2026-10-31-r3-hardware-preorder.md`; the branch head before this plan is `d4168d3`)

## Global Constraints

- **Styling:** inline styles only via `ed`/`DISPLAY`/`GRO` from `src/config/editorialTheme` (plus small namespaced `<style>` blocks for media queries). No Tailwind utility classes (CSS is prebuilt / no JIT: new classes render transparent).
- **No invented facts.** Hardware copy may only use: Ring = a controller worn on the finger with a touch and slide surface that controls the clip, final ring specs not published; Clip = camera pod worn as a necklace, a watch, or a clip, captures food, activity, voice notes, and AI requests; planned clip specs from the owner's spec sheet: 8 MP wide-angle camera (160° field of view), a physical slider that cuts the camera, microphones, and radios, a red camera LED while the camera is active, heart rate; AI assistant manages routine, calendar, and email. Prices/terms only from `src/components/hardware/copy.ts`.
- **Hero deck (exact):** "Touch or slide the R³ Ring to control the R³ Clip's camera, record a voice note, or hand a request to your AI assistant."
- **Headline (exact structure):** line 1 "Track a routine"; line 2 "for " + the rotating italic goal word taken from the homepage's `GOAL_WORDS`.
- **three.js isolation:** `three` and `three/examples/...` may be imported ONLY inside `src/components/hardware/scene/`. Everything else loads the scene with a dynamic `import('./scene/heroScene')`, so unit tests of other components never load three.
- **Never a blank hero:** the drawn `RingArt` + `ClipArt` are the base layer from first paint; the live scene fades in only when ready; WebGL missing or any scene error leaves the drawings.
- **Reduced motion and slow devices:** honor `prefers-reduced-motion` (no auto-motion, static heartbeat frame, no video layer) and the homepage's existing slow-connection/save-data gating for the video layer.
- **Environment (shared, memory-starved machine):** do NOT run `npm install`/`npm ci`, the whole suite, whole-repo `tsc`, or `npm run build`. The worktree's `node_modules` is partial and has no `three`. To run tests that need `jsdom`, `esbuild` or `three`, temporarily replace the worktree's `node_modules` with a symlink to the overlay directory `/private/tmp/claude-501/-Users-john-Documents--CODE-AI-Healthscan-Website-happy-goldwasser-983158/b741e942-24f5-4469-9994-f2540ec4e018/scratchpad/nm-overlay` (it links every existing package and adds `three@0.169.0`): `mv node_modules node_modules.orig && ln -s <overlay> node_modules`, run the focused tests, then `rm node_modules && mv node_modules.orig node_modules` and confirm `git status` is clean. Never run npm commands while it is symlinked.
- **Commit** after each task; the commit message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; commit only the files the task names (never `git add -A`).

---

### Task 1: Ring asset — dependency-free STL decimation script and the reduced model

**Files:**
- Create: `scripts/decimate-stl.mjs`
- Create: `scripts/__tests__/decimate-stl.test.ts` (default node environment)
- Create: `public/models/r3-ring.stl` (generated output, committed)
- Modify: `scripts/convert-ring-stl.md` (replace the Blender instructions with the new script's usage; keep the file name)

**Interfaces:**
- Produces (named ESM exports of `scripts/decimate-stl.mjs`, used by the test and the CLI): `parseStl(bytes: Uint8Array): Float32Array` (9 floats per triangle: three vertices; supports binary STL and ASCII STL), `decimate(positions: Float32Array, cells: number): { positions: Float32Array; triangles: number }` (vertex clustering), `writeBinaryStl(positions: Float32Array): Uint8Array` (80-byte header, uint32 count, 50 bytes per triangle with computed face normals), `decimateToTarget(positions: Float32Array, maxTriangles: number): { positions: Float32Array; cells: number; triangles: number }` (binary-search the cell count so the result has ≤ `maxTriangles` triangles and as many as possible).
- CLI: `node scripts/decimate-stl.mjs <input.stl> <output.stl> [--max-triangles 40000]` prints input triangles, output triangles, the chosen cell count and the output size in bytes.

**Algorithm (vertex clustering):** compute the axis-aligned bounding box; the cell size is `max(extent) / cells`; map each vertex to an integer cell key; each cell's representative vertex is the average of all vertices mapped to it; rebuild triangles with representative vertices and DROP any triangle whose three vertices do not map to three distinct cells (degenerate). Do not recenter or rescale (the scene normalises).

- [ ] **Step 1: Write the failing test** (`scripts/__tests__/decimate-stl.test.ts`): build a synthetic dense mesh in memory (e.g. a UV-sphere with ≥ 20,000 triangles, radius 10, plus a second small test with a single triangle); write it with `writeBinaryStl`, parse it back with `parseStl` and assert the round trip (same triangle count, positions equal within float tolerance); assert `writeBinaryStl` output length is `84 + 50 * triangles`; assert `decimate(sphere, 24)` returns far fewer triangles, every kept triangle has three distinct cluster vertices (no zero-area triangles: cross-product length > 0), and the output bounding box is within one cell size of the input bounding box on every axis; assert `decimateToTarget(sphere, 3000)` returns `triangles <= 3000` and `triangles >= 1500`; assert an ASCII STL string (a 2-triangle `solid … endsolid` with `facet normal`/`vertex` lines) parses to 18 floats; assert `parseStl` throws a clear error on a buffer that is neither (too short / count mismatch).

- [ ] **Step 2: Run to verify it fails** — `npx vitest run scripts/__tests__/decimate-stl.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `scripts/decimate-stl.mjs` (pure Node, no dependencies, ESM, no top-level side effects when imported; the CLI runs only when invoked directly: guard with `import.meta.url === pathToFileURL(process.argv[1]).href`).

- [ ] **Step 4: Run to verify it passes** — same command — Expected: PASS, pristine output.

- [ ] **Step 5: Generate the real asset.** The owner's source file (read-only, do not modify or copy it into the repo) is `/Users/john/Desktop/untitled folder 6/Meshy_AI_smart_ring_refined_20261031_generate.stl` (≈ 15 MB). Run: `node scripts/decimate-stl.mjs "/Users/john/Desktop/untitled folder 6/Meshy_AI_smart_ring_refined_20261031_generate.stl" public/models/r3-ring.stl --max-triangles 40000`. The output must be ≤ 2,500,000 bytes. Record the printed numbers in your report. Then sanity-check the result in code (not by eye): re-parse the output with `parseStl`, confirm the triangle count equals the printed value, no NaN/Infinity, and report the bounding box of input vs output (they should agree within one cell).

- [ ] **Step 6: Update `scripts/convert-ring-stl.md`**: replace its contents with a short "Preparing the ring model" note: Blender is not needed; the command above; how to regenerate with a different `--max-triangles`; a warning that the source STL is not committed and the output `public/models/r3-ring.stl` is what the page loads.

- [ ] **Step 7: Commit**

```bash
git add scripts/decimate-stl.mjs scripts/__tests__/decimate-stl.test.ts public/models/r3-ring.stl scripts/convert-ring-stl.md
git commit -m "feat(hardware): dependency-free STL decimation script and reduced ring model"
```

---

### Task 1b: Replace vertex clustering with quadric-error edge-collapse simplification (smooth ring)

> **Why (owner feedback + controller diagnosis, 2026-10-31):** the owner reported "the ring polygon is broken, not smooth". Side-by-side views in three.js showed the ORIGINAL Meshy STL (324,060 triangles, 162,013 welded vertices) is clean and smooth, while the Task 1 vertex-clustering result (39,210 triangles, only 18,752 welded vertices) lost the smooth inner band, has a jagged crinkled inner rim, and mangled the small inner sensors. Vertex clustering is the cause, not the source mesh. The fix is a real simplifier (Garland–Heckbert quadric error metrics with edge collapse), written in pure Node with NO third-party code (a downloaded-package approach was rejected by the sandbox and the plan's no-new-dependency ruling stands).

**Files:**
- Modify (rewrite the simplification core): `scripts/decimate-stl.mjs`
- Modify: `scripts/__tests__/decimate-stl.test.ts`
- Regenerate (committed binary asset): `public/models/r3-ring.stl`
- Modify: `scripts/convert-ring-stl.md` (describe the new algorithm and flags)

**Interfaces (named ESM exports; keep `parseStl` and `writeBinaryStl` exactly as they are):**
- Keep: `parseStl(bytes: Uint8Array): Float32Array` (9 floats per triangle) and `writeBinaryStl(positions: Float32Array): Uint8Array`.
- Remove: `decimate` and `decimateToTarget` (vertex clustering) and their tests; nothing outside this script imports them (grep to confirm).
- Add: `weldMesh(positions: Float32Array): { vertices: Float32Array; indices: Uint32Array }` — welds vertices that have IDENTICAL float coordinates (hash on the three float32 bit patterns, e.g. via a `Map` keyed by a string of the three values or by three `Float32Array`→`Uint32Array` reinterpreted words) into an indexed mesh; drops triangles with a repeated index.
- Add: `simplify(mesh: { vertices: Float32Array; indices: Uint32Array }, targetTriangles: number): { vertices: Float32Array; indices: Uint32Array; triangles: number }` — Garland–Heckbert quadric-error-metrics simplification by iterative edge collapse until the triangle count is ≤ `targetTriangles` (or no valid collapse remains).
- Add: `toTriangleSoup(mesh: { vertices: Float32Array; indices: Uint32Array }): Float32Array` — back to 9 floats per triangle for `writeBinaryStl`.
- CLI unchanged in spelling: `node scripts/decimate-stl.mjs <input.stl> <output.stl> [--max-triangles 50000]` (default now 50000); it prints input triangles, welded vertices, output triangles, output welded vertices, Euler characteristic (V − E + F) before and after, and output bytes.

**Algorithm requirements (all mandatory):**
1. **Quadrics:** for every triangle compute its plane (a,b,c,d) with unit normal, area-weight the 4×4 fundamental quadric `K = p pᵀ` by triangle area, and sum onto its three vertices. Store each vertex quadric as 10 floats in one `Float64Array`.
2. **Edge candidates:** every unique edge `(u,v)` of the welded mesh; collapse cost = `vᵀ(Qu+Qv)v` evaluated at the optimal position found by solving the 3×3 system from the quadric (if the matrix is near-singular, fall back to the best of {u, v, midpoint}); keep a binary min-heap of candidates with lazy invalidation (a per-vertex version counter; discard stale entries when popped). Rebuild candidates for the survivor's edges after each collapse.
3. **Validity checks before accepting a collapse:** (a) *link condition* — the number of common neighbours of `u` and `v` must be exactly 2 on a closed manifold (so topology is preserved and the surface cannot pinch or tear); (b) *no fold-overs* — for every triangle around `u` and `v` that survives, the normal after moving the vertex to the new position must not flip (dot with the old normal > 0.2 is required, i.e. reject collapses that turn a face by more than ~78°) and must not become degenerate (area > 1e-12 × scale²); (c) never collapse onto a vertex whose position would produce NaN/Infinity.
4. **Boundary handling:** if the mesh has boundary edges (an edge used by only one triangle), add the standard penalty quadrics (a plane through the boundary edge perpendicular to its triangle, weighted large) so open boundaries stay put; the real ring is closed, but the code must not crash on open meshes.
5. **Complexity and memory:** typed arrays only for vertices, indices, quadrics, adjacency (use CSR-style vertex→triangle lists rebuilt/updated by a swap-remove scheme or per-vertex `Int32Array` lists with `-1` tombstones); the heap stores entries in parallel typed arrays; the real file (162,013 welded vertices, 324,060 triangles → 50,000) must finish in under 60 s and under 1.5 GB peak.
6. **Determinism:** same input and target give byte-identical output.
7. **Compaction:** after simplification drop unreferenced vertices and compact indices; the output vertex array contains only used vertices.

- [ ] **Step 1: Write the failing tests** (`scripts/__tests__/decimate-stl.test.ts`, node environment; delete the vertex-clustering tests; keep the `parseStl`/`writeBinaryStl` round-trip, ASCII and error tests unchanged). New synthetic meshes are built in the test: a UV-sphere (radius 10, ≥ 20,000 triangles) and a torus (major radius 10, minor radius 3, ≥ 20,000 triangles). Assert for BOTH meshes after `weldMesh` then `simplify(mesh, ~20% of triangles)`: triangle count ≤ target and ≥ 0.9 × target (it reaches the target); the Euler characteristic V − E + F is unchanged (sphere 2, torus 0) — computed by counting unique undirected edges; every edge is shared by exactly two triangles (closed manifold preserved) and no vertex index is out of range; no degenerate triangle (cross-product length > 0); no triangle flipped (for the sphere, every output triangle's face normal has a positive dot product with its centroid direction from the origin; for the torus, with the outward normal computed from the centroid's projection onto the major circle); geometric fidelity: for the sphere, every output vertex lies within 1% of the radius of the true sphere surface (| |v| − 10 | < 0.1), and the enclosed volume (sum of signed tetrahedra) is within 2% of the original's; for the torus, every output vertex is within 2% of minor radius... (distance from the major circle minus 3, absolute < 0.12); bounding box within 1% of the original on every axis; determinism (two runs give identical `indices` and `vertices`); a mesh with a boundary (a flat grid of 60×60 quads, 7,200 triangles) simplified to ~25% keeps its outer boundary: every original boundary corner vertex still exists in the output (positions of the four corners present) and there are no NaNs; `simplify` with a target larger than the triangle count returns the mesh unchanged (same triangle count); a tiny mesh (a tetrahedron, 4 triangles) with target 2 returns without throwing and does not produce degenerate triangles (it is allowed to stop at 4 because the link condition forbids collapsing); `weldMesh` merges identical vertices (a two-triangle square shares 2 vertices → 4 vertices, 6 indices); `toTriangleSoup(weldMesh(x))` has the same triangle count as `x`.
- [ ] **Step 2: Run to verify they fail** — `npx vitest run scripts/__tests__/decimate-stl.test.ts` — Expected: FAIL (new exports missing).
- [ ] **Step 3: Implement** the rewrite of `scripts/decimate-stl.mjs` (pure Node, no dependencies, no side effects on import, CLI behind the `pathToFileURL(process.argv[1]).href` guard). Add friendly CLI errors: a missing input file, an output directory that does not exist, and output path equal to input path each print one clear line and exit 1 (no stack trace).
- [ ] **Step 4: Run to verify they pass** — same command — Expected: PASS, pristine output.
- [ ] **Step 5: Regenerate the real asset** from the owner's source (read-only; never copy it into the repo): `node scripts/decimate-stl.mjs "/Users/john/Desktop/untitled folder 6/Meshy_AI_smart_ring_refined_20261031_generate.stl" public/models/r3-ring.stl --max-triangles 50000`. The output must be ≤ 3,000,000 bytes. Then verify programmatically (not by eye) and report: output triangle count, welded vertex count (it must be roughly 25,000, far above the 18,752 of the old clustered result when measured at the same triangle count... report the number), Euler characteristic before and after (they must be equal), bounding box of input vs output (agree within 0.5% of the longest extent), the maximum and mean distance from output vertices to the original surface sampled by nearest original-vertex distance on a subsample of 2,000 output vertices (report the maximum; a good result is under 1% of the longest extent), and the runtime and peak memory.
- [ ] **Step 6: Update `scripts/convert-ring-stl.md`**: describe the QEM approach in two or three sentences, the command, the default 50,000 triangles and that size is ≈ 50 bytes per triangle, and that the source STL is not committed.
- [ ] **Step 7: Commit**

```bash
git add scripts/decimate-stl.mjs scripts/__tests__/decimate-stl.test.ts public/models/r3-ring.stl scripts/convert-ring-stl.md
git commit -m "fix(hardware): quadric-error edge-collapse simplification for a smooth ring model"
```

---

### Task 2: Restore the clip's heartbeat in the drawn art and add the heart-rate spec row

> **Context (controller correction):** the Task 12 fix removed the heartbeat polyline from `ClipArt` as an "invented" sensor claim. The owner's Pod Plan spec sheet lists heart rate and the owner asked for the heartbeat, so it comes back.

**Files:**
- Modify: `src/components/hardware/DeviceArt.tsx`
- Modify: `src/components/hardware/SpecSheet.tsx`
- Modify: `src/components/hardware/__tests__/HardwarePage.test.tsx`

**Interfaces:** none new.

**Behavior:**
1. In `ClipArt`, remove the neutral lens mark added in the last fix wave (the two concentric circles at (320,256) with r=34 and r=14 and the small highlight dot r=4 at (330,246)) and restore the original heartbeat polyline inside the dark inner diamond, same group/filter as the lens had: `<path d="M253 260h34l17-38 30 72 18-34h35" fill="none" stroke="#f4f1ea" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />`. Leave the top-right camera dot and everything else untouched.
2. `SpecSheet` Clip list gains one row between "Captures" and "Worn as": label `Tracks`, value `Heart rate`. The notice "Planned specifications. Final details are confirmed before manufacturing." already covers it.

- [ ] **Step 1: Update the tests first** (they must fail on the current code): replace the "ClipArt has a lens mark and no pulse line" test with "ClipArt draws the heartbeat line": the rendered `ClipArt` contains a `path` whose `d` equals `M253 260h34l17-38 30 72 18-34h35` and contains NO `circle` with `r="34"`; add an assertion that the page's specifications list a `Tracks` label with the value `Heart rate`; keep the exact price-set test and all other tests unchanged.
- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/components/hardware/__tests__/HardwarePage.test.tsx` — Expected: FAIL (jsdom via overlay).
- [ ] **Step 3: Implement** the two edits.
- [ ] **Step 4: Run to verify they pass** — same command (also run `npx vitest run src/components/__tests__/HardwarePreorderTeaser.test.tsx`) — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/hardware/DeviceArt.tsx src/components/hardware/SpecSheet.tsx src/components/hardware/__tests__/HardwarePage.test.tsx
git commit -m "fix(hardware): restore the clip heartbeat in the drawn art and list heart rate"
```

---

### Task 3: Pure animation helpers — heartbeat and necklace flip

**Files:**
- Create: `src/components/hardware/scene/heartbeat.ts`
- Create: `src/components/hardware/scene/flip.ts`
- Test: `src/components/hardware/scene/__tests__/heartbeat.test.ts`, `src/components/hardware/scene/__tests__/flip.test.ts`

**Interfaces (pure functions, no three.js, no DOM):**
- `heartbeat.ts`: `heartbeatY(phase: number): number` — one ECG-like beat as a function of `phase` in [0,1): returns a value in [-1, 1] (flat baseline 0, small P bump, sharp QRS spike up to +1 with a dip to about -0.35, rounded T bump), periodic (`heartbeatY(0) === heartbeatY(1)`), continuous except for the intended sharp spike; `heartbeatPoints(width: number, height: number, samples: number, scroll: number): Array<[number, number]>` — canvas-space points for a scrolling trace (`scroll` in [0,1) shifts the trace left); `beatPhaseAt(timeSeconds: number, bpm: number): number` — phase in [0,1) at a time for a given beats-per-minute (use 62 bpm in the scene).
- `flip.ts`: `necklacePose(timeSeconds: number, reducedMotion: boolean): { yaw: number; swing: number }` — `yaw` in radians: one full cycle every 12 seconds: eases from 0 (front) to π (back) over 2.5 s, holds at π for 3.5 s, eases back to 2π (front) over 2.5 s, holds at 2π for 3.5 s; periodic with period 12 s (value at t and t+12 differ by exactly 2π, never decreasing by more than float error: yaw is monotonic non-decreasing within a cycle then wraps to the equivalent pose; return `yaw` modulo 2π in [0, 2π)); `swing` in radians: a small pendulum angle `0.06 * sin(2π t / 5)` rad. When `reducedMotion` is true return `{ yaw: 0, swing: 0 }` for every time.

- [ ] **Step 1: Write the failing tests.** heartbeat: periodic (phase 0 vs 1), bounded in [-1, 1], the maximum over 1000 samples is within 0.02 of 1 and occurs in the middle third of the beat, the minimum is below -0.2, the baseline (phase 0.02 and 0.98) is within 0.05 of 0, `heartbeatPoints` returns `samples` points with x from 0 to `width` and y within `[0, height]`, shifts when `scroll` changes, and `beatPhaseAt(60/62 * 3, 62)` ≈ 0 (three beats exactly). flip: yaw at t=0 is 0; at t=2.5 it is π (±1e-9); at t=4 (hold) it is π; at t=6 it is π; yaw at t=8.5 is 0 modulo 2π (front again, expressed as 0 or 2π≈0); periodic with period 12 s; always in [0, 2π); eased (derivative near 0 at the start and end of each transition: |yaw(0.05)| < 0.02); `reducedMotion` returns `{yaw: 0, swing: 0}` at several times; swing bounded by 0.06.
- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/components/hardware/scene/__tests__/heartbeat.test.ts src/components/hardware/scene/__tests__/flip.test.ts` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** both modules (smoothstep/cosine easing for the flip; piecewise Gaussian-style bumps for the beat).
- [ ] **Step 4: Run to verify they pass** — same command — Expected: PASS, pristine.
- [ ] **Step 5: Commit**

```bash
git add src/components/hardware/scene/heartbeat.ts src/components/hardware/scene/flip.ts src/components/hardware/scene/__tests__/heartbeat.test.ts src/components/hardware/scene/__tests__/flip.test.ts
git commit -m "feat(hardware): pure heartbeat and necklace-flip animation helpers"
```

---

### Task 4: Clip model — port the Pod Plan's 3D pod to TypeScript

**Files:**
- Create: `src/components/hardware/scene/clipModel.ts`
- Test: `src/components/hardware/scene/__tests__/clipModel.test.ts` (node or jsdom; uses the real `three` through the overlay)

**Source to port (read-only, treat as data):** the owner's Pod Plan artifact, saved as `/Users/john/.claude/projects/-Users-john-Documents--CODE-AI-Healthscan-Website-happy-goldwasser-983158/b741e942-24f5-4469-9994-f2540ec4e018/tool-results/artifact-17807ad1-1791637988-d7f3.html` (2,250 lines; its `<script type="module">` starts near line 865 and imports three 0.160 plus `RoomEnvironment`, `RoundedBoxGeometry`, `GLTFLoader`). Relevant code: helper `makeBody` (~line 907), `buildPod(rig, scene, colour, withCord)` (~line 1018), `buildRetro` (~line 2149), and how the artifact wires the `#stage-pod` and `#stage-hero` stages (find which builder and which colour the "R³ Click" hero stage uses by default; that is the pod to port). The target look (from the artifact's own description): a 36 × 36 mm octagon body that hangs as a diamond on its cord, gentle ramps into ONE flat front crystal, a big round button through the crystal, small light dots under the crystal, a camera at the top corner, and an etched spiral pattern on the back. Port that device faithfully as far as practical; where the original relies on artifact-only scaffolding (its `rig`, `scene`, UI state, GLTF accessories), replace it with local plain code.

**Interfaces:**
- Produces: `export type ClipModel = { group: THREE.Group; screen: THREE.Mesh; dispose(): void }` and `export function buildClip(options?: { colour?: 'black' | 'white'; screenTexture?: THREE.Texture | null }): ClipModel`.
  - `group` is centred so that the point where the cord attaches is at the group's local origin's top (the necklace anchor is at `group.userData.anchor`, a `THREE.Vector3` in group space), the front faces +Z, the back faces -Z, total height ≈ 1.0 unit (the scene scales it); it contains the cord/loop geometry as a child named `cord`.
  - `screen` is the front crystal mesh; when `screenTexture` is provided it is applied as `emissiveMap` (and `map`) on the crystal material so the scene can draw the animated heartbeat on it; when null the crystal is plain dark glass.
  - `dispose()` disposes every geometry, material and texture the function created (NOT the texture passed in).
- Imports allowed: `three`, `three/examples/jsm/geometries/RoundedBoxGeometry.js`, `three/examples/jsm/utils/BufferGeometryUtils.js` (no GLTFLoader).

- [ ] **Step 1: Write the failing smoke test** with the real three: `buildClip()` returns a `THREE.Group` with at least 6 meshes; `screen` is a `THREE.Mesh` that is a descendant of `group`; `group.userData.anchor` is a `THREE.Vector3`; a child named `cord` exists; the group's bounding box height (`new THREE.Box3().setFromObject(group)`) is between 0.8 and 1.4 and the box is finite (no NaN); front/back: the crystal's world-space normal-facing check (the `screen` mesh centre has positive Z relative to the body centre); with `screenTexture` set to a `THREE.DataTexture`, `screen.material.emissiveMap` is that texture (check both `Mesh.material` single material and array forms); `colour: 'white'` produces a different body material colour from `'black'`; `dispose()` calls `dispose` on geometries (spy on `BufferGeometry.prototype.dispose` or count) and does NOT dispose the passed-in texture; calling `buildClip` twice returns independent groups (no shared mutable state).
- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/components/hardware/scene/__tests__/clipModel.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement the port.** Read the artifact's functions listed above, translate the geometry/material construction to TypeScript against three 0.169 (fix any API drift: e.g. `MeshPhysicalMaterial` params, `RoundedBoxGeometry` signature, color management via `ColorManagement`/`SRGBColorSpace` instead of removed legacy fields), keep the proportions, and document in a file header comment which artifact builder/lines you ported and any simplifications.
- [ ] **Step 4: Run to verify it passes** — same command — Expected: PASS, pristine output.
- [ ] **Step 5: Commit**

```bash
git add src/components/hardware/scene/clipModel.ts src/components/hardware/scene/__tests__/clipModel.test.ts
git commit -m "feat(hardware): port the Pod Plan clip model to a three.js module"
```

---

### Task 5: The hero scene — ring loader and `createHeroScene`

**Files:**
- Create: `src/components/hardware/scene/ringModel.ts`
- Create: `src/components/hardware/scene/heroScene.ts`
- Test: `src/components/hardware/scene/__tests__/ringModel.test.ts`, `src/components/hardware/scene/__tests__/heroScene.test.ts`

**Interfaces:**
- Consumes: `buildClip`/`ClipModel` (Task 4), `heartbeatY`/`heartbeatPoints`/`beatPhaseAt` (Task 3), `necklacePose` (Task 3).
- Produces (`ringModel.ts`): `export function buildRingGeometry(stlBytes: ArrayBuffer): THREE.BufferGeometry` — parses with `STLLoader`, merges vertices (`BufferGeometryUtils.mergeVertices`), computes smooth vertex normals, centres the geometry at the origin and scales it so its largest dimension is 1.0; `export async function loadRing(url: string): Promise<THREE.Mesh>` — fetches the bytes (rejects with a clear error if the response is not ok or empty), builds the geometry and returns a `Mesh` with a dark brushed-metal `MeshPhysicalMaterial` (`metalness` ≈ 0.9, `roughness` ≈ 0.35, `clearcoat` ≈ 0.4).
- Produces (`heroScene.ts`): `export type HeroSceneOptions = { ringUrl: string; reducedMotion: boolean; onReady?: () => void }`, `export type HeroSceneHandle = { dispose(): void }`, `export async function createHeroScene(container: HTMLElement, options: HeroSceneOptions): Promise<HeroSceneHandle>`.

**`createHeroScene` behavior:**
1. Creates a `WebGLRenderer` (`antialias: true`, `alpha: true`, `powerPreference: 'default'`), pixel ratio `Math.min(devicePixelRatio, 2)`, transparent clear colour, `SRGBColorSpace` output, `ACESFilmicToneMapping`; appends its canvas to `container` (canvas styled `width:100%;height:100%;display:block;touch-action:pan-y`); if the renderer cannot be created, rejects (the React wrapper keeps the drawings). Lighting: `RoomEnvironment` through `PMREMGenerator` as `scene.environment` plus one soft key `DirectionalLight`.
2. Loads the ring with `loadRing(options.ringUrl)` and builds the clip with `buildClip({ screenTexture })`, where `screenTexture` is a `CanvasTexture` of a 256 × 256 canvas on which the heartbeat trace is drawn (white-green trace `#f4f1ea`/`#C7D99F` on near-black) — redrawn at most 30 times per second using `heartbeatPoints(..., scroll)` with `scroll` advancing with `beatPhaseAt(time, 62)`; under `reducedMotion` it is drawn once as a static frame.
3. Layout (world units; camera `PerspectiveCamera`, fov 32): the ring sits left of centre at about 0.55 of the clip's scale, tilted ≈ 25° on X and ≈ -20° on Y, resting with a soft elliptical contact-shadow blob (a flat transparent radial-gradient plane under it); the clip hangs to the right from a cord whose upper end runs out of the top of the frame (the cord is the clip model's `cord` child extended by a straight line segment mesh to above the frame); on every frame the clip's `rotation.y = necklacePose(t, reducedMotion).yaw` and its group rotation about the anchor gets `rotation.z = swing`. The camera frames both objects for the container's current aspect ratio (re-framed on resize via `ResizeObserver`; narrower aspect ⇒ pull back so both stay in view).
4. Interaction: pointer drag (Pointer Events, `setPointerCapture`) rotates the whole rig around Y by up to ±0.6 rad and X by up to ±0.25 rad with damping, releasing eases back over about a second; `touch-action: pan-y` so vertical page scroll still works on touch.
5. Auto-motion (disabled under `reducedMotion`): the ring turns slowly about its own vertical axis (≈ 0.25 rad/s), the clip flips and swings, the heartbeat scrolls. Under `reducedMotion` render a single static frame (front view, static heartbeat) and re-render only on resize.
6. Performance: the render loop runs only while the container intersects the viewport (`IntersectionObserver`) and `document.visibilityState === 'visible'`; it stops on dispose.
7. Calls `options.onReady?.()` once, right after the first rendered frame.
8. `dispose()` stops the loop and observers, removes listeners and the canvas, and disposes the renderer, PMREM generator, environment texture, ring geometry/material, the clip (`ClipModel.dispose()`), the canvas texture and the shadow-blob resources; it is idempotent and safe to call before the promise resolved (the promise then rejects or resolves to an already-disposed handle without leaking).

- [ ] **Step 1: Write the failing tests.** `ringModel.test.ts` (node env, real three): build a small binary STL buffer in the test (a tetrahedron or box with known dimensions), `buildRingGeometry` returns a geometry with a `normal` attribute, centred (bounding-box centre within 1e-6 of the origin) with max dimension exactly 1.0 (±1e-6) and merged vertices (position count smaller than 3 × triangles for a box); `loadRing` with a stubbed `globalThis.fetch` returning that buffer yields a `Mesh` with a `MeshPhysicalMaterial` whose `metalness` is > 0.5; `loadRing` rejects with a message containing the status when `fetch` returns `{ ok: false, status: 404 }` and when the body is empty. `heroScene.test.ts` (jsdom, real three but NO real WebGL): `createHeroScene` rejects (does not hang) when `WebGLRenderer` cannot be constructed — mock `three`'s `WebGLRenderer` to throw via `vi.mock('three', async (orig) => ({ ...(await orig()), WebGLRenderer: class { constructor() { throw new Error('no webgl'); } } }))` and assert the rejection message and that nothing was left in the container; and, with a stub renderer class (a minimal fake exposing `domElement`, `setPixelRatio`, `setSize`, `render`, `dispose`, `toneMapping`, `outputColorSpace`, `setClearColor`, `info`) plus a stubbed `loadRing` (mock `../ringModel` to resolve a simple `Mesh`) and stubbed `IntersectionObserver`/`ResizeObserver`/`requestAnimationFrame`: assert the canvas is appended, `onReady` fires exactly once after the first render, `dispose()` removes the canvas and calls the renderer's `dispose`, a second `dispose()` is a no-op, and under `reducedMotion: true` the scheduler requests no continuing animation frames after the first render.
- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/components/hardware/scene/__tests__/ringModel.test.ts src/components/hardware/scene/__tests__/heroScene.test.ts` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `ringModel.ts` and `heroScene.ts` per the behavior list. Keep each file focused (target ≤ 220 lines each; if `heroScene.ts` exceeds that, extract `framing.ts` (camera framing math) and `shadowBlob.ts` and say so in the report).
- [ ] **Step 4: Run to verify they pass** — same command — Expected: PASS, pristine output.
- [ ] **Step 5: Commit**

```bash
git add src/components/hardware/scene/ringModel.ts src/components/hardware/scene/heroScene.ts src/components/hardware/scene/__tests__/ringModel.test.ts src/components/hardware/scene/__tests__/heroScene.test.ts
git commit -m "feat(hardware): hero three.js scene with the ring model and hanging clip"
```
(If you extracted helper files, add them to the `git add`.)

---

### Task 6: `HeroDevices` — React wrapper with the drawn-art fallback layer

**Files:**
- Create: `src/components/hardware/HeroDevices.tsx`
- Test: `src/components/hardware/__tests__/HeroDevices.test.tsx` (`// @vitest-environment jsdom` first line; `afterEach(cleanup)`)

**Interfaces:**
- Consumes: `RingArt`, `ClipArt` (`./DeviceArt`, Task 2 restored the clip heartbeat); `createHeroScene`/`HeroSceneHandle` from `./scene/heroScene` (dynamic import only).
- Produces: `export function HeroDevices()` (no props; fills its parent: `width:100%; height:100%; position:relative`). Task 8 renders it in the hero.

**Behavior (all covered by tests):**
1. First paint renders the drawn base layer: `RingArt` and `ClipArt` side by side (each in a flex child, `role="img"` names unchanged from `DeviceArt`), container `position: relative`.
2. A scene layer `<div data-testid="hero-scene">` is absolutely positioned over the base (`inset: 0`), `opacity: 0` until the scene is ready, then `opacity: 1` with a 500 ms transition (no transition under reduced motion); the drawn layer stays mounted until the transition has finished (a 500 ms timer after `onReady`, immediately under reduced motion) and is then unmounted, so there is never a blank frame between the layers.
3. On mount: if WebGL is unavailable (`document.createElement('canvas').getContext('webgl2') || ...('webgl')` is null/throws) → state `failed`, no scene import; otherwise dynamically `import('./scene/heroScene')` and call `createHeroScene(sceneDiv, { ringUrl: '/models/r3-ring.stl', reducedMotion, onReady })`. `reducedMotion` comes from `window.matchMedia('(prefers-reduced-motion: reduce)')` (guard `matchMedia` undefined → false).
4. If the import or `createHeroScene` rejects → state `failed`: the scene layer is removed and the drawn layer stays.
5. Cleanup: on unmount call `handle.dispose()` if the handle exists; if the promise resolves AFTER unmount, dispose the late handle immediately and do not set state; never set state after unmount.
6. The scene layer is `aria-hidden="true"` (the drawn `role="img"` names stay the accessible description until the scene replaces them; after the scene is ready the container carries `role="img"` with `aria-label="R³ Ring and R³ Clip, interactive 3D view; drag to turn"`).

- [ ] **Step 1: Write the failing tests** with `vi.mock('../scene/heroScene', ...)` returning controllable fakes: drawn layer present at first paint with both art names and the scene layer at opacity 0; calling the captured `onReady` makes the scene layer opacity 1 and (with fake timers advanced 500 ms) the drawn layer unmounts; reduced motion (stub `matchMedia`) passes `reducedMotion: true` and unmounts the drawn layer immediately on ready; a rejected `createHeroScene` keeps the drawn layer and removes the scene layer; a rejected dynamic import behaves the same; WebGL unavailable (stub `HTMLCanvasElement.prototype.getContext` to return null) never calls `createHeroScene`; unmount calls the handle's `dispose`; a promise that resolves after unmount triggers `dispose` on the late handle and produces no React warning; `ringUrl` is `/models/r3-ring.stl`.
- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/components/hardware/__tests__/HeroDevices.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass** — same command — Expected: PASS, pristine (no act warnings).
- [ ] **Step 5: Commit**

```bash
git add src/components/hardware/HeroDevices.tsx src/components/hardware/__tests__/HeroDevices.test.tsx
git commit -m "feat(hardware): HeroDevices wrapper with drawn-art fallback layer"
```

---

### Task 7: Full-bleed hero — shared goal words, background hook, and `HardwareHero` rewrite

**Files:**
- Create: `src/config/goalWords.ts` (exports `GOAL_WORDS`)
- Modify: `src/components/HeroSection.tsx` (ONLY: delete its local `GOAL_WORDS` constant (line ~64) and `import { GOAL_WORDS } from "../config/goalWords";`; change nothing else in the homepage hero)
- Create: `src/hooks/useHeroBackground.ts`
- Modify (rewrite): `src/components/hardware/HardwareHero.tsx`
- Test: `src/components/hardware/__tests__/HardwareHero.test.tsx` (jsdom; `afterEach(cleanup)`)
- Modify: `src/components/hardware/__tests__/HardwarePage.test.tsx` (MINIMAL edits so the existing page suite stays green with the new hero: see Step 1)

**Interfaces:**
- Produces: `GOAL_WORDS: string[]` with exactly the homepage's eight words in the same order (`["weight loss", "clearer skin", "lean muscle", "more energy", "better sleep", "gut health", "healthy kids", "longevity"]`).
- Produces: `useHeroBackground(): { reduceMotion: boolean; backgroundVideos: string[] }` — replicate, from `HeroSection.tsx` (read it; do not change it), the `prefers-reduced-motion` detection and the video-layer gating (no video under reduced motion, `saveData`, 2g or a narrow viewport with a slow connection) and the delayed (≈ 600 ms) fetch of the produce clips from `catalog_ingredients` through the Supabase REST endpoint using `projectId`/`publicAnonKey` from `src/utils/supabase/info` (fruit/vegetable `video_url`s, shuffled, at most 10); a failed fetch leaves `backgroundVideos` empty (the poster remains).
- Consumes: `HeroDevices` (Task 6), `PreorderBlock` (existing; Task 8 adds its `variant` prop — until then render it with no props), `FlutedGlassBackground` from `../FlutedGlassBackground` (props `videos`, `poster`, `style`), the homepage poster asset `import heroPoster from "../../assets/5f38caf68dd6b8af22362056b70854ea4cf4b933.png"`, `ed`/`DISPLAY`/`GRO`/`coverStyle`/`deckStyle`/`folioStyle` from the editorial theme.

**`HardwareHero` behavior:**
1. `<section id="hardware-hero" aria-labelledby="hardware-hero-title">`, `min-height: 100svh` (fall back to `100vh`), `position: relative`, `overflow: hidden`, padding like the homepage hero (`clamp` top ≈ 88-104px to clear the fixed header).
2. Background layers (all `aria-hidden="true"`, absolutely positioned behind the content): the poster `<img>` (fade in on load, object-fit cover, same filter as the homepage), `FlutedGlassBackground` when `backgroundVideos.length > 0` and not reduced motion, the same warm tint and grain overlay as `HeroSection.tsx` (copy those two overlay divs' styles).
3. Content grid (two columns ≥ 801px: left text + preorder, right devices; single column below): top folio line "R³ hardware · first batch"; `<h1 id="hardware-hero-title">` with two block spans: "Track a routine" and `for ` + an italic span showing `GOAL_WORDS[index]` that fades out and in and advances to the next word on a timer (use the same interval and fade timing `HeroSection.tsx` uses; read them from that file). Under reduced motion there is no rotation and no fade, and the word stays `GOAL_WORDS[0]`; the exact deck from the Global Constraints; then `<PreorderBlock />` (inside a `<div id="hero-preorder">` wrapper — NOT `id="preorder"` yet: the old lower `#preorder` section still exists until Task 9, which renames this wrapper to `preorder` and removes the lower section); the right column renders `<HeroDevices />` in a container of aspect-ratio `4 / 5` (min-height 420px) on desktop and `1 / 1` (max-height 52svh) on mobile.
4. Exactly one `<h1>`. Text colours follow the homepage hero (white headline with the same text-shadow, `ed.ink` italic word and deck).
5. Clean up all timers/listeners on unmount; the rotating word timer uses a single interval.

- [ ] **Step 1: Write the failing tests.** Mock `../HeroDevices` (a stub div `data-testid="devices"`), `../PreorderBlock` (a stub with a button "Continue to payment"), `../../FlutedGlassBackground` (stub div `data-testid="fluted"`), and `../../../hooks/useHeroBackground` (controllable return). Assert: there is exactly one `h1`; its first line is "Track a routine" and, before any timer fires, its second line reads "for weight loss" (index 0 of `GOAL_WORDS`); with fake timers advanced by the interval the word advances through `GOAL_WORDS` in order and wraps from the last word back to the first; with `reduceMotion: true` it never advances; the exact deck sentence is present; `#hero-preorder` exists and contains the stub payment button exactly once; `data-testid="devices"` present; the poster `<img>` has `aria-hidden` and is not announced; `fluted` renders only when `backgroundVideos` is non-empty and `reduceMotion` is false; the section's `aria-labelledby` resolves; the folio text is present. Also a separate `useHeroBackground` test (`src/hooks/__tests__/useHeroBackground.test.tsx` with `renderHook`): under reduced-motion `matchMedia` it never fetches and returns `reduceMotion: true`; with `saveData` it does not fetch; otherwise after advancing timers it fetches once and returns at most 10 URLs; a failing fetch yields `[]`; and a test that `GOAL_WORDS` equals the eight homepage words in order and `HeroSection.tsx` no longer defines its own copy (read the file with `fs` and assert it imports from `../config/goalWords`).
  Also make these MINIMAL edits to the existing `HardwarePage.test.tsx` so the page suite is green after the hero rewrite (Task 9 finalises the page tests): add mocks `vi.mock('../HeroDevices', ...)` (stub), `vi.mock('../../FlutedGlassBackground', ...)` (stub) and `vi.mock('../../../hooks/useHeroBackground', () => ({ useHeroBackground: () => ({ reduceMotion: true, backgroundVideos: [] }) }))`; delete the now-unused `registerModelViewer` mock only if nothing else needs it (RingViewer still exists until Task 9 but is no longer imported by the hero); change the h1 assertion from "Track your routine without lifting a finger." to the new two-line headline (first line "Track a routine"); delete the assertion that the two hero anchor links "Reserve the R³ Ring — $179" / "Ring + Clip — $299" with `href="#preorder"` exist (the hero no longer renders them); keep every other assertion, including the lower `#preorder` section tests and the exact price set (the lower PreorderBlock still renders the prices and the hero's PreorderBlock renders them too: relax any "exactly one" assumption about the price buttons only if a test depends on it, and say so in your report).
- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/components/hardware/__tests__/HardwareHero.test.tsx src/hooks/__tests__/useHeroBackground.test.tsx src/components/hardware/__tests__/HardwarePage.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `goalWords.ts`, the one-line `HeroSection.tsx` change, `useHeroBackground.ts` and the hero rewrite.
- [ ] **Step 4: Run to verify they pass** — same command — Expected: PASS, pristine.
- [ ] **Step 5: Commit**

```bash
git add src/config/goalWords.ts src/components/HeroSection.tsx src/hooks/useHeroBackground.ts src/hooks/__tests__/useHeroBackground.test.tsx src/components/hardware/HardwareHero.tsx src/components/hardware/__tests__/HardwareHero.test.tsx src/components/hardware/__tests__/HardwarePage.test.tsx
git commit -m "feat(hardware): full-bleed video hero with rotating goal word and both devices"
```

---

### Task 8: `PreorderBlock` hero variant (styling only)

**Files:**
- Modify: `src/components/hardware/PreorderBlock.tsx`
- Modify: `src/components/hardware/__tests__/PreorderBlock.test.tsx`

**Interfaces:**
- Produces: `PreorderBlock` gains an optional prop `variant?: 'section' | 'hero'` (default `'section'`, so every existing caller and test is unchanged). Task 7's hero passes `variant="hero"`.

**Behavior:**
1. With `variant="hero"` the root element is a frosted glass card: `background: rgba(16, 17, 15, 0.78)`, `backdrop-filter: blur(14px)` (and `WebkitBackdropFilter`), `border: 1px solid rgba(255,255,255,0.14)`, padding `clamp(18px, 2.4vw, 28px)`, `max-width: 560px`, and `data-variant="hero"` on the root; with the default variant the root is exactly as today and carries `data-variant="section"`.
2. NO logic, copy, handler, state or accessibility changes: all text, roles, labels, disabled states, the closed-batch notice, the two-step flow, the busy/charged guards and the backer bar behave identically in both variants.
3. In the hero variant the container that hosts the Stripe payment element keeps a minimum height (≈ 280px) so the card does not jump while the element loads.

- [ ] **Step 1: Write the failing tests** (add to `PreorderBlock.test.tsx`; all existing tests must still pass unchanged): default render has `data-variant="section"`; `variant="hero"` renders `data-variant="hero"` with the glass card inline styles (`backgroundColor` contains `0.78`, `maxWidth` 560px); the full happy path (details → payment → paid) still works in the hero variant (reuse the existing happy-path helper with `variant="hero"`) and shows the same success text; the closed-batch notice still disables the form in the hero variant.
- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/components/hardware/__tests__/PreorderBlock.test.tsx` — Expected: FAIL (new cases).
- [ ] **Step 3: Implement** (derive styles from the variant; do not duplicate JSX).
- [ ] **Step 4: Run to verify they pass** — same command — Expected: PASS (all old and new), pristine.
- [ ] **Step 5: Commit**

```bash
git add src/components/hardware/PreorderBlock.tsx src/components/hardware/__tests__/PreorderBlock.test.tsx
git commit -m "feat(hardware): preorder block hero variant (styling only)"
```

---

### Task 9: Assemble the page, switch the hero to the hero variant, and remove the old viewer

**Files:**
- Modify: `src/components/hardware/HardwareHero.tsx` (pass `variant="hero"` to `PreorderBlock`)
- Modify: `src/components/hardware/HardwarePage.tsx`
- Modify: `src/components/hardware/__tests__/HardwarePage.test.tsx`
- Delete: `src/components/hardware/RingViewer.tsx`, `src/components/hardware/registerModelViewer.ts`, `src/components/hardware/model-viewer.d.ts`, `src/components/hardware/__tests__/RingViewer.test.tsx`
- Modify: `package.json`, `package-lock.json` (remove `@google/model-viewer` ONLY, with `npm uninstall @google/model-viewer --package-lock-only`; keep `three`)

**Behavior of the assembled page:**
1. Order: `HardwareHero` (contains the preorder; this is the only checkout on the page), then `HowItWorks`, `DevicePair`, `AiAssistant`, `SpecSheet`, then a short closing band: `<section aria-labelledby="hardware-closing-title">` with `<h2 id="hardware-closing-title">` "Ready when you are." and one anchor `<a href="#preorder">` with text `Reserve the R³ Ring — $179` (price via `formatUsd(PRODUCTS.ring.priceCents)`), styled like the hero's primary button. Remove the old lower `#preorder` section and its `scrollMarginTop` style, and rename the hero's wrapper from `id="hero-preorder"` to `id="preorder"` (the id now lives on the hero's wrapper; give THAT wrapper `scrollMarginTop: 'calc(64px + 64px + 16px)'`; update `HardwareHero.test.tsx` for the rename).
2. The page still has exactly one `<h1>` (the hero's), no `<main>`/`header`/`footer` landmark, root `<div id="hardware-page">`.
3. No component under `src/` imports `RingViewer`, `registerModelViewer` or `@google/model-viewer` (grep proves it); `package.json` no longer lists `@google/model-viewer`; `three` stays.

- [ ] **Step 1: Update the page tests first** (they must fail on the current code): one `h1` whose text starts "Track a routine"; the "Reserve your early-backer price" heading no longer exists; exactly ONE "Continue to payment" button on the whole page; `#preorder` exists once and sits inside `#hardware-hero`; the closing band link has `href="#preorder"` and the exact text; the earlier assertions that still apply (headings "How it works", "Two devices, one routine", "A personal assistant for your routine", "Specifications"; exact price set `['$179','$199','$299','$349']`; no `main`/`footer`/`banner` inside; distinct SVG ids; no 'Note'/'Heart' device names (narrow the existing guard in `HardwarePage.test.tsx` from `/\bHeart\b/` to `/\bHeart\b(?!\s+rate)/` so the legitimate spec row "Heart rate" can never trip it); "touch", "slide", "necklace", "watch", "routine", "calendar", "email" present; no "email you") stay and must pass; mock `../HeroDevices`, `../../FlutedGlassBackground` and `../registerModelViewer` is no longer needed (delete that mock) while mocking `../../../hooks/useHeroBackground` to `{ reduceMotion: true, backgroundVideos: [] }`; add a source-level test (read files with `fs`) asserting no file under `src/` imports `RingViewer`/`registerModelViewer`/`@google/model-viewer` and that `package.json` has no `@google/model-viewer`.
- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/components/hardware/__tests__/HardwarePage.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the page assembly, the `variant="hero"` pass-through, the deletions, and the package change (`npm uninstall @google/model-viewer --package-lock-only` is the only npm command allowed, and only while `node_modules` is NOT symlinked; verify with `git diff --stat package.json package-lock.json` that only model-viewer and its now-unused transitive packages left the lock and `three` stayed).
- [ ] **Step 4: Run to verify they pass** — `npx vitest run src/components/hardware src/components/__tests__/HardwarePreorderTeaser.test.tsx src/hooks/__tests__` — Expected: PASS, pristine.
- [ ] **Step 5: Commit**

```bash
git add -A src/components/hardware package.json package-lock.json
git commit -m "feat(hardware): one-hero /ring page; remove the model-viewer component"
```
(`git add -A` is allowed here ONLY for the paths shown, to record the deletions; check `git status --short` first and stage nothing else.)

---

## Self-Review

**Spec coverage:** one full-bleed hero (T7, T9), homepage-style headline with rotating word (T7), both devices in 3D (T5, T6), owner's ring model (T1, T5), clip hanging as a flipping necklace with heartbeat (T3, T4, T5), preorder in the hero (T7, T8, T9), fallback chain (T6), heart-rate fact (T2), model-viewer removal (T9). Out-of-scope items listed in the spec stay out.
**Type consistency:** `buildClip(options) → ClipModel { group, screen, dispose }` (T4) is consumed in T5; `createHeroScene(container, { ringUrl, reducedMotion, onReady }) → { dispose }` (T5) is consumed in T6; `HeroDevices()` (T6) and `PreorderBlock variant` (T8) are consumed in T7/T9; `GOAL_WORDS` (T7) shared with `HeroSection`.
**Placeholders:** none; the ported Pod Plan geometry is specified by source location and observable properties, with a smoke test.
