# R³ /ring hero redesign — design addendum

**Date:** 2026-10-31
**Branch:** `claude/kickstarter-preorder-ring-81a286` (builds on `d4168d3`)
**Supersedes (for the top of `/ring` only):** §3.2 of `2026-10-31-r3-hardware-preorder-design.md` (separate hero + separate preorder section). Everything else in that spec stands.

## 1. What the owner asked for

> "update the preorder section, review best preorder websites and make it one hero section, full-bleed video, and both devices, like the same home screen 'Track a routine for …' … and use the 3D model I gave for the ring and clip, in the clip flip as a necklace with a heartbeat."

Decisions confirmed by the owner (2026-10-31):
- **Video:** same as the homepage hero (poster + looping clip layer through the fluted-glass shader, warm tint). No new video asset; the owner may supply a product video later.
- **Clip 3D model:** rebuilt from the owner's Pod Plan artifact (procedural three.js pod), because only the ring file was supplied.
- **Preorder:** built into the hero (product toggle, email, continue, backer bar, terms, then the card panel), not a separate section.

## 2. Research findings that shape the design (honest scope)

Fetched: Oura (homepage), Ultrahuman (homepage). Blocked: Plaud (429), Kickstarter (403). Search results were generic templates and guidance, not brand teardowns.
- One goal, one primary action above the fold (Oura: headline + one subline + one CTA; Ultrahuman: video hero + Buy / Explore).
- Lifestyle imagery or video leads; specs, press and reviews sit below the fold.
- Preorder pages should say plainly that it is a preorder, give the ship window, and be transparent about delivery risk (already in `PREORDER_TERMS`).
- Camera wearables need privacy reassurance visible early (reviewers of AI pendants are openly skeptical): the physical slider and red LED must be easy to find, not buried in specs.
- No usable data was found on progress bars or tiers; none is claimed.

## 3. Design

### 3.1 The hero (`HardwareHero`)
One full-viewport section in the homepage hero's visual language:
- **Background:** the homepage poster image + `FlutedGlassBackground` fed with the same produce clips (gated exactly as the homepage: not under reduced motion, save-data or very slow connections), the same warm tint and grain.
- **Headline:** white serif, two lines: "Track a routine" / "for *{goal}*" with the italic goal word rotating through the homepage's `GOAL_WORDS`. Deck: "Touch or slide the R³ Ring to control the R³ Clip's camera, record a voice note, or hand a request to your AI assistant." (owner-confirmed wording).
- **Preorder panel (left, under the deck):** a frosted dark glass card containing the existing `PreorderBlock` (variant `hero`): product toggle, "Campaign ends …", email, "Continue to payment", backer bar, terms. Card entry replaces the form inside the same card. The reviewed logic is unchanged; only container styling differs.
- **Devices stage (right):** a live 3D scene with both devices (§3.2); drag to turn.
- No second preorder section lower on the page (a closing band links back to the hero panel).
- Mobile (≤ 800px): single column; devices stage above the panel at reduced height.

### 3.2 The 3D scene (three.js, `scene/` modules)
- **Ring:** the owner's Meshy STL, reduced by a dependency-free Node script (`scripts/decimate-stl.mjs`, vertex clustering to ≤ ~40k triangles, ≤ 2 MB) into `public/models/r3-ring.stl`, loaded with `STLLoader`, vertex-merged and smooth-shaded, centred and normalised. No Blender needed.
- **Clip:** the Pod Plan's procedural pod (diamond/octagon body, one crystal face, the big round button, camera at the top corner, etched back) ported to TypeScript, hanging from a cord as a **necklace**. It slowly **flips** (front → back → front) with a small pendulum swing; the front crystal shows a **heartbeat** line that animates (canvas texture).
- **Rendering:** transparent canvas over the video, `RoomEnvironment` image-based lighting, pixel ratio capped at 2, render loop paused when off-screen or the tab is hidden, reduced-motion = no auto-motion (static front view, static heartbeat frame), full disposal on unmount.
- **Fallback chain:** drawn `RingArt` + `ClipArt` (with the heartbeat line restored) are the base layer from first paint; the live scene fades in only when ready; WebGL missing or any scene error leaves the drawings (never a blank hero).

### 3.3 Copy and facts
- No invented facts. The heartbeat is shown because the owner's Pod Plan spec sheet lists heart rate; the spec table gains one row "Tracks: Heart rate" under the existing "Planned specifications" notice. (Correction: the earlier removal of the heartbeat from the clip drawing was over-cautious.)
- Prices/terms only from `copy.ts` (`PRODUCTS`, `PREORDER_TERMS`, `SHIP_WINDOW`, `BATCH_GOAL`).

## 4. Dependencies and environment
- `three@^0.169.0` is already declared in `package.json` (added during the viewer task); `@google/model-viewer` is removed (its Task 11 component and registration module are deleted; the new scene replaces them).
- `three` is not installed in the repo's `node_modules` on this machine. Tests and the local preview use an overlay directory that links the existing packages and adds `three` (scratchpad `nm-overlay`); the owner's real `npm ci` installs it.
- The three.js code lives only under `src/components/hardware/scene/` and is imported dynamically by `HeroDevices`, so the rest of the page (and its tests) never loads three.

## 5. Out of scope
- A product video (owner swaps one in later), the owner-run Blender workflow (no longer needed), the header nav link, and the public-`/ring`-in-test-mode gate (separate owner decision).

## 6. Risks
- A decimated Meshy STL may look faceted: the script keeps a tunable cell count and the scene smooths normals; verified visually in the preview.
- Two WebGL contexts (fluted-glass shader + scene) on weaker devices: the homepage's gating already skips the video layer on slow connections; the scene pauses off-screen.
- The ported Pod Plan geometry targets three 0.160; the repo declares 0.169; any API drift is fixed during the port and covered by a smoke test.
